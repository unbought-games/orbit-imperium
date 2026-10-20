use crate::*;
use orbit_application::*;
use orbit_engine::*;
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;
pub(crate) type Tx<'a> = Transaction<'a, Postgres>;
pub(crate) fn decode<T: serde::de::DeserializeOwned>(
    v: serde_json::Value,
) -> Result<T, StoreError> {
    serde_json::from_value(v).map_err(|_| StoreError::CorruptData)
}
// Serde's unknown-field/variant errors identify vocabulary a newer binary may
// understand. Missing fields, invalid numbers and malformed shapes remain corruption.
pub(crate) fn decode_supported<T: serde::de::DeserializeOwned>(
    v: serde_json::Value,
) -> Result<T, StoreError> {
    serde_json::from_value(v).map_err(|e| {
        let message = e.to_string();
        if message.starts_with("unknown field ") || message.starts_with("unknown variant ") {
            StoreError::UnsupportedState
        } else {
            StoreError::CorruptData
        }
    })
}
pub(crate) fn ordered_input(v: serde_json::Value) -> Result<OrderedInput, StoreError> {
    let schema = v
        .get("schema_version")
        .and_then(|x| x.as_i64())
        .ok_or(StoreError::CorruptData)?;
    let protocol = v
        .get("protocol")
        .and_then(|x| x.as_i64())
        .ok_or(StoreError::CorruptData)?;
    if schema > 4 || protocol > 4 || (schema, protocol) == (1, 1) {
        return Err(StoreError::UnsupportedState);
    }
    if !matches!((schema, protocol), (2, 2) | (3, 3) | (4, 4)) {
        return Err(StoreError::CorruptData);
    }
    decode_supported(v)
}
pub(crate) async fn gate(
    tx: &mut Tx<'_>,
    u: UniverseId,
) -> Result<sqlx::postgres::PgRow, StoreError> {
    sqlx::query("SELECT epoch,profile_hash FROM universes WHERE id=$1 FOR UPDATE")
        .bind(u.0)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)
}
pub(crate) async fn now(tx: &mut Tx<'_>) -> Result<i64, StoreError> {
    #[cfg(feature = "test-support")]
    {
        let exists: bool = sqlx::query_scalar("SELECT to_regclass('orbit_test_clock') IS NOT NULL")
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
        if exists {
            return sqlx::query_scalar("SELECT at_ms FROM orbit_test_clock")
                .fetch_one(&mut **tx)
                .await
                .map_err(db_error);
        }
    }
    sqlx::query_scalar("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint")
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
}
pub(crate) async fn runtime(
    tx: &mut Tx<'_>,
    u: UniverseId,
) -> Result<sqlx::postgres::PgRow, StoreError> {
    sqlx::query("SELECT * FROM universe_runtime WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
}
pub(crate) async fn next_sequence(tx: &mut Tx<'_>, u: UniverseId) -> Result<i64, StoreError> {
    if crate::admission::is_scoped(tx, u).await? {
        return sqlx::query_scalar("SELECT nextval($1::regclass)")
            .bind(crate::admission::sequence_name(u))
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error);
    }
    sqlx::query_scalar("UPDATE universe_runtime SET next_sequence=next_sequence+1 WHERE universe=$1 RETURNING next_sequence-1").bind(u.0).fetch_one(&mut **tx).await.map_err(db_error)
}
pub(crate) async fn head(
    tx: &mut Tx<'_>,
    u: UniverseId,
    at: i64,
) -> Result<Option<OrderedInput>, StoreError> {
    let v:Option<serde_json::Value>=sqlx::query_scalar("SELECT input FROM (SELECT input,at_ms,1 AS phase,sequence FROM commands WHERE universe=$1 AND NOT done UNION ALL SELECT input,at_ms,0 AS phase,sequence FROM scheduled_events WHERE universe=$1 AND NOT done AND NOT cancelled) inputs WHERE at_ms<=$2 ORDER BY at_ms,phase,sequence LIMIT 1").bind(u.0).bind(at).fetch_optional(&mut **tx).await.map_err(db_error)?;
    v.map(ordered_input).transpose()
}
pub(crate) async fn ensure_fresh(tx: &mut Tx<'_>, u: UniverseId) -> Result<i64, StoreError> {
    let runtime = runtime(tx, u).await?;
    if runtime
        .try_get::<Option<String>, _>("blocked")
        .map_err(db_error)?
        .is_some()
    {
        return Err(StoreError::CorruptData);
    }
    let at = now(tx)
        .await?
        .max(runtime.try_get("frontier").map_err(db_error)?);
    if runtime
        .try_get::<Option<Uuid>, _>("claim_input")
        .map_err(db_error)?
        .is_some()
        || head(tx, u, at).await?.is_some()
    {
        return Err(StoreError::Unavailable);
    }
    Ok(at)
}
pub(crate) async fn valid_claim(tx: &mut Tx<'_>, claim: &Claim) -> Result<bool, StoreError> {
    let row = runtime(tx, claim.input.universe).await?;
    let clock = now(tx).await?;
    if row
        .try_get::<String, _>("executor_mode")
        .map_err(db_error)?
        == "scoped"
    {
        return Ok(false);
    }
    Ok(row
        .try_get::<Option<Uuid>, _>("claim_input")
        .map_err(db_error)?
        == Some(claim.input.id.0)
        && row
            .try_get::<Option<Uuid>, _>("claim_owner")
            .map_err(db_error)?
            == Some(claim.owner.0)
        && row
            .try_get::<Option<Uuid>, _>("claim_token")
            .map_err(db_error)?
            == Some(claim.token)
        && row.try_get::<i64, _>("fence").map_err(db_error)? == claim.fence
        && row.try_get::<i64, _>("cursor").map_err(db_error)? == claim.prior_cursor
        && row
            .try_get::<Option<i64>, _>("lease_until")
            .map_err(db_error)?
            .is_some_and(|t| t > clock)
        && row
            .try_get::<Option<String>, _>("blocked")
            .map_err(db_error)?
            .is_none())
}
impl PgStore {
    #[cfg(feature = "test-support")]
    pub async fn set_test_time(&self, at: i64) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        sqlx::raw_sql("CREATE TABLE IF NOT EXISTS orbit_test_clock(at_ms bigint NOT NULL); DELETE FROM orbit_test_clock;").execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("INSERT INTO orbit_test_clock VALUES($1)")
            .bind(at)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)
    }
    pub(crate) async fn admit_input(
        &self,
        actor: Actor,
        u: UniverseId,
        envelope: CommandEnvelope,
    ) -> Result<Receipt, StoreError> {
        self.admit_checked(actor, u, envelope, None).await
    }
    pub(crate) async fn admit_checked(
        &self,
        actor: Actor,
        u: UniverseId,
        envelope: CommandEnvelope,
        binding: Option<(Binding, Hash)>,
    ) -> Result<Receipt, StoreError> {
        let Actor::Player(player) = actor else {
            return Err(StoreError::NotFound);
        };
        let (mut tx, scoped) = self.begin_admission(u).await?;
        let universe = crate::snapshots::universe(&mut tx, u).await?;
        if let Some((b, _)) = &binding {
            crate::binding::check_read(&mut tx, *b).await?;
        }
        if envelope.protocol != crate::facts::rules(&mut tx, u).await?.protocol() {
            return Err(StoreError::UnsupportedProtocol);
        }
        if universe.try_get::<Uuid, _>("epoch").map_err(db_error)? != envelope.epoch.0 {
            return Err(StoreError::Conflict);
        }
        let member: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM universe_memberships WHERE universe=$1 AND player=$2)",
        )
        .bind(u.0)
        .bind(player.0)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        if !member {
            return Err(StoreError::NotFound);
        }
        let intent = binding.map(|(_, h)| h).unwrap_or_else(|| hash(&envelope));
        if let Some(receipt) = crate::admission::existing_command(
            &mut tx,
            u,
            player,
            envelope.epoch,
            envelope.command_id,
            &intent,
        )
        .await?
        {
            return Ok(receipt);
        }
        let runtime = runtime(&mut tx, u).await?;
        let indexed = scoped
            || runtime
                .try_get::<String, _>("executor_mode")
                .map_err(db_error)?
                == "preparing";
        let mut envelope = envelope;
        let inherited = if indexed {
            let (command, scopes) = crate::scope_references::resolve_command(
                &mut tx,
                u,
                envelope.epoch,
                player,
                envelope.command,
            )
            .await?;
            envelope.command = command;
            scopes
        } else {
            Default::default()
        };
        let mut scopes = if indexed {
            crate::scoped_facts::select(
                &mut tx,
                u,
                actor,
                &Input::Command(envelope.command.clone()),
            )
            .await?
            .scopes()
        } else {
            Default::default()
        };
        scopes.extend(inherited);
        let (at, _ordering_hold) = if scoped {
            crate::admission::stamp(&mut tx, u, &scopes, self.observer.clone()).await?
        } else {
            (
                now(&mut tx)
                    .await?
                    .max(runtime.try_get("frontier").map_err(db_error)?),
                self.timer(RuntimeStage::OrderingHold),
            )
        };
        // Another replica may have admitted this ID while we waited for the scopes.
        if let Some(receipt) = crate::admission::existing_command(
            &mut tx,
            u,
            player,
            envelope.epoch,
            envelope.command_id,
            &intent,
        )
        .await?
        {
            return Ok(receipt);
        }
        let recent: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM commands WHERE universe=$1 AND actor=$2 AND at_ms>$3",
        )
        .bind(u.0)
        .bind(player.0)
        .bind(at - 60000)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let limit = self.command_limit(&mut tx, u).await?;
        if recent >= limit {
            return Err(StoreError::RateLimited);
        }
        let sequence = next_sequence(&mut tx, u).await?;
        let id = InputId(Uuid::new_v4());
        let input = OrderedInput {
            schema_version: if envelope.protocol >= 3 {
                envelope.protocol
            } else {
                2
            },
            id,
            universe: u,
            epoch: envelope.epoch,
            actor,
            at,
            phase: 1,
            sequence,
            protocol: envelope.protocol,
            profile_hash: Hash(universe.try_get("profile_hash").map_err(db_error)?),
            payload: Input::Command(envelope.command),
        };
        let receipt = Receipt {
            command_id: envelope.command_id,
            epoch: envelope.epoch,
            admitted_at: at,
            executed_at: None,
            status: ReceiptStatus::Pending,
        };
        sqlx::query("INSERT INTO commands(universe,actor,command_id,input_id,intent_hash,at_ms,sequence,input,receipt,epoch) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)").bind(u.0).bind(player.0).bind(envelope.command_id.0).bind(id.0).bind(intent.0).bind(at).bind(sequence).bind(sqlx::types::Json(&input)).bind(sqlx::types::Json(&receipt)).bind(envelope.epoch.0).execute(&mut *tx).await.map_err(db_error)?;
        if indexed {
            crate::admission::register(&mut tx, &input, &scopes).await?;
        }
        if !scoped {
            sqlx::query("UPDATE universe_runtime SET frontier=$2 WHERE universe=$1")
                .bind(u.0)
                .bind(at)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(receipt)
    }
    pub(crate) async fn read_receipt(
        &self,
        actor: Actor,
        u: UniverseId,
        id: CommandId,
    ) -> Result<Receipt, StoreError> {
        let Actor::Player(player) = actor else {
            return Err(StoreError::NotFound);
        };
        let value = sqlx::query_scalar(
            "SELECT receipt FROM commands WHERE universe=$1 AND actor=$2 AND command_id=$3",
        )
        .bind(u.0)
        .bind(player.0)
        .bind(id.0)
        .fetch_optional(self.read_pool()?)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::NotFound)?;
        decode(value)
    }
    pub(crate) async fn claim_head(
        &self,
        u: UniverseId,
        worker: WorkerId,
    ) -> Result<Option<Claim>, StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        if crate::admission::is_scoped(&mut tx, u).await? {
            return Ok(None);
        }
        gate(&mut tx, u).await?;
        if crate::admission::is_scoped(&mut tx, u).await? {
            return Ok(None);
        }
        let row = runtime(&mut tx, u).await?;
        if row
            .try_get::<Option<String>, _>("blocked")
            .map_err(db_error)?
            .is_some()
        {
            return Err(StoreError::CorruptData);
        }
        let clock = now(&mut tx).await?;
        let at = clock.max(row.try_get("frontier").map_err(db_error)?);
        if row
            .try_get::<Option<i64>, _>("lease_until")
            .map_err(db_error)?
            .is_some_and(|t| t > clock)
        {
            return Ok(None);
        }
        // Keep the universe gate outside the savepoint. A SQL schema error aborts
        // the transaction until rollback; recover selection without releasing
        // that gate so its diagnostic can be committed atomically.
        sqlx::query("SAVEPOINT head_selection")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let selection = async {
            crate::facts::rules(&mut tx, u).await?;
            head(&mut tx, u, at).await
        }
        .await;
        let input = match selection {
            Ok(Some(input)) => input,
            Ok(None) => return Ok(None),
            Err(error @ (StoreError::CorruptData | StoreError::IncompatibleSchema)) => {
                sqlx::query("ROLLBACK TO SAVEPOINT head_selection")
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
                sqlx::query(
                    "UPDATE universe_runtime SET blocked='invalid ordered head' WHERE universe=$1",
                )
                .bind(u.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
                tx.commit().await.map_err(db_error)?;
                return Err(error);
            }
            Err(error) => return Err(error),
        };
        sqlx::query("RELEASE SAVEPOINT head_selection")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let fence = row
            .try_get::<i64, _>("fence")
            .map_err(db_error)?
            .checked_add(1)
            .ok_or(StoreError::CorruptData)?;
        let token = Uuid::new_v4();
        let lease_until = clock.checked_add(15000).ok_or(StoreError::CorruptData)?;
        sqlx::query("UPDATE universe_runtime SET frontier=$2,fence=$3,claim_input=$4,claim_owner=$5,claim_token=$6,lease_until=$7 WHERE universe=$1").bind(u.0).bind(at).bind(fence).bind(input.id.0).bind(worker.0).bind(token).bind(lease_until).execute(&mut *tx).await.map_err(db_error)?;
        let claim = Claim {
            input,
            owner: worker,
            fence,
            token,
            prior_cursor: row.try_get("cursor").map_err(db_error)?,
            lease_until,
        };
        tx.commit().await.map_err(db_error)?;
        Ok(Some(claim))
    }
    pub(crate) async fn renew(&self, claim: &Claim) -> Result<Claim, StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        gate(&mut tx, claim.input.universe).await?;
        if !valid_claim(&mut tx, claim).await? {
            return Err(StoreError::StaleClaim);
        }
        let mut next = claim.clone();
        next.lease_until = now(&mut tx)
            .await?
            .checked_add(15000)
            .ok_or(StoreError::CorruptData)?;
        sqlx::query("UPDATE universe_runtime SET lease_until=$2 WHERE universe=$1")
            .bind(claim.input.universe.0)
            .bind(next.lease_until)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(next)
    }
    pub(crate) async fn block(
        &self,
        claim: &Claim,
        error: &InvariantError,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        gate(&mut tx, claim.input.universe).await?;
        if !valid_claim(&mut tx, claim).await? {
            return Err(StoreError::StaleClaim);
        }
        sqlx::query("UPDATE universe_runtime SET blocked=$2 WHERE universe=$1")
            .bind(claim.input.universe.0)
            .bind(&error.0)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)
    }
}

impl PgStore {
    pub async fn release_serial(&self, claim: &Claim) -> Result<(), StoreError> {
        let mut tx = self.begin_tx(&self.pool).await?;
        gate(&mut tx, claim.input.universe).await?;
        if !valid_claim(&mut tx, claim).await? {
            return Err(StoreError::StaleClaim);
        }
        sqlx::query("UPDATE universe_runtime SET fence=fence+1,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL WHERE universe=$1")
            .bind(claim.input.universe.0).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)
    }
}
