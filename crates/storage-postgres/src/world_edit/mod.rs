//! Direct database editing. A brief exclusive gate coordinates with ordinary mutations.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::world_edit::{coordinate_label, coordinates};
use orbit_engine::*;
use serde_json::{Value, json};
use uuid::Uuid;
mod export;
mod inspect;
mod players;
mod scenario;
type Result<T> = std::result::Result<T, WorldEditError>;

impl PgStore {
    pub async fn world_universe(
        &self,
        requested: Option<UniverseId>,
        create: bool,
    ) -> Result<UniverseId> {
        if let Some(u) = requested {
            return Ok(u);
        }
        let ids: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM universes ORDER BY id LIMIT 2")
            .fetch_all(&self.pool)
            .await?;
        match ids.as_slice() {
            [u] => Ok(UniverseId(*u)),
            [] if create => Ok(UniverseId(Uuid::new_v4())),
            [] => Err("no universe exists; load a scenario first".into()),
            _ => Err("multiple universes; select --universe UUID".into()),
        }
    }
    async fn drain_world(&self, u: UniverseId) -> Result<()> {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM universes WHERE id=$1)")
            .bind(u.0)
            .fetch_one(&self.pool)
            .await?;
        if !exists {
            return Ok(());
        }
        let game = GameService::new(self.clone());
        let worker = WorkerId(Uuid::new_v4());
        loop {
            let outcome = if self.runtime_mode(u).await?.mode == ExecutorMode::Scoped {
                game.step_scoped(u, worker, &InlineEngine).await?
            } else {
                game.step(u, worker).await?
            };
            match outcome {
                StepOutcome::Idle => {
                    if self.process_runtime_barrier(u).await? {
                        continue;
                    }
                    return Ok(());
                }
                StepOutcome::Blocked { reason, .. } => {
                    return Err(format!("world processing is blocked: {reason}").into());
                }
                StepOutcome::Retry => {
                    tokio::time::sleep(std::time::Duration::from_millis(25)).await
                }
                _ => {}
            }
        }
    }
    pub async fn apply_world_scenario(
        &self,
        u: UniverseId,
        document: &WorldScenario,
        mode: ScenarioMode,
        operation: Uuid,
    ) -> Result<Value> {
        if document.version != 1 {
            return Err("unsupported scenario version; expected 1".into());
        }
        if document.edits.is_empty() {
            return Err("scenario must contain edits".into());
        }
        for (index, edit) in document.edits.iter().enumerate() {
            edit.check_shape()
                .map_err(|error| format!("edits[{index}]: {error}"))?;
        }
        let request_hash = hash(&(document, format!("{mode:?}"))).0;
        loop {
            if mode != ScenarioMode::Replace {
                self.drain_world(u).await?;
            }
            let mut tx = self.begin_unlocked(&self.pool).await?;
            sqlx::query("SELECT pg_advisory_xact_lock(901330)")
                .execute(&mut *tx)
                .await?;
            if let Some((saved,result))=sqlx::query_as::<_,(String,Value)>("SELECT request_hash,result FROM world_edit_receipts WHERE universe=$1 AND operation_id=$2").bind(u.0).bind(operation).fetch_optional(&mut *tx).await?{if saved!=request_hash{return Err("operation ID already used for a different request".into())}return Ok(result)}
            let exists: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM universes WHERE id=$1)")
                    .bind(u.0)
                    .fetch_one(&mut *tx)
                    .await?;
            if exists && mode == ScenarioMode::Create {
                return Err(
                    "world exists; use scenario apply for edits or load --replace to replace it"
                        .into(),
                );
            }
            if !exists && mode == ScenarioMode::Patch {
                return Err("world does not exist; use scenario load".into());
            }
            let at = now(&mut tx).await?;
            if exists && mode != ScenarioMode::Replace {
                let pending: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM pending_inputs WHERE universe=$1 AND at_ms<=$2)",
                )
                .bind(u.0)
                .bind(at)
                .fetch_one(&mut *tx)
                .await?;
                if pending {
                    tx.rollback().await?;
                    tokio::time::sleep(std::time::Duration::from_millis(25)).await;
                    continue;
                }
            }
            if exists && mode == ScenarioMode::Replace {
                scenario::remove_world(&mut tx, u).await?;
            }
            if !exists || mode == ScenarioMode::Replace {
                let mut request = UniverseSetup {
                    universe: Some(u),
                    ..Default::default()
                }
                .creation(u);
                if let Some(r) = &document.rules {
                    request.immutable = UniverseImmutable::from_rules(r)?;
                }
                if let Some(policy) = &document.policy {
                    request.policy = policy.clone();
                }
                crate::universe_config::create_in_tx(&mut tx, &request).await?;
                if let Some(name) = &document.name {
                    sqlx::query("UPDATE universes SET name=$2 WHERE id=$1")
                        .bind(u.0)
                        .bind(name)
                        .execute(&mut *tx)
                        .await?;
                }
                if let Some(r) = &document.rules {
                    scenario::install_rules(&mut tx, u, r).await?;
                }
            } else if document.rules.is_some() || document.policy.is_some() {
                return Err(
                    "patches use the active rules; use orbit rules for a rules change".into(),
                );
            }
            for retained in &document.retained_rules {
                retained.validate()?;
                sqlx::query(
                    "INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                )
                .bind(&retained.hash.0)
                .bind(&retained.artifact.id)
                .bind(sqlx::types::Json(retained))
                .execute(&mut *tx)
                .await?;
            }
            let rules = crate::facts::rules(&mut tx, u).await?;
            let epoch = Epoch(
                sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
                    .bind(u.0)
                    .fetch_one(&mut *tx)
                    .await?,
            );
            // In-flight computations were based on old facts. Fence them; their inputs remain pending.
            sqlx::query("UPDATE universe_runtime SET fence=fence+1,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL,frontier=greatest(frontier,$2),ordering_floor=greatest(ordering_floor,$2) WHERE universe=$1").bind(u.0).bind(at).execute(&mut *tx).await?;
            sqlx::query("UPDATE execution_scopes SET fence=fence+1,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL WHERE universe=$1").bind(u.0).execute(&mut *tx).await?;
            let mut results = Vec::new();
            for (index, edit) in document.edits.iter().enumerate() {
                let input = OrderedInput {
                    schema_version: 4,
                    protocol: 4,
                    id: InputId(derived_id(InputId(operation), &format!("edit:{index}"))),
                    universe: u,
                    epoch,
                    actor: Actor::Scheduler,
                    at,
                    phase: 1,
                    sequence: next_sequence(&mut tx, u).await?,
                    profile_hash: rules.hash.clone(),
                    payload: Input::Command(Command::RecallFleet {
                        fleet: FleetId::default(),
                    }),
                };
                let result = self
                    .apply_edit(&mut tx, &rules, &input, edit)
                    .await
                    .map_err(|e| format!("edits[{index}]: {e}"))?;
                results.push(result);
            }
            let result = json!({"universe":u,"operation_id":operation,"edits":results});
            sqlx::query("INSERT INTO world_edit_receipts(universe,operation_id,request_hash,result,applied_at) VALUES($1,$2,$3,$4,$5)").bind(u.0).bind(operation).bind(request_hash).bind(&result).bind(at).execute(&mut *tx).await?;
            tx.commit().await?;
            return Ok(result);
        }
    }
    async fn apply_edit(
        &self,
        tx: &mut Tx<'_>,
        rules: &Ruleset,
        input: &OrderedInput,
        e: &WorldEdit,
    ) -> Result<Value> {
        let op = e.op.to_ascii_lowercase();
        if op == "add-player" || op == "add-bot" {
            let result = players::add(tx, input, rules, e).await?;
            if let Some(preset) = &e.preset {
                let level = match preset.to_ascii_lowercase().as_str() {
                    "weak" => 3,
                    "strong" => 16,
                    _ => return Err("preset must be weak or strong".into()),
                };
                let user = result["user"].as_str().unwrap().to_owned();
                let planet = result["planet"].as_str().unwrap().to_owned();
                let edit = WorldEdit {
                    op: "set".into(),
                    user: Some(user),
                    planet: Some(planet),
                    resources: std::collections::BTreeMap::from([
                        ("metal".into(), 1_000_000),
                        ("crystal".into(), 1_000_000),
                        ("deuterium".into(), 500_000),
                    ]),
                    buildings: std::collections::BTreeMap::from([
                        ("MetalMine".into(), level),
                        ("CrystalMine".into(), level),
                        ("SolarPlant".into(), level),
                        ("ResearchLab".into(), 6),
                        ("Shipyard".into(), 6),
                    ]),
                    research: std::collections::BTreeMap::from([
                        ("CombustionDrive".into(), 6),
                        ("ImpulseDrive".into(), 6),
                        ("ComputerTechnology".into(), 8),
                    ]),
                    ships: std::collections::BTreeMap::from([
                        ("LightFighter".into(), level * 10),
                        ("EspionageProbe".into(), 10),
                        ("SmallCargo".into(), 20),
                    ]),
                    ..Default::default()
                };
                let mut preset_input = input.clone();
                preset_input.id = InputId(derived_id(input.id, "preset"));
                Box::pin(self.apply_edit(tx, rules, &preset_input, &edit)).await?;
            }
            return Ok(result);
        }
        let owner = if let Some(name) = &e.user {
            Some(players::resolve(tx, input.universe, name).await?)
        } else {
            None
        };
        if op == "set"
            && e.activity
                .as_ref()
                .is_some_and(|a| matches!(a.to_ascii_lowercase().as_str(), "sleeping" | "retired"))
        {
            let p = owner.ok_or("bot activity requires user")?;
            players::participation(tx, input, p, e.activity.as_deref().unwrap()).await?;
            let mut edit = e.clone();
            edit.activity = None;
            return Box::pin(self.apply_edit(tx, rules, input, &edit)).await;
        }
        if op == "alliance" {
            return players::alliance(tx, input, e, owner.ok_or("alliance requires user")?).await;
        }
        if op == "message" {
            return players::message(
                tx,
                input,
                e,
                owner.ok_or("message requires recipient user")?,
            )
            .await;
        }
        let facts =
            crate::world::load(tx, input.universe, input.epoch, rules, &input.payload, None)
                .await?;
        let mut edit = e.clone();
        if let Some(payload) = &edit.payload {
            edit.payload = Some(export::import_payload(tx, input, payload).await?);
        }
        let change = orbit_engine::world_edit::edit_world(&facts, rules, input, &edit, owner)?;
        let mut next = facts.clone();
        change.apply_to(&mut next)?;
        validate_asset_lineage(&next)?;
        crate::facts::validate_rule_references(tx, &next).await?;
        for body in next.bodies.values() {
            validate_body(&next, body.id, rules)?;
            validate_progression_collections(&next, body)?;
        }
        crate::commit::persist_changes(tx, input, &facts, rules, &change, None).await?;
        crate::updates::append_updates(tx, input, None, &change.affected_viewers).await?;
        Ok(
            json!({"op":e.op,"user":e.user,"planet":e.planet,"affected_players":change.affected_viewers.len(),"events":change.events.iter().map(|e|json!({"id":e.id,"at":e.at})).collect::<Vec<_>>()}),
        )
    }
}
