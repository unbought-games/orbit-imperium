use crate::*;
#[cfg(feature = "test-support")]
use orbit_application::hash_password;
use orbit_engine::*;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

#[cfg(feature = "test-support")]
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MvpAccount {
    pub name: String,
    pub password: String,
}
#[cfg(feature = "test-support")]
impl MvpAccount {
    /// Validate private bootstrap input before any schema or gameplay writes.
    pub fn validate_all(accounts: &[Self; 5]) -> Result<(), StoreError> {
        let mut names = std::collections::BTreeSet::new();
        for a in accounts {
            if a.name.is_empty()
                || a.name.len() > 80
                || a.name != a.name.trim().to_lowercase()
                || !a
                    .name
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"-_".contains(&b))
                || !(12..=1024).contains(&a.password.len())
                || !names.insert(&a.name)
            {
                return Err(StoreError::Conflict);
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Member {
    pub(crate) name: String,
    pub(crate) account: Uuid,
    pub(crate) player: Uuid,
    pub(crate) body: Uuid,
    pub(crate) homeworld: Homeworld,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Manifest {
    pub(crate) epoch: Epoch,
    pub(crate) members: Vec<Member>,
    pub(crate) production_settings: [u32; 6],
    pub(crate) cursor: Coordinates,
}

impl PgStore {
    #[cfg(feature = "test-support")]
    pub async fn bootstrap_mvp(
        &self,
        universe: UniverseId,
        at: i64,
        accounts: &[MvpAccount; 5],
        secret: &[u8; 32],
    ) -> Result<(), StoreError> {
        self.bootstrap_profile(universe, at, accounts, secret, Ruleset::mvp())
            .await
    }
    #[cfg(feature = "test-support")]
    pub async fn bootstrap_mvp_progression(
        &self,
        universe: UniverseId,
        at: i64,
        accounts: &[MvpAccount; 5],
        secret: &[u8; 32],
    ) -> Result<(), StoreError> {
        self.bootstrap_profile(universe, at, accounts, secret, Ruleset::mvp_progression())
            .await
    }
    #[cfg(feature = "test-support")]
    pub async fn bootstrap_mvp_fleets(
        &self,
        universe: UniverseId,
        at: i64,
        accounts: &[MvpAccount; 5],
        secret: &[u8; 32],
    ) -> Result<(), StoreError> {
        self.bootstrap_profile(universe, at, accounts, secret, Ruleset::mvp_fleets())
            .await
    }
    #[cfg(feature = "test-support")]
    pub async fn bootstrap_mvp_raids(
        &self,
        universe: UniverseId,
        at: i64,
        accounts: &[MvpAccount; 5],
        secret: &[u8; 32],
    ) -> Result<(), StoreError> {
        self.bootstrap_profile(universe, at, accounts, secret, Ruleset::mvp_raids())
            .await
    }
    #[cfg(feature = "test-support")]
    async fn bootstrap_profile(
        &self,
        universe: UniverseId,
        at: i64,
        accounts: &[MvpAccount; 5],
        secret: &[u8; 32],
        rules: Result<Ruleset, RulesError>,
    ) -> Result<(), StoreError> {
        self.check_migrations().await?;
        let rules = rules.map_err(|_| StoreError::CorruptData)?;
        let fleets = rules.world();
        if !(0..=MAX_WIRE_MS).contains(&at) || universe.0.is_nil() {
            return Err(StoreError::Conflict);
        }
        MvpAccount::validate_all(accounts)?;
        let mut tx = self.begin_tx(&self.pool).await?;
        sqlx::query("SELECT pg_advisory_xact_lock(901323)")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        if let Some(row) =
            sqlx::query("SELECT profile_hash,speed FROM universes WHERE id=$1 FOR UPDATE")
                .bind(universe.0)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
        {
            if row.try_get::<String, _>("profile_hash").map_err(db_error)? != rules.hash.0
                || row.try_get::<i32, _>("speed").map_err(db_error)? != rules.speed
                || crate::facts::rules(&mut tx, universe).await? != rules
            {
                return Err(StoreError::Conflict);
            }
            let (saved_secret, manifest) = load_manifest(&mut tx, universe).await?;
            if saved_secret != *secret
                || manifest
                    .members
                    .iter()
                    .map(|m| &m.name)
                    .ne(accounts.iter().map(|a| &a.name))
            {
                return Err(StoreError::Conflict);
            }
            validate_manifest(&mut tx, universe, &manifest, &saved_secret).await?;
            tx.commit().await.map_err(db_error)?;
            return Ok(());
        }
        // New worlds require stopped servers; matching reruns above remain read-only while serving.
        let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(901321)")
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
        if !locked {
            return Err(StoreError::Conflict);
        }
        let hashes = accounts
            .iter()
            .map(|a| hash_password(&a.password).map_err(|_| StoreError::CorruptData))
            .collect::<Result<Vec<_>, _>>()?;
        let epoch = Epoch(Uuid::new_v4());
        let worlds =
            mvp_homeworlds(secret, universe, epoch).map_err(|_| StoreError::CorruptData)?;
        sqlx::query(
            "INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        )
        .bind(&rules.hash.0)
        .bind(&rules.artifact.id)
        .bind(sqlx::types::Json(&rules))
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        sqlx::query("INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash) VALUES($1,$2,true,10,$3,$4)").bind(universe.0).bind(epoch.0).bind(at).bind(&rules.hash.0).execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("INSERT INTO universe_runtime(universe,frontier) VALUES($1,$2)")
            .bind(universe.0)
            .bind(at)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let mut manifest = Manifest {
            epoch,
            members: Vec::new(),
            production_settings: [100; 6],
            cursor: Coordinates {
                galaxy: 1,
                system: 1,
                position: 4,
            },
        };
        for (i, homeworld) in worlds.into_iter().enumerate() {
            let member = Member {
                name: accounts[i].name.clone(),
                account: Uuid::new_v4(),
                player: Uuid::new_v4(),
                body: Uuid::new_v4(),
                homeworld,
            };
            insert_member(&mut tx, universe, &member, &hashes[i], at, &rules).await?;
            manifest.members.push(member);
        }
        if fleets {
            sqlx::query("INSERT INTO world_heads(universe) VALUES($1)")
                .bind(universe.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        }
        sqlx::query("INSERT INTO mvp_bootstraps(universe,secret,manifest) VALUES($1,$2,$3)")
            .bind(universe.0)
            .bind(secret.as_slice())
            .bind(sqlx::types::Json(manifest))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
}

/// Read only the viewer's saved creation metadata in the view's transaction.
/// Fixtures and historical universes without a manifest have no physical metadata.
pub(crate) async fn viewer_homeworld(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    universe: UniverseId,
    player: PlayerId,
) -> Result<Option<(BodyId, Homeworld)>, StoreError> {
    let member = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT member FROM mvp_bootstraps CROSS JOIN LATERAL jsonb_array_elements(manifest->'members') AS member WHERE universe=$1 AND member->>'player'=$2",
    )
    .bind(universe.0)
    .bind(player.0.to_string())
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    member
        .map(|value| {
            let member: Member =
                serde_json::from_value(value).map_err(|_| StoreError::CorruptData)?;
            Ok((BodyId(member.body), member.homeworld))
        })
        .transpose()
}

pub(crate) async fn load_manifest(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    u: UniverseId,
) -> Result<([u8; 32], Manifest), StoreError> {
    let row = sqlx::query("SELECT secret,manifest FROM mvp_bootstraps WHERE universe=$1")
        .bind(u.0)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(StoreError::CorruptData)?;
    let secret: Vec<u8> = row.try_get("secret").map_err(db_error)?;
    let manifest = serde_json::from_value(row.try_get("manifest").map_err(db_error)?)
        .map_err(|_| StoreError::CorruptData)?;
    Ok((
        secret.try_into().map_err(|_| StoreError::CorruptData)?,
        manifest,
    ))
}
pub(crate) async fn validate_manifest(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    u: UniverseId,
    m: &Manifest,
    secret: &[u8; 32],
) -> Result<(), StoreError> {
    let epoch: Uuid = sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
        .bind(u.0)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    let rules = crate::facts::rules(tx, u).await?;
    let profile = rules
        .artifact
        .universe
        .as_ref()
        .ok_or(StoreError::CorruptData)?;
    let worlds = if profile.id == "mvp-v1"
        && rules
            .artifact
            .world
            .as_ref()
            .and_then(|w| w.colonization.as_ref())
            .is_none()
    {
        homeworlds(secret, u, m.epoch, m.members.len()).map_err(|_| StoreError::CorruptData)?
    } else {
        // Placement is a creation fact. Current occupancy must not relocate or
        // invalidate a homeworld allocated against an earlier occupancy snapshot.
        m.members
            .iter()
            .map(|member| {
                member
                    .homeworld
                    .validate(profile)
                    .map_err(|_| StoreError::CorruptData)?;
                Ok(member.homeworld.clone())
            })
            .collect::<Result<Vec<_>, StoreError>>()?
    };
    if m.epoch.0 != epoch
        || m.production_settings != [100; 6]
        || m.cursor
            != (Coordinates {
                galaxy: 1,
                system: 1,
                position: 4,
            })
    {
        return Err(StoreError::CorruptData);
    }
    let counts:(i64,i64,i64)=sqlx::query_as("SELECT (SELECT count(*) FROM universe_memberships WHERE universe=$1),(SELECT count(*) FROM players WHERE universe=$1),(SELECT count(*) FROM bodies WHERE universe=$1)").bind(u.0).fetch_one(&mut **tx).await.map_err(db_error)?;
    let count = m.members.len() as i64;
    let colonies: i64 = sqlx::query_scalar("SELECT count(*) FROM colony_genesis WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    if counts != (count, count, count + colonies) {
        return Err(StoreError::CorruptData);
    }
    let mut seen = std::collections::BTreeSet::new();
    for (member, world) in m.members.iter().zip(worlds) {
        if member.homeworld != world || !seen.insert(member.account) {
            return Err(StoreError::CorruptData);
        }
        let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM accounts a JOIN universe_memberships m ON m.account=a.id JOIN players p ON p.id=m.player AND p.universe=m.universe JOIN bodies b ON b.owner=p.id AND b.universe=m.universe WHERE a.id=$1 AND a.name=$2 AND m.player=$3 AND m.universe=$4 AND b.id=$5 AND b.kind='Planet' AND b.galaxy=$8 AND b.system=$9 AND b.position=$6 AND b.fields=163 AND b.max_temperature=$7)")
            .bind(member.account).bind(&member.name).bind(member.player).bind(u.0).bind(member.body).bind(world.coordinates.position as i32).bind(world.max_temperature).bind(world.coordinates.galaxy as i32).bind(world.coordinates.system as i32).fetch_one(&mut **tx).await.map_err(db_error)?;
        if !valid {
            return Err(StoreError::CorruptData);
        }
    }
    Ok(())
}

pub(crate) async fn insert_member(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    universe: UniverseId,
    member: &Member,
    password_hash: &str,
    at: i64,
    rules: &Ruleset,
) -> Result<(), StoreError> {
    let progression = rules.progression();
    let fleets = rules.world();
    sqlx::query(
        "INSERT INTO accounts(id,name,password_hash) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
    )
    .bind(member.account)
    .bind(&member.name)
    .bind(password_hash)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    sqlx::query("INSERT INTO players(id,universe) VALUES($1,$2)")
        .bind(member.player)
        .bind(universe.0)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO universe_memberships(universe,account,player,joined_at_ms) VALUES($1,$2,$3,$4)")
        .bind(universe.0)
        .bind(member.account)
        .bind(member.player)
        .bind(at)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at) VALUES($1,$2,$3,'Planet',$9,$10,$4,163,$5,$6,$7,$8)")
                .bind(member.body).bind(universe.0).bind(member.player).bind(member.homeworld.coordinates.position as i32).bind(member.homeworld.max_temperature)
                .bind(sqlx::types::Json(Resources::from_values([1000*SCALE,1000*SCALE,0]))).bind(sqlx::types::Json(Resources::all(0))).bind(at).bind(member.homeworld.coordinates.galaxy as i32).bind(member.homeworld.coordinates.system as i32).execute(&mut **tx).await.map_err(db_error)?;
    if !progression {
        sqlx::query("INSERT INTO legacy_body_capacities(body,capacity) VALUES($1,$2)")
            .bind(member.body)
            .bind(sqlx::types::Json(Resources::all(10000 * SCALE)))
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    for building in rules.building_keys() {
        sqlx::query("INSERT INTO building_levels VALUES($1,$2,0)")
            .bind(member.body)
            .bind(format!("{building:?}"))
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    for research in rules.research_keys() {
        sqlx::query("INSERT INTO research_levels(owner,research,level) VALUES($1,$2,0)")
            .bind(member.player)
            .bind(format!("{research:?}"))
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    for (kind, key) in [
        ("research".to_owned(), member.player),
        ("fleets".to_owned(), member.player),
        ("constructions".to_owned(), member.body),
        (format!("inventory:{}", member.player), member.body),
    ] {
        sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
            .bind(universe.0)
            .bind(kind)
            .bind(key)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    sqlx::query("INSERT INTO viewer_heads(universe,player) VALUES($1,$2)")
        .bind(universe.0)
        .bind(member.player)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    if progression {
        let record = ProductionSettingsRecord {
            body: BodyId(member.body),
            settings: ProductionSettings::default(),
            revision: 0,
        };
        sqlx::query("INSERT INTO production_settings(body,data,revision) VALUES($1,$2,0)")
            .bind(member.body)
            .bind(sqlx::types::Json(record))
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        for (kind, key) in [
            ("production", member.body),
            ("manufacturing", member.body),
            ("research-operations", member.player),
            ("owned-bodies", member.player),
            ("lab-constructions", member.player),
        ] {
            sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
                .bind(universe.0)
                .bind(kind)
                .bind(key)
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
        }
    }
    if fleets {
        let policy = PlayerPolicy {
            player: PlayerId(member.player),
            last_presence_at: at,
            vacation: false,
            lifecycle: PlayerLifecycle::Active,
            policy_hash: rules.hash.clone(),
            revision: 0,
        };
        sqlx::query("INSERT INTO player_policies(universe,id,data) VALUES($1,$2,$3)")
            .bind(universe.0)
            .bind(member.player)
            .bind(sqlx::types::Json(policy))
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        sqlx::query("INSERT INTO mission_report_heads(universe,recipient) VALUES($1,$2)")
            .bind(universe.0)
            .bind(member.player)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    Ok(())
}
