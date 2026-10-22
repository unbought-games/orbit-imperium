use crate::ordering::*;
use crate::*;
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use std::collections::BTreeSet;
#[derive(Clone, Copy)]
pub(crate) enum CommitClaim<'a> {
    Serial(&'a Claim),
    Scoped(&'a ScopedClaim),
}
impl CommitClaim<'_> {
    fn input(&self) -> &OrderedInput {
        match self {
            Self::Serial(c) => &c.input,
            Self::Scoped(c) => &c.input,
        }
    }
}
impl PgStore {
    pub(crate) async fn commit(
        &self,
        claim: &Claim,
        outcome: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        self.commit_transition(CommitClaim::Serial(claim), outcome)
            .await
    }
    pub(crate) async fn commit_transition(
        &self,
        claim: CommitClaim<'_>,
        outcome: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        let i = claim.input();
        let mut tx = self.begin_tx(self.worker_pool()?).await?;
        if matches!(claim, CommitClaim::Serial(_)) {
            gate(&mut tx, i.universe).await?;
        }
        if let Some(record) =
            sqlx::query("SELECT input FROM transition_journal WHERE input_id=$1 AND universe=$2")
                .bind(i.id.0)
                .bind(i.universe.0)
                .fetch_optional(&mut *tx)
                .await
                .map_err(db_error)?
        {
            let recorded: OrderedInput = decode(record.try_get("input").map_err(db_error)?)?;
            if recorded != *i {
                return Err(StoreError::Conflict);
            }
            let receipt = sqlx::query_scalar::<_, serde_json::Value>(
                "SELECT receipt FROM commands WHERE input_id=$1",
            )
            .bind(i.id.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .map(decode)
            .transpose()?;
            return Ok(CommitOutcome::Committed {
                input_id: i.id,
                receipt,
            });
        }
        let valid = match claim {
            CommitClaim::Serial(c) => valid_claim(&mut tx, c).await?,
            CommitClaim::Scoped(c) => crate::scoped_ordering::valid(&mut tx, c).await?,
        };
        if !valid {
            self.observe_event(RuntimeEvent::StaleCommit);
            return Ok(CommitOutcome::StaleClaim);
        }
        let rt = runtime(&mut tx, i.universe).await?;
        let facts = match claim {
            CommitClaim::Serial(_) => {
                let at = now(&mut tx).await?;
                let frontier: i64 = rt.try_get("frontier").map_err(db_error)?;
                if head(&mut tx, i.universe, at.max(frontier)).await?.as_ref() != Some(i) {
                    return Err(StoreError::CorruptData);
                }
                let rules = crate::facts::rules(&mut tx, i.universe).await?;
                crate::facts::load(
                    &mut tx,
                    i.universe,
                    i.epoch,
                    rules.hash.clone(),
                    i.actor,
                    &i.payload,
                    Some(i.id),
                )
                .await?
            }
            CommitClaim::Scoped(c) => {
                crate::scoped_facts::load_execution(&mut tx, i, &c.scopes)
                    .await?
                    .state
            }
        };
        let rules = crate::facts::rules(&mut tx, i.universe).await?;
        crate::facts::validate_rule_references(&mut tx, &facts).await?;
        let mut result_ids = Vec::new();
        match &outcome {
            TransitionResult::InvalidState(_) => return Err(StoreError::CorruptData),
            TransitionResult::Rejected(_) => {}
            TransitionResult::Applied(change) => {
                if change.input != i.id
                    || change.profile_hash != facts.profile_hash
                    || change.expected_facts_hash != hash(&facts)
                    || change.expected_collection_revisions != facts.collection_revisions
                {
                    return Ok(CommitOutcome::Conflict);
                }
                for body in &change.bodies {
                    let Some(previous) = facts.bodies.get(&body.id) else {
                        crate::colonization::insert_colony(&mut tx, i, &facts, change, body)
                            .await?;
                        result_ids.push(body.id.to_string());
                        continue;
                    };
                    let updated=sqlx::query("UPDATE bodies SET amounts=$2,carry=$3,checkpoint_at=$4,revision=$5 WHERE id=$1 AND revision=$6 AND universe=$7").bind(body.id.0).bind(sqlx::types::Json(body.checkpoint.amounts)).bind(sqlx::types::Json(body.checkpoint.carry)).bind(body.checkpoint.at).bind(body.revision).bind(previous.revision).bind(i.universe.0).execute(&mut *tx).await.map_err(db_error)?;
                    if updated.rows_affected() != 1 {
                        return Ok(CommitOutcome::Conflict);
                    }
                    for (building, level) in &body.levels {
                        sqlx::query(
                            "UPDATE building_levels SET level=$3 WHERE body=$1 AND building=$2",
                        )
                        .bind(body.id.0)
                        .bind(format!("{building:?}"))
                        .bind(i64::from(*level))
                        .execute(&mut *tx)
                        .await
                        .map_err(db_error)?;
                    }
                }
                let mut collections = BTreeSet::new();
                for operation in &change.constructions {
                    crate::entities::save_construction(
                        &mut tx,
                        i.universe,
                        operation,
                        facts.constructions.get(&operation.id),
                    )
                    .await?;
                    if let Some(material) = &operation.progression {
                        sqlx::query("UPDATE constructions SET progression=$2 WHERE id=$1")
                            .bind(operation.id.0)
                            .bind(sqlx::types::Json(material))
                            .execute(&mut *tx)
                            .await
                            .map_err(db_error)?;
                    }
                    collections.insert(operation.body);
                    result_ids.push(operation.id.to_string());
                }
                for body in collections {
                    sqlx::query("INSERT INTO collection_heads(universe,kind,key,revision) VALUES($1,'constructions',$2,1) ON CONFLICT(universe,kind,key) DO UPDATE SET revision=collection_heads.revision+1").bind(i.universe.0).bind(body.0).execute(&mut *tx).await.map_err(db_error)?;
                }
                let mut changed_collections = BTreeSet::new();
                for fleet in &change.fleets {
                    crate::entities::save_fleet(
                        &mut tx,
                        i.universe,
                        fleet,
                        facts.fleets.get(&fleet.id),
                    )
                    .await?;
                    changed_collections.insert(("fleets".to_owned(), fleet.owner.0));
                    result_ids.push(fleet.id.to_string());
                }
                for ships in &change.inventories {
                    let previous = facts.inventories.iter().find(|v| {
                        v.body == ships.body && v.owner == ships.owner && v.item == ships.item
                    });
                    if let Some(previous) = previous {
                        let n=sqlx::query("UPDATE inventories SET count=$4,revision=$5 WHERE body=$1 AND owner=$2 AND item=$3 AND revision=$6").bind(ships.body.0).bind(ships.owner.0).bind(sqlx::types::Json(ships.item)).bind(ships.count).bind(ships.revision).bind(previous.revision).execute(&mut *tx).await.map_err(db_error)?;
                        if n.rows_affected() != 1 {
                            return Ok(CommitOutcome::Conflict);
                        }
                    } else {
                        sqlx::query("INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,$4,$5)").bind(ships.body.0).bind(ships.owner.0).bind(sqlx::types::Json(ships.item)).bind(ships.count).bind(ships.revision).execute(&mut *tx).await.map_err(db_error)?;
                    }
                    changed_collections
                        .insert((format!("inventory:{}", ships.owner), ships.body.0));
                }
                for research in &change.research {
                    validate_research_catalog(research, &rules)
                        .map_err(|_| StoreError::CorruptData)?;
                    let previous = facts
                        .research
                        .get(&research.owner)
                        .ok_or(StoreError::CorruptData)?;
                    for (key, level) in &research.levels {
                        let n=sqlx::query("UPDATE research_levels SET level=$3,revision=$4 WHERE owner=$1 AND research=$2 AND revision=$5").bind(research.owner.0).bind(format!("{key:?}")).bind(i64::from(*level)).bind(research.revision).bind(previous.revision).execute(&mut *tx).await.map_err(db_error)?;
                        if n.rows_affected() != 1 {
                            return Ok(CommitOutcome::Conflict);
                        }
                    }
                    changed_collections.insert(("research".to_owned(), research.owner.0));
                }
                for (kind, key) in changed_collections {
                    sqlx::query("INSERT INTO collection_heads(universe,kind,key,revision) VALUES($1,$2,$3,1) ON CONFLICT(universe,kind,key) DO UPDATE SET revision=collection_heads.revision+1").bind(i.universe.0).bind(kind).bind(key).execute(&mut *tx).await.map_err(db_error)?;
                }
                if i.protocol >= 3 {
                    crate::progression_state::save(&mut tx, i.universe, &facts, change).await?;
                    result_ids.extend(change.research_operations.iter().map(|x| x.id.to_string()));
                    result_ids.extend(
                        change
                            .manufacturing_batches
                            .iter()
                            .map(|x| x.id.to_string()),
                    );
                }
                if let Some(world) = &change.world {
                    crate::world::save(&mut tx, i, &facts, world).await?;
                    result_ids.extend(
                        world
                            .records
                            .fleets
                            .keys()
                            .filter(|id| {
                                !facts
                                    .world
                                    .as_ref()
                                    .is_some_and(|w| w.records.fleets.contains_key(id))
                            })
                            .map(ToString::to_string),
                    );
                }
                for report in &change.reports {
                    crate::entities::save_report(&mut tx, i.universe, report).await?;
                }
                for cancelled in &change.cancelled_events {
                    let cancelled_ids: Vec<uuid::Uuid> = sqlx::query_scalar("UPDATE scheduled_events SET cancelled=true WHERE universe=$1 AND event=$2 AND NOT done AND NOT cancelled RETURNING id")
                        .bind(i.universe.0).bind(sqlx::types::Json(cancelled)).fetch_all(&mut *tx).await.map_err(db_error)?;
                    for id in cancelled_ids {
                        if let CommitClaim::Scoped(c) = claim {
                            let scopes = crate::scoped_ordering::declarations(
                                &mut tx,
                                i.universe,
                                InputId(id),
                            )
                            .await?;
                            validate_successor_scopes(&c.scopes, &scopes)
                                .map_err(|_| StoreError::CorruptData)?;
                        }
                        sqlx::query("DELETE FROM input_scopes WHERE universe=$1 AND input_id=$2")
                            .bind(i.universe.0)
                            .bind(id)
                            .execute(&mut *tx)
                            .await
                            .map_err(db_error)?;
                    }
                }
                for new_event in &change.events {
                    if new_event.at <= i.at {
                        return Err(StoreError::CorruptData);
                    }
                    let sequence = next_sequence(&mut tx, i.universe).await?;
                    let next = OrderedInput {
                        schema_version: i.schema_version,
                        id: new_event.id,
                        universe: i.universe,
                        epoch: i.epoch,
                        actor: Actor::Scheduler,
                        at: new_event.at,
                        phase: 0,
                        sequence,
                        protocol: i.protocol,
                        profile_hash: change.profile_hash.clone(),
                        payload: Input::Event(new_event.event.clone()),
                    };
                    sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event) VALUES($1,$2,$3,$4,$5,$6)").bind(new_event.id.0).bind(i.universe.0).bind(new_event.at).bind(sequence).bind(sqlx::types::Json(&next)).bind(sqlx::types::Json(&new_event.event)).execute(&mut *tx).await.map_err(db_error)?;
                    if matches!(claim, CommitClaim::Scoped(_))
                        || rt.try_get::<String, _>("executor_mode").map_err(db_error)?
                            == "preparing"
                    {
                        let scopes = crate::scoped_facts::select(
                            &mut tx,
                            i.universe,
                            Actor::Scheduler,
                            &next.payload,
                        )
                        .await?
                        .scopes();
                        if let CommitClaim::Scoped(c) = claim {
                            validate_successor_scopes(&c.scopes, &scopes)
                                .map_err(|_| StoreError::CorruptData)?;
                        }
                        crate::admission::register(&mut tx, &next, &scopes).await?;
                    }
                }
                for viewer in &change.affected_viewers {
                    let updated=sqlx::query("UPDATE viewer_heads SET revision=revision+1,changed_at=$3,changed_at_generation=$4 WHERE universe=$1 AND player=$2").bind(i.universe.0).bind(viewer.0).bind(i.at).bind(rt.try_get::<i64,_>("mode_generation").map_err(db_error)?).execute(&mut *tx).await.map_err(db_error)?;
                    if updated.rows_affected() != 1 {
                        return Err(StoreError::CorruptData);
                    }
                }
            }
        }
        let receipt = match i.actor {
            Actor::Player(player) => {
                let mut receipt:Receipt=decode(sqlx::query_scalar("SELECT receipt FROM commands WHERE input_id=$1 AND universe=$2 AND actor=$3").bind(i.id.0).bind(i.universe.0).bind(player.0).fetch_one(&mut *tx).await.map_err(db_error)?)?;
                let revision: i64 = sqlx::query_scalar(
                    "SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2",
                )
                .bind(i.universe.0)
                .bind(player.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
                receipt.executed_at = Some(i.at);
                receipt.status = match &outcome {
                    TransitionResult::Applied(_) => ReceiptStatus::Committed {
                        result_ids,
                        minimum_viewer_revision: revision.to_string(),
                    },
                    TransitionResult::Rejected(code) => {
                        ReceiptStatus::Rejected { code: code.clone() }
                    }
                    TransitionResult::InvalidState(_) => return Err(StoreError::CorruptData),
                };
                sqlx::query("UPDATE commands SET receipt=$2,done=true WHERE input_id=$1")
                    .bind(i.id.0)
                    .bind(sqlx::types::Json(&receipt))
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
                Some(receipt)
            }
            Actor::Scheduler => {
                sqlx::query("UPDATE scheduled_events SET done=true WHERE id=$1")
                    .bind(i.id.0)
                    .execute(&mut *tx)
                    .await
                    .map_err(db_error)?;
                None
            }
        };
        let viewers = match &outcome {
            TransitionResult::Applied(change) => change.affected_viewers.clone(),
            _ => BTreeSet::new(),
        };
        crate::updates::append_updates(&mut tx, i, receipt.as_ref(), &viewers).await?;
        let cursor = match claim {
            CommitClaim::Serial(c) => c
                .prior_cursor
                .checked_add(1)
                .ok_or(StoreError::CorruptData)?,
            CommitClaim::Scoped(_) => next_sequence(&mut tx, i.universe).await?,
        };
        sqlx::query("INSERT INTO transition_journal(universe,cursor,input_id,input,facts,outcome) VALUES($1,$2,$3,$4,$5,$6)").bind(i.universe.0).bind(cursor).bind(i.id.0).bind(sqlx::types::Json(i)).bind(sqlx::types::Json(facts)).bind(sqlx::types::Json(outcome)).execute(&mut *tx).await.map_err(db_error)?;
        #[cfg(feature = "test-support")]
        {
            self.test_fault("after_writes").await?;
            self.test_input_fault("after_writes", i).await?;
        }
        let mut _final_hold = None;
        match claim {
            CommitClaim::Serial(_) => {
                sqlx::query("UPDATE universe_runtime SET cursor=$2,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL WHERE universe=$1").bind(i.universe.0).bind(cursor).execute(&mut *tx).await.map_err(db_error)?;
            }
            CommitClaim::Scoped(c) => {
                let waiting = std::time::Instant::now();
                crate::scoped_ordering::control(&mut tx, i.universe).await?;
                crate::scoped_ordering::lock_scopes(&mut tx, i.universe, &c.scopes, false).await?;
                self.observer
                    .duration(RuntimeStage::OrderingWait, waiting.elapsed());
                _final_hold = Some(self.timer(RuntimeStage::OrderingHold));
                if !crate::scoped_ordering::valid(&mut tx, c).await? {
                    self.observe_event(RuntimeEvent::StaleCommit);
                    return Ok(CommitOutcome::StaleClaim);
                }
                sqlx::query("UPDATE execution_scopes SET claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL,resolved_at=$3,resolved_phase=$4,resolved_ordinal=$5 WHERE universe=$1 AND key=ANY($2)")
                    .bind(i.universe.0).bind(crate::admission::scope_keys(&c.scopes)).bind(i.at).bind(i.phase).bind(i.sequence).execute(&mut *tx).await.map_err(db_error)?;
            }
        }
        sqlx::query("DELETE FROM input_scopes WHERE universe=$1 AND input_id=$2")
            .bind(i.universe.0)
            .bind(i.id.0)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        #[cfg(feature = "test-support")]
        {
            self.test_fault("before_commit").await?;
            self.test_input_fault("before_commit", i).await?;
        }
        let committed_at = now(&mut tx).await?;
        tx.commit().await.map_err(db_error)?;
        drop(_final_hold);
        self.observe_event(RuntimeEvent::Committed);
        self.observer.duration(
            RuntimeStage::Settlement,
            std::time::Duration::from_millis(committed_at.saturating_sub(i.at).max(0) as u64),
        );
        #[cfg(feature = "test-support")]
        {
            self.test_fault("after_commit").await?;
            self.test_input_fault("after_commit", i).await?;
        }
        Ok(CommitOutcome::Committed {
            input_id: i.id,
            receipt,
        })
    }
}
