//! Persisted identity policy shared by all credentials. Lock order: policy, player.
use crate::{
    ordering::{Tx, now},
    *,
};
use orbit_application::*;
use sqlx::Row;

pub(crate) async fn lock_bot(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
) -> Result<Option<sqlx::postgres::PgRow>, StoreError> {
    // A no-value-change UPDATE is an MVCC serialization fence for metered
    // repeatable-read observations. It stores no counters or derived state.
    // Policy SHARE precedes the player lock, including cap application and retirement.
    sqlx::query("SELECT universe FROM universe_policies_v2 WHERE universe=$1 FOR SHARE")
        .bind(u.0)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query(
        "UPDATE bot_participation SET player=player WHERE universe=$1 AND player=$2 RETURNING *",
    )
    .bind(u.0)
    .bind(player.0)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)
}
async fn policy(tx: &mut Tx<'_>, u: UniverseId) -> Result<(i64, BotPolicy), StoreError> {
    let (revision, p): (i64, sqlx::types::Json<BotPolicy>) =
        sqlx::query_as("SELECT revision,bots FROM universe_policies_v2 WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
    p.validate().map_err(|_| StoreError::UnsupportedState)?;
    Ok((revision, p.0))
}
fn check(row: &sqlx::postgres::PgRow, p: &BotPolicy, at: i64) -> Result<u16, StoreError> {
    if row
        .try_get::<Option<i64>, _>("retired_at")
        .map_err(db_error)?
        .is_some()
    {
        return Err(BotDenialCode::BotRetired.denied(None));
    }
    if !p.enabled {
        return Err(BotDenialCode::BotsDisabled.denied(None));
    }
    let sleep = row
        .try_get::<i32, _>("sleep_start_utc_minute")
        .map_err(db_error)? as u16;
    let awake = bot_awake_at(at, sleep);
    if awake > at {
        return Err(BotDenialCode::BotSleeping.denied(Some(awake)));
    }
    Ok(sleep)
}
/// Admission transaction holds the player lock until the operation and charge commit.
pub(crate) async fn charge(
    tx: &mut Tx<'_>,
    b: Binding,
    category: &str,
    id: uuid::Uuid,
    units: bool,
) -> Result<(), StoreError> {
    let Some(row) = lock_bot(tx, b.universe, b.player).await? else {
        return Ok(());
    };
    let at = now(tx).await?;
    let (_, p) = policy(tx, b.universe).await?;
    let sleep = check(&row, &p, at)?;
    if !units {
        return Ok(());
    }
    let (used, _oldest): (i64, Option<i64>) = sqlx::query_as(
        "SELECT count(*),min(at_ms) FROM bot_activity WHERE universe=$1 AND player=$2 AND at_ms>$3 AND at_ms<=$3+86400000",
    )
    .bind(b.universe.0)
    .bind(b.player.0)
    .bind(at - BOT_DAY_MS)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    if used >= i64::from(p.action_units_per_24h.ok_or(StoreError::CorruptData)?) {
        let eligible =
            allowance_reopens(tx, b, at, used, i64::from(p.action_units_per_24h.unwrap())).await?;
        return Err(
            BotDenialCode::BotBudgetExhausted.denied(eligible.map(|t| bot_awake_at(t, sleep)))
        );
    }
    sqlx::query("INSERT INTO bot_activity(universe,player,epoch,category,request_id,at_ms) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(b.universe.0).bind(b.player.0).bind(b.epoch.0).bind(category).bind(id).bind(at).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
/// Read-only gate for observation transactions; technical contact never records presence.
pub(crate) async fn observe(tx: &mut Tx<'_>, b: Binding) -> Result<(), StoreError> {
    let row = sqlx::query("SELECT * FROM bot_participation WHERE universe=$1 AND player=$2")
        .bind(b.universe.0)
        .bind(b.player.0)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?;
    if let Some(row) = row {
        let (_, p) = policy(tx, b.universe).await?;
        let at = now(tx).await?;
        check(&row, &p, at)?;
    }
    Ok(())
}
pub(crate) async fn admission(tx: &mut Tx<'_>, u: UniverseId) -> Result<(), StoreError> {
    sqlx::query("SELECT universe FROM universe_policies_v2 WHERE universe=$1 FOR UPDATE")
        .bind(u.0)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    let (_, p) = policy(tx, u).await?;
    if !p.enabled {
        return Err(BotDenialCode::BotsDisabled.denied(None));
    }
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM bot_participation WHERE universe=$1 AND retired_at IS NULL",
    )
    .bind(u.0)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    if count >= i64::from(p.max_active) {
        return Err(BotDenialCode::BotCapacityReached.denied(None));
    }
    Ok(())
}
pub(crate) async fn enroll(
    tx: &mut Tx<'_>,
    b: Binding,
    sleep: u16,
    at: i64,
) -> Result<(), StoreError> {
    sqlx::query("INSERT INTO bot_participation(universe,player,account,admitted_at,sleep_start_utc_minute) VALUES($1,$2,$3,$4,$5)")
        .bind(b.universe.0).bind(b.player.0).bind(b.account.0).bind(at).bind(i32::from(sleep)).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
async fn retire(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
    reason: &str,
    revision: Option<i64>,
) -> Result<(), StoreError> {
    if reason.trim().is_empty() || reason.len() > 1000 {
        return Err(StoreError::Conflict);
    }
    let at = now(tx).await?;
    sqlx::query("WITH changed AS (UPDATE bot_participation SET retired_at=$3,retirement_reason=$4 WHERE universe=$1 AND player=$2 AND retired_at IS NULL RETURNING universe,player,retired_at,retirement_reason) INSERT INTO bot_retirements SELECT universe,player,retired_at,retirement_reason,$5 FROM changed")
        .bind(u.0).bind(player.0).bind(at).bind(reason).bind(revision).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("SELECT pg_notify('orbit_game_updates','account:'||account::text) FROM bot_participation WHERE universe=$1 AND player=$2").bind(u.0).bind(player.0).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
pub(crate) async fn enforce_cap(
    tx: &mut Tx<'_>,
    u: UniverseId,
    p: &BotPolicy,
    revision: i64,
) -> Result<(), StoreError> {
    let players:Vec<uuid::Uuid>=sqlx::query_scalar("SELECT player FROM bot_participation WHERE universe=$1 AND retired_at IS NULL ORDER BY admitted_at ASC,admission_order ASC OFFSET $2 FOR UPDATE")
        .bind(u.0).bind(i64::from(p.max_active)).fetch_all(&mut **tx).await.map_err(db_error)?;
    for player in players {
        retire(
            tx,
            u,
            PlayerId(player),
            "active bot cap reduced",
            Some(revision),
        )
        .await?;
    }
    Ok(())
}
impl PgStore {
    pub async fn create_bot(
        &self,
        universe: UniverseId,
        name: &str,
        sleep: u16,
    ) -> Result<Binding, StoreError> {
        if sleep >= 1440
            || name.trim().is_empty()
            || name.len() > 80
            || name.chars().any(char::is_control)
        {
            return Err(StoreError::Conflict);
        }
        let result = self
            .enroll_machine(
                Registration {
                    name: name.trim().to_lowercase(),
                    password_hash: "!machine".into(),
                    policy: SignupPolicy {
                        universe,
                        max_players: u32::MAX,
                    },
                    digest: String::new(),
                    csrf: String::new(),
                    previous: None,
                },
                sleep,
            )
            .await?;
        self.current_binding(result.account, universe)
            .await
            .map(|(b, _)| b)
    }
    pub async fn mark_bot(
        &self,
        u: UniverseId,
        player: PlayerId,
        sleep: u16,
    ) -> Result<(), StoreError> {
        if sleep >= 1440 {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        sqlx::query("SELECT universe FROM universe_policies_v2 WHERE universe=$1 FOR UPDATE")
            .bind(u.0)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        if let Some(row) = lock_bot(&mut tx, u, player).await? {
            if row
                .try_get::<i32, _>("sleep_start_utc_minute")
                .map_err(db_error)?
                != i32::from(sleep)
            {
                return Err(StoreError::Conflict);
            }
            return Ok(());
        }
        admission(&mut tx, u).await?;
        let account: uuid::Uuid = sqlx::query_scalar(
            "SELECT account FROM universe_memberships WHERE universe=$1 AND player=$2",
        )
        .bind(u.0)
        .bind(player.0)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)?;
        let at = now(&mut tx).await?;
        let b = crate::binding::current_read(&mut tx, AccountId(account), u).await?;
        enroll(&mut tx, b, sleep, at).await?;
        tx.commit().await.map_err(db_error)
    }
    pub async fn issue_bot_token(
        &self,
        u: UniverseId,
        player: PlayerId,
    ) -> Result<String, StoreError> {
        let token = unbought_auth::random_secret();
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        let row = lock_bot(&mut tx, u, player)
            .await?
            .ok_or(StoreError::NotFound)?;
        let at = now(&mut tx).await?;
        sqlx::query("INSERT INTO bot_tokens(digest,universe,player,account,issued_at) VALUES($1,$2,$3,$4,$5)")
            .bind(token_digest(&token)).bind(u.0).bind(player.0).bind(row.try_get::<uuid::Uuid,_>("account").map_err(db_error)?).bind(at).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(token)
    }
    pub async fn revoke_bot_tokens(
        &self,
        u: UniverseId,
        player: PlayerId,
    ) -> Result<(), StoreError> {
        sqlx::query("UPDATE bot_tokens SET revoked_at=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE universe=$1 AND player=$2 AND revoked_at IS NULL").bind(u.0).bind(player.0).execute(self.admission_pool()?).await.map_err(db_error)?;
        Ok(())
    }
    pub(crate) async fn machine_session(
        &self,
        digest: &str,
    ) -> Result<Option<AuthenticatedSession>, StoreError> {
        let row=sqlx::query("SELECT t.account,t.player,t.universe,u.name FROM bot_tokens t JOIN universe_memberships m ON (m.universe,m.player,m.account)=(t.universe,t.player,t.account) JOIN universes u ON u.id=t.universe WHERE digest=$1 AND revoked_at IS NULL").bind(digest).fetch_optional(self.read_pool()?).await.map_err(db_error)?;
        row.map(|r| {
            Ok(AuthenticatedSession {
                account: AccountId(r.try_get("account").map_err(db_error)?),
                csrf: String::new(),
                expires_at: i64::MAX,
                memberships: vec![Membership {
                    universe: UniverseId(r.try_get("universe").map_err(db_error)?),
                    player: PlayerId(r.try_get("player").map_err(db_error)?),
                    universe_name: r.try_get("name").map_err(db_error)?,
                }],
            })
        })
        .transpose()
    }
    pub async fn retire_bot_player(
        &self,
        u: UniverseId,
        player: PlayerId,
        reason: &str,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        lock_bot(&mut tx, u, player)
            .await?
            .ok_or(StoreError::NotFound)?;
        retire(&mut tx, u, player, reason, None).await?;
        tx.commit().await.map_err(db_error)
    }
    pub(crate) async fn read_bot_status(&self, p: Principal) -> Result<BotStatus, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let binding = crate::binding::current_read(&mut tx, p.account, p.universe).await?;
        if binding.player != p.player {
            return Err(StoreError::NotFound);
        }
        let row = sqlx::query("SELECT * FROM bot_participation WHERE universe=$1 AND player=$2")
            .bind(p.universe.0)
            .bind(p.player.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        let (revision, policy) = policy(&mut tx, p.universe).await?;
        let at = now(&mut tx).await?;
        let sleep = row
            .try_get::<i32, _>("sleep_start_utc_minute")
            .map_err(db_error)? as u16;
        let (used, _oldest):(i64,Option<i64>)=sqlx::query_as("SELECT count(*),min(at_ms) FROM bot_activity WHERE universe=$1 AND player=$2 AND at_ms>$3 AND at_ms<=$3+86400000").bind(p.universe.0).bind(p.player.0).bind(at-BOT_DAY_MS).fetch_one(&mut *tx).await.map_err(db_error)?;
        let retired_at: Option<i64> = row.try_get("retired_at").map_err(db_error)?;
        let available = i64::from(policy.action_units_per_24h.unwrap_or(0))
            .saturating_sub(used)
            .max(0) as u64;
        let next = if retired_at.is_some() || !policy.enabled {
            None
        } else {
            Some(bot_awake_at(
                if available == 0 {
                    allowance_reopens(
                        &mut tx,
                        binding,
                        at,
                        used,
                        i64::from(policy.action_units_per_24h.unwrap_or(0)),
                    )
                    .await?
                    .unwrap_or(at)
                } else {
                    at
                },
                sleep,
            ))
        };
        let (sleep_start, sleep_end) = bot_sleep_interval(at, sleep);
        Ok(BotStatus {
            binding,
            policy_revision: revision,
            policy,
            state: if retired_at.is_some() {
                "retired"
            } else {
                "active"
            }
            .into(),
            retired_at,
            retirement_reason: row.try_get("retirement_reason").map_err(db_error)?,
            sleep_start_utc_minute: sleep,
            sleep_start,
            sleep_end,
            allowance_used: used as u64,
            allowance_available: available,
            next_eligible_at: next,
        })
    }
}

impl PgStore {
    pub(crate) async fn machine_world_query(
        &self,
        q: WorldQuery,
    ) -> Result<Option<ReadSnapshot<BoundWorld<serde_json::Value>>>, StoreError> {
        // Classification reads belong to the read pool. The actual unmetered
        // snapshot rechecks identity, so concurrent marking cannot bypass charging.
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        crate::binding::check_read(&mut tx, q.context.binding).await?;
        let bot = is_bot(&mut tx, q.context.binding).await?;
        if !bot || matches!(q.query, WorldQueryKind::FleetQuote { .. }) {
            return Ok(None);
        }
        tx.commit().await.map_err(db_error)?;
        for _ in 0..8 {
            match self.machine_world_query_once(q.clone()).await {
                Err(StoreError::SnapshotRetry) => continue,
                result => return result,
            }
        }
        Err(StoreError::Unavailable)
    }
    async fn machine_world_query_once(
        &self,
        q: WorldQuery,
    ) -> Result<Option<ReadSnapshot<BoundWorld<serde_json::Value>>>, StoreError> {
        let b = q.context.binding;
        let mut tx = self.begin_unlocked(self.admission_pool()?).await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        crate::pools::world_edit_gate(&mut tx, false).await?;
        crate::binding::check_read(&mut tx, b).await?;
        if lock_bot(&mut tx, b.universe, b.player).await?.is_none() {
            return Ok(None);
        }
        observe(&mut tx, b).await?;
        let intent = orbit_engine::hash(&q).0;
        if let Some(row)=sqlx::query("SELECT intent_hash,response FROM bot_observations WHERE universe=$1 AND player=$2 AND epoch=$3 AND request_id=$4").bind(b.universe.0).bind(b.player.0).bind(b.epoch.0).bind(q.context.request_id).fetch_optional(&mut *tx).await.map_err(db_error)? {
            if row.try_get::<String,_>("intent_hash").map_err(db_error)?!=intent {return Err(StoreError::Conflict);}
            return row.try_get::<sqlx::types::Json<TacticalResult>,_>("response").map_err(db_error)?.0.map(Some).map_err(StoreError::GameRejected);
        }
        charge(&mut tx, b, "galaxy", q.context.request_id, true).await?;
        let ReadSnapshot {
            facts: (facts, rev),
            progress,
        } = self
            .world_snapshot_in_tx(&mut tx, b, Some(&q.query))
            .await?;
        let data: Result<serde_json::Value, orbit_engine::GameError> = match q.query {
            WorldQueryKind::Galaxy { galaxy, system } => match orbit_engine::galaxy_system(
                &facts.state,
                b.player,
                galaxy,
                system,
                facts.at,
                &facts.rules,
            ) {
                Ok(galaxy) => {
                    let ids: Vec<_> = galaxy
                        .positions
                        .iter()
                        .filter_map(|p| p.body.as_ref().map(|b| b.owner.0))
                        .collect();
                    let rows:Vec<(uuid::Uuid,String)>=sqlx::query_as("SELECT m.player,a.name FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1 AND m.player=ANY($2)").bind(b.universe.0).bind(ids).fetch_all(&mut *tx).await.map_err(db_error)?;
                    let names: PublicPlayerNames = rows
                        .into_iter()
                        .map(|(id, name)| (PlayerId(id), name))
                        .collect();
                    let mut data =
                        serde_json::to_value(galaxy).map_err(|_| StoreError::CorruptData)?;
                    data["player_names"] =
                        serde_json::to_value(names).map_err(|_| StoreError::CorruptData)?;
                    Ok(data)
                }
                Err(e) => Err(e),
            },
            WorldQueryKind::ResolveDestination { selection } => {
                orbit_engine::resolve_destination(&facts.state, selection, &facts.rules)
                    .map(|d| serde_json::to_value(d).expect("destination"))
            }
            WorldQueryKind::FleetQuote { .. } => unreachable!(),
        };
        let result: TacticalResult = data.map(|data| ReadSnapshot {
            progress,
            facts: BoundWorld {
                protocol: 4,
                binding: b,
                request_id: q.context.request_id,
                viewer_revision: rev.to_string(),
                sampled_at: facts.at,
                as_of_ms: facts.at,
                data,
            },
        });
        sqlx::query("INSERT INTO bot_observations(universe,player,epoch,request_id,intent_hash,response) VALUES($1,$2,$3,$4,$5,$6)").bind(b.universe.0).bind(b.player.0).bind(b.epoch.0).bind(q.context.request_id).bind(intent).bind(sqlx::types::Json(&result)).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        result.map(Some).map_err(StoreError::GameRejected)
    }
}

type TacticalResult = Result<ReadSnapshot<BoundWorld<serde_json::Value>>, orbit_engine::GameError>;
/// Coordinate-addressed quotes must reference a previously observed destination.
/// Otherwise colonization/harvest errors themselves become a free scanner.
pub(crate) async fn require_destination_observation(
    tx: &mut Tx<'_>,
    b: Binding,
    d: &orbit_engine::MissionDestination,
) -> Result<(), StoreError> {
    let bot: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM bot_participation WHERE universe=$1 AND player=$2)",
    )
    .bind(b.universe.0)
    .bind(b.player.0)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    if !bot {
        return Ok(());
    }
    if matches!(d, orbit_engine::MissionDestination::Body { .. }) {
        return Ok(());
    }
    // ReadSnapshot flattens facts into the successful response. Match the
    // retained destination exactly; an unobserved coordinate stays forbidden.
    let known:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM bot_observations WHERE universe=$1 AND player=$2 AND epoch=$3 AND response->'Ok'->'data'=$4)")
        .bind(b.universe.0).bind(b.player.0).bind(b.epoch.0).bind(sqlx::types::Json(d)).fetch_one(&mut **tx).await.map_err(db_error)?;
    if known {
        Ok(())
    } else {
        Err(StoreError::NotFound)
    }
}

async fn allowance_reopens(
    tx: &mut Tx<'_>,
    b: Binding,
    at: i64,
    used: i64,
    limit: i64,
) -> Result<Option<i64>, StoreError> {
    if limit <= 0 {
        return Ok(None);
    }
    sqlx::query_scalar("SELECT at_ms+$4 FROM bot_activity WHERE universe=$1 AND player=$2 AND at_ms>$3 AND at_ms<=$3+$4 ORDER BY at_ms OFFSET $5 LIMIT 1")
        .bind(b.universe.0).bind(b.player.0).bind(at-BOT_DAY_MS).bind(BOT_DAY_MS).bind((used-limit).max(0)).fetch_optional(&mut **tx).await.map_err(db_error)
}

/// Match the engine's body-specific participation contract without asking clients
/// to manufacture a browser gesture. Called after receipt recovery inside admission.
pub(crate) async fn participation_body(
    tx: &mut Tx<'_>,
    b: Binding,
    c: &Command,
) -> Result<Option<BodyId>, StoreError> {
    use orbit_engine::WorldAction;
    match c {
        Command::SetProduction{body,..}|Command::StartUpgrade{body,..}|Command::StartDemolition{body,..}|Command::StartManufacture{body,..}=>Ok(Some(*body)),
        Command::StartResearch{host,..}=>Ok(Some(*host)),
        Command::World{action:WorldAction::RenamePlanet{body,..}}=>Ok(Some(*body)),
        Command::World{action:WorldAction::LaunchFleet{intent,..}}=>Ok(Some(intent.origin)),
        Command::CancelConstruction{operation}=>sqlx::query_scalar::<_,uuid::Uuid>("SELECT body FROM constructions WHERE universe=$1 AND id=$2 AND owner=$3").bind(b.universe.0).bind(operation.0).bind(b.player.0).fetch_optional(&mut **tx).await.map(|id|id.map(BodyId)).map_err(db_error),
        Command::CancelResearch{operation}=>sqlx::query_scalar::<_,uuid::Uuid>("SELECT body FROM research_operations WHERE universe=$1 AND id=$2 AND owner=$3").bind(b.universe.0).bind(operation.0).bind(b.player.0).fetch_optional(&mut **tx).await.map(|id|id.map(BodyId)).map_err(db_error),
        Command::World{action:WorldAction::RecallMission{fleet}}=>sqlx::query_scalar::<_,serde_json::Value>("SELECT data->'intent'->'origin' FROM mission_fleets WHERE universe=$1 AND id=$2 AND owner=$3").bind(b.universe.0).bind(fleet.0).bind(b.player.0).fetch_optional(&mut **tx).await.map_err(db_error)?.map(crate::ordering::decode).transpose(),
        _=>Ok(None)
    }
}

pub(crate) async fn is_bot(tx: &mut Tx<'_>, b: Binding) -> Result<bool, StoreError> {
    sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM bot_participation WHERE universe=$1 AND player=$2)",
    )
    .bind(b.universe.0)
    .bind(b.player.0)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)
}
/// Recheck inside the actual read snapshot, not merely during routing preflight.
pub(crate) async fn unmetered_world_query(
    tx: &mut Tx<'_>,
    b: Binding,
    q: &WorldQueryKind,
) -> Result<(), StoreError> {
    if !is_bot(tx, b).await? {
        return Ok(());
    }
    match q {
        WorldQueryKind::FleetQuote { intent } => {
            require_destination_observation(tx, b, &intent.destination).await
        }
        WorldQueryKind::Galaxy { .. } | WorldQueryKind::ResolveDestination { .. } => {
            Err(StoreError::SnapshotRetry)
        }
    }
}
