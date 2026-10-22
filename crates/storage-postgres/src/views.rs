use crate::*;
use orbit_application::*;
use orbit_engine::*;
use sqlx::{Row, postgres::PgRow};
use std::collections::BTreeMap;
fn decode<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> Result<T, StoreError> {
    serde_json::from_value(value).map_err(|_| StoreError::CorruptData)
}
fn enum_text<T: serde::de::DeserializeOwned>(s: String) -> Result<T, StoreError> {
    decode(serde_json::Value::String(s))
}
pub(crate) async fn bodies(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    rows: Vec<PgRow>,
) -> Result<Vec<Body>, StoreError> {
    let mut out = Vec::new();
    for r in rows {
        let id: uuid::Uuid = r.try_get("id").map_err(db_error)?;
        let levels = sqlx::query("SELECT building,level FROM building_levels WHERE body=$1")
            .bind(id)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?
            .into_iter()
            .map(|r| {
                Ok((
                    enum_text(r.try_get("building").map_err(db_error)?)?,
                    u32::try_from(r.try_get::<i64, _>("level").map_err(db_error)?)
                        .map_err(|_| StoreError::CorruptData)?,
                ))
            })
            .collect::<Result<BTreeMap<Building, u32>, StoreError>>()?;
        if Building::ALL.iter().any(|b| !levels.contains_key(b)) {
            return Err(StoreError::CorruptData);
        }
        out.push(Body {
            id: id.into(),
            universe: UniverseId(r.try_get("universe").map_err(db_error)?),
            owner: PlayerId(r.try_get("owner").map_err(db_error)?),
            kind: enum_text(r.try_get("kind").map_err(db_error)?)?,
            coordinates: coordinates(&r)?,
            fields: u32::try_from(r.try_get::<i64, _>("fields").map_err(db_error)?)
                .map_err(|_| StoreError::CorruptData)?,
            max_temperature: r.try_get("max_temperature").map_err(db_error)?,
            retained_capacity: sqlx::query_scalar::<_, serde_json::Value>(
                "SELECT capacity FROM legacy_body_capacities WHERE body=$1",
            )
            .bind(id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?
            .map(decode)
            .transpose()?,
            checkpoint: ResourceCheckpoint {
                amounts: decode(r.try_get("amounts").map_err(db_error)?)?,
                carry: decode(r.try_get("carry").map_err(db_error)?)?,
                at: r.try_get("checkpoint_at").map_err(db_error)?,
            },
            levels,
            revision: r.try_get("revision").map_err(db_error)?,
        });
    }
    Ok(out)
}
fn coordinates(r: &PgRow) -> Result<Coordinates, StoreError> {
    let read = |key| {
        u32::try_from(r.try_get::<i32, _>(key).map_err(db_error)?)
            .map_err(|_| StoreError::CorruptData)
    };
    Ok(Coordinates {
        galaxy: read("galaxy")?,
        system: read("system")?,
        position: read("position")?,
    })
}
pub(crate) async fn public_destinations(
    tx: &mut crate::ordering::Tx<'_>,
    universe: UniverseId,
) -> Result<Vec<PublicDestination>, StoreError> {
    let destinations = sqlx::query("SELECT id,galaxy,system,position,kind FROM bodies WHERE universe=$1 ORDER BY galaxy,system,position,kind,id LIMIT 101").bind(universe.0).fetch_all(&mut **tx).await.map_err(db_error)?.into_iter().map(|r|Ok(PublicDestination{id:BodyId(r.try_get("id").map_err(db_error)?),coordinates:coordinates(&r)?,kind:enum_text(r.try_get("kind").map_err(db_error)?)?})).collect::<Result<Vec<_>,StoreError>>()?;
    Ok(destinations)
}
impl GameStore for PgStore {
    async fn bound_world_query(
        &self,
        b: Binding,
        query: WorldQueryKind,
    ) -> Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError> {
        Ok(self
            .load_scoped_snapshot(FactQuery::World { binding: b, query })
            .await?
            .into_quote())
    }
    async fn bound_presence4(&self, e: CommandEnvelopeV4) -> Result<BoundReceipt, StoreError> {
        let command = e.domain().map_err(|_| StoreError::Conflict)?;
        if !matches!(
            command,
            Command::World {
                action: WorldAction::RecordForegroundPresence {
                    paired_command_id: None,
                    ..
                }
            }
        ) {
            return Err(StoreError::Conflict);
        }
        let receipt = self
            .admit_checked(
                Actor::Player(e.binding.player),
                e.binding.universe,
                CommandEnvelope {
                    protocol: 4,
                    epoch: e.binding.epoch,
                    command_id: e.command_id,
                    command,
                },
                Some((e.binding, hash(&e))),
            )
            .await?;
        let mut receipt = BoundReceipt::new(e.binding, receipt);
        receipt.protocol = 4;
        Ok(receipt)
    }

    async fn bound_admit4(&self, pair: ForegroundAction) -> Result<BoundReceipt, StoreError> {
        self.admit_pair(pair).await
    }
    async fn bound_world(
        &self,
        b: Binding,
    ) -> Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError> {
        Ok(self
            .load_scoped_snapshot(FactQuery::Overview(b))
            .await?
            .into_quote())
    }
    async fn world_reports(
        &self,
        q: ReportsQuery4,
    ) -> Result<ReadSnapshot<(ReportsPage4, i64)>, StoreError> {
        self.report_page(q).await
    }
    async fn world_report(
        &self,
        b: Binding,
        id: ReportId,
    ) -> Result<ReadSnapshot<(ReportDetail4, i64, i64)>, StoreError> {
        self.report_detail(b, id).await
    }

    async fn bound_admit3(&self, e: CommandEnvelopeV3) -> Result<BoundReceipt, StoreError> {
        let domain = e.domain().map_err(|_| StoreError::Conflict)?;
        let intent = e.intent_hash().map_err(|_| StoreError::Conflict)?;
        let receipt = self
            .admit_checked(
                Actor::Player(e.binding.player),
                e.binding.universe,
                domain,
                Some((e.binding, intent)),
            )
            .await?;
        let mut r = BoundReceipt::new(e.binding, receipt);
        r.protocol = 3;
        Ok(r)
    }
    async fn current_binding(
        &self,
        a: AccountId,
        u: UniverseId,
    ) -> Result<(Binding, i64), StoreError> {
        self.discover(a, u).await
    }
    async fn bound_view(&self, b: Binding) -> Result<ReadSnapshot<ViewerSnapshot>, StoreError> {
        self.view_checked(Actor::Player(b.player), b.universe, Some(b))
            .await
    }
    async fn bound_quote(
        &self,
        b: Binding,
        r: &QuoteRequest,
    ) -> Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError> {
        Ok(self
            .load_scoped_snapshot(FactQuery::Quote {
                binding: b,
                request: r.clone(),
            })
            .await?
            .into_quote())
    }
    async fn bound_admit(&self, e: CommandEnvelopeV2) -> Result<BoundReceipt, StoreError> {
        let domain = e.domain().map_err(|_| StoreError::Conflict)?;
        let intent = e.intent_hash().map_err(|_| StoreError::Conflict)?;
        let receipt = self
            .admit_checked(
                Actor::Player(e.binding.player),
                e.binding.universe,
                domain,
                Some((e.binding, intent)),
            )
            .await?;
        Ok(BoundReceipt::new(e.binding, receipt))
    }
    async fn bound_receipt(&self, b: Binding, id: CommandId) -> Result<BoundReceipt, StoreError> {
        self.receipt_v2(b, id).await
    }

    async fn admit(
        &self,
        actor: Actor,
        u: UniverseId,
        envelope: CommandEnvelope,
    ) -> Result<Receipt, StoreError> {
        self.admit_input(actor, u, envelope).await
    }
    async fn receipt(
        &self,
        actor: Actor,
        u: UniverseId,
        id: CommandId,
    ) -> Result<Receipt, StoreError> {
        self.read_receipt(actor, u, id).await
    }
    async fn claim_next(
        &self,
        u: UniverseId,
        worker: WorkerId,
    ) -> Result<Option<Claim>, StoreError> {
        self.claim_head(u, worker).await
    }
    async fn load_claim(&self, claim: &Claim) -> Result<ClaimSnapshot, StoreError> {
        self.claim_facts(claim).await
    }
    async fn renew_claim(&self, claim: &Claim) -> Result<Claim, StoreError> {
        self.renew(claim).await
    }
    async fn commit_claim(
        &self,
        claim: &Claim,
        result: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        self.commit(claim, result).await
    }
    async fn fail_claim(&self, claim: &Claim, error: &InvariantError) -> Result<(), StoreError> {
        self.block(claim, error).await
    }
    async fn load_quote(
        &self,
        actor: Actor,
        u: UniverseId,
        request: &QuoteRequest,
    ) -> Result<QuoteSnapshot, StoreError> {
        self.quote_facts(actor, u, request).await
    }
    async fn load_rules(&self, u: UniverseId) -> Result<Ruleset, StoreError> {
        self.world_rules(u).await
    }

    async fn ready(&self) -> Result<(), StoreError> {
        self.check_startup(None)
            .await
            .map_err(crate::StartupError::store_error)
    }
    async fn load_view(
        &self,
        actor: Actor,
        universe: UniverseId,
    ) -> Result<ViewerSnapshot, StoreError> {
        self.view_checked(actor, universe, None)
            .await
            .map(|s| s.facts)
    }
}
impl PgStore {
    pub(crate) async fn view_checked(
        &self,
        actor: Actor,
        universe: UniverseId,
        binding: Option<Binding>,
    ) -> Result<ReadSnapshot<ViewerSnapshot>, StoreError> {
        let Actor::Player(player) = actor else {
            return Err(StoreError::NotFound);
        };
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let u = sqlx::query("SELECT epoch,speed FROM universes WHERE id=$1")
            .bind(universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        if let Some(binding) = binding {
            crate::binding::check_read(&mut tx, binding).await?;
        }
        let revision: i64 =
            sqlx::query_scalar("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2")
                .bind(universe.0)
                .bind(player.0)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
                .ok_or(StoreError::NotFound)?;
        let at = crate::snapshots::safe_time(&mut tx, universe, player).await?;
        let rules = crate::facts::rules(&mut tx, universe).await?;
        if rules.world() {
            let snapshot = crate::world::viewer_snapshot(
                &mut tx,
                universe,
                Epoch(u.try_get("epoch").map_err(db_error)?),
                player,
                revision,
                at,
                rules,
            )
            .await?;
            let snapshot = crate::snapshots::wrap(&mut tx, universe, player, snapshot).await?;
            tx.commit().await.map_err(db_error)?;
            return Ok(snapshot);
        }
        let rows = sqlx::query("SELECT * FROM bodies WHERE universe=$1 AND owner=$2 ORDER BY id")
            .bind(universe.0)
            .bind(player.0)
            .fetch_all(&mut *tx)
            .await
            .map_err(db_error)?;
        let owned = bodies(&mut tx, rows).await?;
        let inventories = crate::progression::inventory(
            &mut tx,
            &owned.iter().map(|b| b.id.0).collect::<Vec<_>>(),
        )
        .await?;
        let research = crate::progression::research(&mut tx, &[player.0])
            .await?
            .remove(&player)
            .ok_or(StoreError::CorruptData)?;
        let destinations = public_destinations(&mut tx, universe).await?;

        let constructions=sqlx::query("SELECT * FROM constructions WHERE universe=$1 AND owner=$2 AND status='Active' ORDER BY id").bind(universe.0).bind(player.0).fetch_all(&mut *tx).await.map_err(db_error)?.into_iter().map(crate::entities::construction).collect::<Result<_,_>>()?;
        let fleet_rows=sqlx::query("SELECT * FROM fleets WHERE universe=$1 AND owner=$2 AND status<>'Completed' ORDER BY id").bind(universe.0).bind(player.0).fetch_all(&mut *tx).await.map_err(db_error)?;
        let fleets = crate::entities::fleets(&mut tx, fleet_rows).await?;
        let mut reports = Vec::new();
        for row in sqlx::query("SELECT r.* FROM reports r JOIN report_recipients rr ON rr.report=r.id WHERE r.universe=$1 AND rr.player=$2 ORDER BY r.at_ms DESC,r.id DESC LIMIT 101").bind(universe.0).bind(player.0).fetch_all(&mut *tx).await.map_err(db_error)?{reports.push(crate::entities::report(&mut tx,row).await?);}
        let mut keys = vec![
            ("research".to_owned(), player.0),
            ("fleets".to_owned(), player.0),
        ];
        for b in &owned {
            keys.push(("constructions".to_owned(), b.id.0));
            keys.push((format!("inventory:{player}"), b.id.0));
        }
        for (kind, key) in keys {
            let revision: Option<i64> = sqlx::query_scalar(
                "SELECT revision FROM collection_heads WHERE universe=$1 AND kind=$2 AND key=$3",
            )
            .bind(universe.0)
            .bind(kind)
            .bind(key)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
            if !revision.is_some_and(|r| r >= 0) {
                return Err(StoreError::CorruptData);
            }
        }
        let coverage = FactCoverage {
            production_bodies: Default::default(),
            research_operation_ids: Default::default(),
            research_slot_players: Default::default(),
            owned_body_players: Default::default(),
            lab_construction_players: Default::default(),
            manufacturing_operation_ids: Default::default(),
            manufacturing_bodies: Default::default(),
            reservation_bodies: Default::default(),
            bodies: owned.iter().map(|b| b.id).collect(),
            construction_bodies: owned.iter().map(|b| b.id).collect(),
            inventory_owners: owned.iter().map(|b| (b.id, b.owner)).collect(),
            research_players: std::collections::BTreeSet::from([player]),
            fleet_owners: std::collections::BTreeSet::from([player]),
            ..Default::default()
        };
        let progression = if rules.progression() {
            Some(
                crate::progression_state::load(
                    &mut tx,
                    universe,
                    Epoch(u.try_get("epoch").map_err(db_error)?),
                    rules.hash.clone(),
                    actor,
                    &Input::Command(Command::RecallFleet {
                        fleet: FleetId::default(),
                    }),
                    None,
                )
                .await?,
            )
        } else {
            None
        };
        let world = None;
        let coverage = progression
            .as_ref()
            .map_or(coverage, |s| s.coverage.clone());
        let snapshot = ViewerSnapshot {
            unread_report: None,
            world,
            progression,
            coverage,
            universe,
            epoch: Epoch(u.try_get("epoch").map_err(db_error)?),
            player,
            revision,
            at,
            rules,
            constructions,
            fleets,
            reports,
            bodies: owned,
            inventories,
            research,
            destinations,
        };
        let snapshot = crate::snapshots::wrap(&mut tx, universe, player, snapshot).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(snapshot)
    }
}
