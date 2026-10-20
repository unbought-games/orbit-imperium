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
    let row = sqlx::query("SELECT r.profile,u.profile_hash,u.speed FROM universes u LEFT JOIN rulesets r ON r.hash=u.profile_hash WHERE u.id=$1")
        .bind(u.0).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
    let profile: Option<serde_json::Value> = row.try_get("profile").map_err(db_error)?;
    let rules = decode_rules(profile.ok_or(StoreError::CorruptData)?)?;
    if rules.hash.0 != row.try_get::<String, _>("profile_hash").map_err(db_error)?
        || rules.speed != row.try_get::<i32, _>("speed").map_err(db_error)?
    {
        return Err(StoreError::CorruptData);
    }
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
        hashes.extend(w.records.policies.values().map(|x| x.policy_hash.0.clone()));
        hashes.extend(w.records.fleets.values().flat_map(|x| {
            [
                x.terms.profile_hash.0.clone(),
                x.authorization.policy_hash.0.clone(),
            ]
        }));
        hashes.extend(w.records.lots.iter().map(|x| x.rules_hash.0.clone()));
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
pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    profile_hash: Hash,
    actor: Actor,
    input: &Input,
    input_id: Option<InputId>,
) -> Result<GameState, StoreError> {
    if rules(tx, u).await?.world() {
        let selected = crate::scoped_facts::select(tx, u, actor, input).await?;
        return crate::world::load_selected(tx, u, epoch, profile_hash, input, input_id, selected)
            .await;
    }
    if rules(tx, u).await?.progression() {
        return crate::progression_state::load(tx, u, epoch, profile_hash, actor, input, input_id)
            .await;
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
            ScheduledEvent::FleetLegDue { .. }
            | ScheduledEvent::DebrisCleanupDue { .. }
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
        profile_hash,
        bodies,
        players,
        inventories,
        research,
        constructions,
        fleets,
        reports: BTreeMap::new(),
        coverage: FactCoverage {
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
impl PgStore {
    pub(crate) async fn claim_facts(&self, claim: &Claim) -> Result<ClaimSnapshot, StoreError> {
        let mut tx = self.begin_tx(self.worker_pool()?).await?;
        gate(&mut tx, claim.input.universe).await?;
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
        let state = if rules.world() {
            let selected =
                crate::scoped_facts::select(&mut tx, i.universe, i.actor, &i.payload).await?;
            crate::scoped_facts::load_execution(&mut tx, i, &selected.scopes())
                .await?
                .state
        } else {
            load(
                &mut tx,
                i.universe,
                i.epoch,
                rules.hash.clone(),
                i.actor,
                &i.payload,
                Some(i.id),
            )
            .await?
        };
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
            r.hash.clone(),
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
