use crate::ordering::*;
use crate::*;
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use std::collections::{BTreeMap, BTreeSet};
/// Unknown vocabulary is a local capability mismatch, not proof of shared corruption.
pub(crate) fn decode_rules(v: serde_json::Value) -> Result<Ruleset, StoreError> {
    let rules: Ruleset = crate::ordering::decode_supported(v)?;
    rules.validate().map_err(|error| match error {
        RulesError::Unsupported | RulesError::InvalidReference => StoreError::UnsupportedState,
        _ => StoreError::CorruptData,
    })?;
    Ok(rules)
}
pub(crate) async fn rules(tx: &mut Tx<'_>, u: UniverseId) -> Result<Ruleset, StoreError> {
    let row = sqlx::query("SELECT r.profile::text AS profile,u.profile_hash,u.speed FROM universes u LEFT JOIN rulesets r ON r.hash=u.profile_hash WHERE u.id=$1")
        .bind(u.0).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
    rules_from_row(&row)
}

pub(crate) fn rules_from_row(row: &sqlx::postgres::PgRow) -> Result<Ruleset, StoreError> {
    let profile: Option<String> = row.try_get("profile").map_err(db_error)?;
    let rules = cached_rules(profile.ok_or(StoreError::CorruptData)?)?;
    if rules.hash.0 != row.try_get::<String, _>("profile_hash").map_err(db_error)?
        || rules.speed != row.try_get::<i32, _>("speed").map_err(db_error)?
    {
        return Err(StoreError::CorruptData);
    }
    Ok(rules)
}
// One validated artifact covers the usual single-universe process. Compare the
// actual stored bytes so a corrupt row under an existing hash still fails closed.
fn cached_rules(profile: String) -> Result<Ruleset, StoreError> {
    static LAST: std::sync::RwLock<Option<(String, Ruleset)>> = std::sync::RwLock::new(None);
    if let Some((previous, rules)) = LAST.read().expect("rules cache").as_ref()
        && *previous == profile
    {
        return Ok(rules.clone());
    }
    let rules = decode_rules(serde_json::from_str(&profile).map_err(|_| StoreError::CorruptData)?)?;
    *LAST.write().expect("rules cache") = Some((profile, rules.clone()));
    Ok(rules)
}
/// Historical commitments may reference earlier snapshots, but never missing ones.
pub(crate) async fn validate_rule_references(
    tx: &mut Tx<'_>,
    state: &GameState,
) -> Result<(), StoreError> {
    let mut hashes = BTreeSet::from([state.profile_hash.0.clone()]);
    hashes.extend(
        state
            .constructions
            .values()
            .map(|x| x.profile_hash.0.clone()),
    );
    hashes.extend(
        state
            .research_operations
            .values()
            .map(|x| x.commitment.profile_hash.0.clone()),
    );
    hashes.extend(
        state
            .manufacturing_batches
            .values()
            .map(|x| x.commitment.profile_hash.0.clone()),
    );
    if let Some(w) = &state.world {
        hashes.extend(
            w.records
                .missiles
                .values()
                .map(|f| f.terms.profile_hash.0.clone()),
        );
        hashes.extend(w.records.policies.values().map(|x| x.policy_hash.0.clone()));
        hashes.extend(w.records.fleets.values().flat_map(|x| {
            [
                x.terms.profile_hash.0.clone(),
                x.authorization.policy_hash.0.clone(),
            ]
        }));
    }
    let hashes: Vec<_> = hashes.into_iter().collect();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM rulesets WHERE hash=ANY($1)")
        .bind(&hashes)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    if count != hashes.len() as i64 {
        return Err(StoreError::CorruptData);
    }
    Ok(())
}
/// `rules` must be validated for `u` by `facts::rules` in this transaction.
pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    rules: &Ruleset,
    actor: Actor,
    input: &Input,
    input_id: Option<InputId>,
) -> Result<GameState, StoreError> {
    if rules.world() && crate::phalanx::target(input).is_some() {
        return crate::phalanx::load(tx, u, epoch, rules, actor, input, input_id).await;
    }
    if rules.world() {
        let selected = crate::scoped_facts::select(tx, u, actor, input).await?;
        return crate::world::load_selected(tx, u, epoch, rules, input, input_id, selected).await;
    }
    if rules.progression() {
        return crate::progression_state::load(tx, u, epoch, rules, actor, input, input_id).await;
    }
    let mut body_ids = BTreeSet::new();
    let mut explicit_operations = BTreeSet::new();
    let mut explicit_fleets = BTreeSet::new();
    let mut owners = BTreeSet::new();
    if let Actor::Player(p) = actor {
        owners.insert(p);
    }
    match input {
        Input::Command(
            Command::World { .. }
            | Command::SetProduction { .. }
            | Command::StartDemolition { .. }
            | Command::StartResearch { .. }
            | Command::CancelResearch { .. }
            | Command::StartManufacture { .. },
        )
        | Input::Event(
            ScheduledEvent::EmpireDeletionDue { .. }
            | ScheduledEvent::AttackGroupDue { .. }
            | ScheduledEvent::MissileImpact { .. }
            | ScheduledEvent::FleetLegDue { .. }
            | ScheduledEvent::DebrisCleanupDue { .. }
            | ScheduledEvent::AbandonedSlotDue { .. }
            | ScheduledEvent::ResearchDue { .. }
            | ScheduledEvent::ManufacturingDue { .. },
        ) => return Err(StoreError::Conflict),
        Input::Command(Command::StartUpgrade { body, .. }) => {
            body_ids.insert(*body);
        }
        Input::Command(Command::CancelConstruction { operation })
        | Input::Event(ScheduledEvent::ConstructionDue { operation, .. }) => {
            explicit_operations.insert(*operation);
            let body: Option<uuid::Uuid> =
                sqlx::query_scalar("SELECT body FROM constructions WHERE universe=$1 AND id=$2")
                    .bind(u.0)
                    .bind(operation.0)
                    .fetch_optional(&mut **tx)
                    .await
                    .map_err(db_error)?;
            if let Some(body) = body {
                body_ids.insert(BodyId(body));
            }
        }
        Input::Command(Command::LaunchTransport { origin, target, .. }) => {
            body_ids.insert(*origin);
            body_ids.insert(*target);
        }
        Input::Command(Command::RecallFleet { fleet })
        | Input::Event(
            ScheduledEvent::TransportArrived { fleet, .. }
            | ScheduledEvent::FleetReturned { fleet, .. },
        ) => {
            explicit_fleets.insert(*fleet);
            if let Some(row) =
                sqlx::query("SELECT owner,origin,target FROM fleets WHERE universe=$1 AND id=$2")
                    .bind(u.0)
                    .bind(fleet.0)
                    .fetch_optional(&mut **tx)
                    .await
                    .map_err(db_error)?
            {
                owners.insert(PlayerId(row.try_get("owner").map_err(db_error)?));
                body_ids.insert(BodyId(row.try_get("origin").map_err(db_error)?));
                body_ids.insert(BodyId(row.try_get("target").map_err(db_error)?));
            }
        }
    }
    let ids: Vec<_> = body_ids.iter().map(|b| b.0).collect();
    let rows = sqlx::query("SELECT * FROM bodies WHERE universe=$1 AND id=ANY($2) ORDER BY id")
        .bind(u.0)
        .bind(&ids)
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?;
    let bodies = crate::views::bodies(tx, rows)
        .await?
        .into_iter()
        .map(|b| (b.id, b))
        .collect::<BTreeMap<_, _>>();
    owners.extend(bodies.values().map(|b| b.owner));
    let owner_ids: Vec<_> = owners.iter().map(|p| p.0).collect();
    let players =
        sqlx::query("SELECT id FROM players WHERE universe=$1 AND id=ANY($2) ORDER BY id")
            .bind(u.0)
            .bind(&owner_ids)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?
            .into_iter()
            .map(|r| {
                let id = PlayerId(r.try_get("id").map_err(db_error)?);
                Ok((id, Player { id, universe: u }))
            })
            .collect::<Result<_, StoreError>>()?;
    let constructions=sqlx::query("SELECT * FROM constructions WHERE universe=$1 AND ((body=ANY($2) AND status='Active') OR id=ANY($3)) ORDER BY id").bind(u.0).bind(&ids).bind(explicit_operations.iter().map(|o|o.0).collect::<Vec<_>>()).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(|row|{let c=crate::entities::construction(row)?;Ok((c.id,c))}).collect::<Result<_,StoreError>>()?;
    let research = crate::progression::research(tx, &owner_ids).await?;
    let inventories = crate::progression::inventory(tx, &ids).await?;
    let inventory_owners = bodies.values().map(|b| (b.id, b.owner)).collect();
    let fleet_rows=sqlx::query("SELECT * FROM fleets WHERE universe=$1 AND ((owner=ANY($2) AND status<>'Completed') OR id=ANY($3)) ORDER BY id").bind(u.0).bind(&owner_ids).bind(explicit_fleets.iter().map(|f|f.0).collect::<Vec<_>>()).fetch_all(&mut **tx).await.map_err(db_error)?;
    let fleets: BTreeMap<_, _> = crate::entities::fleets(tx, fleet_rows)
        .await?
        .into_iter()
        .map(|f| (f.id, f))
        .collect();
    let mut collection_revisions = BTreeMap::new();
    let mut keys = Vec::new();
    for id in bodies.keys() {
        keys.push(("constructions".to_owned(), id.0));
    }
    for owner in &owners {
        keys.push(("fleets".to_owned(), owner.0));
        keys.push(("research".to_owned(), owner.0))
    }
    for b in bodies.values() {
        keys.push((format!("inventory:{}", b.owner), b.id.0));
    }
    for (kind, key) in keys {
        let revision: Option<i64> = sqlx::query_scalar(
            "SELECT revision FROM collection_heads WHERE universe=$1 AND kind=$2 AND key=$3",
        )
        .bind(u.0)
        .bind(&kind)
        .bind(key)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?;
        collection_revisions.insert(
            if let Some(owner) = kind.strip_prefix("inventory:") {
                format!("inventory:{key}:{owner}")
            } else {
                format!("{kind}:{key}")
            },
            revision.ok_or(StoreError::CorruptData)?,
        );
    }
    let constructions: BTreeMap<OperationId, Construction> = constructions;
    explicit_operations.extend(constructions.keys().copied());
    explicit_fleets.extend(fleets.keys().copied());
    Ok(GameState {
        world: None,
        production_settings: Default::default(),
        research_operations: Default::default(),
        manufacturing_batches: Default::default(),
        progression_reservations: Default::default(),
        universe: u,
        epoch,
        profile_hash: rules.hash.clone(),
        bodies,
        players,
        inventories,
        research,
        constructions,
        fleets,
        reports: BTreeMap::new(),
        coverage: FactCoverage {
            manufacturing_due_count: None,
            moon_removal_bodies: Default::default(),
            production_bodies: Default::default(),
            research_operation_ids: Default::default(),
            research_slot_players: Default::default(),
            owned_body_players: Default::default(),
            lab_construction_players: Default::default(),
            manufacturing_operation_ids: Default::default(),
            manufacturing_bodies: Default::default(),
            reservation_bodies: Default::default(),
            operations: explicit_operations,
            fleet_ids: explicit_fleets,
            bodies: body_ids.clone(),
            construction_bodies: body_ids.clone(),
            inventory_owners,
            research_players: owners.clone(),
            fleet_owners: owners,
        },
        collection_revisions,
    })
}
/// The claim advanced its ordering frontier before releasing the gate. A new
/// conflicting admission cannot appear before that time. An earlier existing
/// input could create a successor, so its own timestamp bounds this batch too.
pub(crate) async fn manufacturing_window(
    tx: &mut Tx<'_>,
    state: &mut GameState,
    input: &OrderedInput,
    lease_until: i64,
) -> Result<(), StoreError> {
    let Input::Event(ScheduledEvent::ManufacturingDue { operation, .. }) = &input.payload else {
        return Ok(());
    };
    let Some(batch) = state.manufacturing_batches.get(operation) else {
        return Ok(());
    };
    let claimed_at = lease_until.saturating_sub(LEASE_MS);
    if batch.status != ManufacturingStatus::Active
        || batch.item == ManufacturedItem::Ship(ShipType::SolarSatellite)
        || batch.consecutive_due_units(claimed_at, None) <= 1
    {
        return Ok(());
    }
    // Satellites change the production rate at each completion. Pending
    // manufacture milestones likewise need per-unit evidence and grant times.
    if let ManufacturedItem::Ship(ship) = batch.item
        && state.world.as_ref().is_some_and(|w| w.records.objective_runs.values().any(|run|
            run.beneficiary == batch.owner && run.program.objectives.iter().any(|d|
                !run.receipts.contains_key(&d.id) && matches!(d.predicate, ObjectivePredicate::Manufacture { ship: wanted, .. } if wanted == ship)
            ))) { return Ok(()); }
    let player_key = serde_json::to_string(&ScopeKey::Player(batch.owner))
        .map_err(|_| StoreError::CorruptData)?;
    let (frontier, boundary): (i64, Option<i64>) = sqlx::query_as(
        "SELECT CASE WHEN r.executor_mode='scoped' THEN e.frontier ELSE r.frontier END,
                least((SELECT min(at_ms) FROM pending_inputs WHERE universe=$1 AND input_id<>$2),
                      (SELECT min(at_ms) FROM runtime_barriers WHERE universe=$1 AND NOT done))
         FROM universe_runtime r LEFT JOIN execution_scopes e ON e.universe=r.universe AND e.key=$3 WHERE r.universe=$1",
    ).bind(input.universe.0).bind(input.id.0).bind(player_key).fetch_one(&mut **tx).await.map_err(db_error)?;
    let count = batch.consecutive_due_units(claimed_at.min(frontier), boundary);
    state.coverage.manufacturing_due_count = (count > 1).then_some(count);
    Ok(())
}
impl PgStore {
    pub(crate) async fn claim_facts(&self, claim: &Claim) -> Result<ClaimSnapshot, StoreError> {
        // A coherent tentative read needs no ordering gate. Final commit fences
        // the lease and revalidates against current facts under the gate.
        let mut tx = crate::snapshots::begin(self, self.worker_pool()?).await?;
        if !valid_claim(&mut tx, claim).await? {
            return Err(StoreError::StaleClaim);
        }
        let i = &claim.input;
        let rules = rules(&mut tx, i.universe).await?;
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM rulesets WHERE hash=$1)")
                .bind(&i.profile_hash.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        if !exists {
            return Err(StoreError::CorruptData);
        }
        let mut state = if rules.world() {
            let selected =
                crate::scoped_facts::select(&mut tx, i.universe, i.actor, &i.payload).await?;
            crate::scoped_facts::load_execution_with_rules(&mut tx, i, &selected.scopes(), &rules)
                .await?
        } else {
            load(
                &mut tx,
                i.universe,
                i.epoch,
                &rules,
                i.actor,
                &i.payload,
                Some(i.id),
            )
            .await?
        };
        crate::paired_activity::project(&mut state, i, &rules)?;
        manufacturing_window(&mut tx, &mut state, i, claim.lease_until).await?;
        validate_rule_references(&mut tx, &state).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(ClaimSnapshot { state, rules })
    }
    pub(crate) async fn quote_facts(
        &self,
        actor: Actor,
        u: UniverseId,
        request: &QuoteRequest,
    ) -> Result<QuoteSnapshot, StoreError> {
        Ok(self.quote_checked(actor, u, request, None).await?.facts.0)
    }
    pub(crate) async fn quote_checked(
        &self,
        actor: Actor,
        u: UniverseId,
        request: &QuoteRequest,
        binding: Option<Binding>,
    ) -> Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let row = crate::snapshots::universe(&mut tx, u).await?;
        if let Some(binding) = binding {
            crate::binding::check_read(&mut tx, binding).await?;
            crate::bots::observe(&mut tx, binding).await?;
            if let QuoteRequest::Fleet { intent } = request {
                crate::bots::require_destination_observation(&mut tx, binding, &intent.destination)
                    .await?;
            }
        }
        let Actor::Player(player) = actor else {
            return Err(StoreError::NotFound);
        };
        let at = crate::snapshots::estimate_time(&mut tx, u, player).await?;
        let r = rules(&mut tx, u).await?;
        let (body, input) = match request {
            QuoteRequest::Fleet { intent } => (
                intent.origin,
                Command::World {
                    action: WorldAction::LaunchFleet {
                        intent: intent.clone(),
                        expected_terms_hash: Hash(String::new()),
                    },
                },
            ),
            QuoteRequest::Demolition { body, building } => (
                *body,
                Command::StartDemolition {
                    body: *body,
                    building: *building,
                    expected_terms_hash: Hash(String::new()),
                },
            ),
            QuoteRequest::Research { host, research } => (
                *host,
                Command::StartResearch {
                    host: *host,
                    research: *research,
                    expected_terms_hash: Hash(String::new()),
                },
            ),
            QuoteRequest::Manufacture {
                body,
                item,
                quantity,
            } => (
                *body,
                Command::StartManufacture {
                    body: *body,
                    item: *item,
                    quantity: *quantity,
                    expected_terms_hash: Hash(String::new()),
                },
            ),
            QuoteRequest::Upgrade { body, building } => (
                *body,
                Command::StartUpgrade {
                    body: *body,
                    building: *building,
                    expected_terms_hash: Hash(String::new()),
                },
            ),
            QuoteRequest::Transport {
                origin,
                target,
                ships,
                cargo,
                speed_percent,
            } => (
                *origin,
                Command::LaunchTransport {
                    origin: *origin,
                    target: *target,
                    ships: ships.clone(),
                    cargo: *cargo,
                    speed_percent: *speed_percent,
                    expected_terms_hash: Hash(String::new()),
                },
            ),
        };
        let state = load(
            &mut tx,
            u,
            Epoch(row.try_get("epoch").map_err(db_error)?),
            &r,
            actor,
            &Input::Command(input),
            None,
        )
        .await?;
        if !state
            .bodies
            .get(&body)
            .is_some_and(|b| actor == Actor::Player(b.owner))
        {
            return Err(StoreError::NotFound);
        }
        let revision = if let Actor::Player(p) = actor {
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(u.0)
                .bind(p.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?
        } else {
            return Err(StoreError::NotFound);
        };
        let snapshot = (
            QuoteSnapshot {
                state,
                at,
                rules: r,
            },
            revision,
        );
        let Actor::Player(player) = actor else {
            return Err(StoreError::NotFound);
        };
        let snapshot = crate::snapshots::wrap(&mut tx, u, player, snapshot).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(snapshot)
    }
    pub(crate) async fn world_rules(&self, u: UniverseId) -> Result<Ruleset, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let rules = rules(&mut tx, u).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(rules)
    }
}
