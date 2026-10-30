use orbit_application::*;
use orbit_engine::*;
use std::sync::{Arc, Mutex};
use uuid::Uuid;
#[derive(Clone)]
struct Memory {
    facts: ViewerSnapshot,
    state: Arc<Mutex<(usize, usize)>>,
    resets: usize,
    foreign: bool,
    mismatch: bool,
}
#[allow(unused_variables)]
impl GameStore for Memory {
    async fn admit(
        &self,
        actor: Actor,
        universe: UniverseId,
        envelope: CommandEnvelope,
    ) -> Result<Receipt, StoreError> {
        panic!("unexpected store call")
    }
    async fn receipt(
        &self,
        actor: Actor,
        universe: UniverseId,
        id: CommandId,
    ) -> Result<Receipt, StoreError> {
        panic!("unexpected store call")
    }
    async fn claim_next(
        &self,
        universe: UniverseId,
        worker: WorkerId,
    ) -> Result<Option<Claim>, StoreError> {
        panic!("unexpected store call")
    }
    async fn load_claim(&self, claim: &Claim) -> Result<ClaimSnapshot, StoreError> {
        panic!("unexpected store call")
    }
    async fn renew_claim(&self, claim: &Claim) -> Result<Claim, StoreError> {
        panic!("unexpected store call")
    }
    async fn commit_claim(
        &self,
        claim: &Claim,
        result: orbit_engine::TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        panic!("unexpected store call")
    }
    async fn fail_claim(
        &self,
        claim: &Claim,
        error: &orbit_engine::InvariantError,
    ) -> Result<(), StoreError> {
        panic!("unexpected store call")
    }
    async fn load_quote(
        &self,
        actor: Actor,
        universe: UniverseId,
        request: &QuoteRequest,
    ) -> Result<QuoteSnapshot, StoreError> {
        panic!("unexpected store call")
    }
    async fn ready(&self) -> Result<(), StoreError> {
        panic!("unexpected store call")
    }
    async fn load_view(
        &self,
        actor: Actor,
        universe: UniverseId,
    ) -> Result<ViewerSnapshot, StoreError> {
        panic!("unexpected store call")
    }

    async fn load_rules(&self, _: UniverseId) -> Result<Ruleset, StoreError> {
        Ok(self.facts.rules.clone())
    }
    async fn current_binding(
        &self,
        account: AccountId,
        universe: UniverseId,
    ) -> Result<(Binding, i64), StoreError> {
        let mut count = self.state.lock().unwrap();
        count.0 += 1;
        Ok((
            Binding {
                account,
                universe,
                player: if self.foreign {
                    PlayerId(Uuid::from_u128(99))
                } else {
                    self.facts.player
                },
                epoch: Epoch(Uuid::from_u128(100 + count.0 as u128)),
            },
            0,
        ))
    }
    async fn bound_view(
        &self,
        binding: Binding,
    ) -> Result<ReadSnapshot<ViewerSnapshot>, StoreError> {
        let mut count = self.state.lock().unwrap();
        count.1 += 1;
        if count.1.is_multiple_of(2) && count.0 <= self.resets {
            return Err(StoreError::EpochChanged);
        }
        let mut f = self.facts.clone();
        f.epoch = binding.epoch;
        if self.mismatch && count.1.is_multiple_of(2) {
            f.rules.hash = Hash("b".repeat(64));
        }
        Ok(ReadSnapshot {
            facts: f,
            progress: SnapshotProgress {
                sampled_at: 1000,
                command_references: true,
                ..Default::default()
            },
        })
    }
}
fn setup(protocol: i32) -> (Memory, AuthenticatedSession) {
    let rules = match protocol {
        2 => {
            Ruleset::from_json(include_bytes!("../../../rules/shared-foundation-r1.json")).unwrap()
        }
        3 => Ruleset::mvp_progression().unwrap(),
        _ => Ruleset::mvp_fleets().unwrap(),
    };
    let player = PlayerId(Uuid::from_u128(2));
    let universe = UniverseId(Uuid::from_u128(3));
    let epoch = Epoch(Uuid::from_u128(4));
    let research = ResearchLevels {
        owner: player,
        levels: if protocol == 2 {
            ResearchId::ALL.into_iter().map(|r| (r, 0)).collect()
        } else {
            ResearchId::MVP.into_iter().map(|r| (r, 0)).collect()
        },
        revision: 0,
    };
    let coverage = FactCoverage {
        research_players: [player].into(),
        fleet_owners: [player].into(),
        ..Default::default()
    };
    let world = GameState {
        world: Some(WorldFacts {
            homeworlds: Default::default(),
            planet_slots: vec![],
            records: WorldRecords::default(),
            secret: [0; 32],
            covered_players: Default::default(),
            covered_coordinates: Default::default(),
            covered_reports: Default::default(),
            requested_pair: None,
            revision: 0,
        }),
        production_settings: Default::default(),
        research_operations: Default::default(),
        manufacturing_batches: Default::default(),
        progression_reservations: Default::default(),
        universe,
        epoch,
        profile_hash: rules.hash.clone(),
        bodies: Default::default(),
        players: Default::default(),
        inventories: vec![],
        research: [(player, research.clone())].into(),
        constructions: Default::default(),
        fleets: Default::default(),
        reports: Default::default(),
        coverage: coverage.clone(),
        collection_revisions: Default::default(),
    };
    let facts = ViewerSnapshot {
        homeworld: None,
        unread_report: None,
        world: Some(world.clone()),
        progression: Some(world),
        coverage,
        fleets: vec![],
        reports: vec![],
        universe,
        epoch,
        player,
        revision: 0,
        at: 0,
        rules,
        bodies: vec![],
        inventories: vec![],
        research,
        destinations: vec![],
        constructions: vec![],
    };
    (
        Memory {
            facts,
            state: Arc::new(Mutex::new((0, 0))),
            resets: 0,
            foreign: false,
            mismatch: false,
        },
        AuthenticatedSession {
            account: AccountId(Uuid::from_u128(1)),
            csrf: "secret".into(),
            expires_at: 999999,
            memberships: vec![Membership {
                universe,
                player,
                universe_name: "Andromeda".into(),
            }],
        },
    )
}
#[test]
fn initial_game_supports_each_protocol() {
    futures::executor::block_on(async {
        for protocol in [2, 3, 4] {
            let (s, session) = setup(protocol);
            let game = GameService::new(s);
            let id = Uuid::from_u128(10);
            let result = game.initial_game(&session, id).await.unwrap().unwrap();
            let json = serde_json::to_value(result).unwrap();
            assert_eq!(json["view"]["progress"]["sampled_at"], 1000);
            assert_eq!(json["view"]["progress"]["command_references"], true);
            for key in ["candidate", "view", "settings"] {
                assert_eq!(json[key]["protocol"], protocol);
                assert_eq!(json[key]["request_id"], id.to_string());
                assert_eq!(json[key]["binding"]["account"], session.account.to_string());
            }
            assert_eq!(
                json["view"]["profile_hash"],
                json["settings"]["profile_hash"]
            );
        }
    });
}
#[test]
fn empty_memberships_do_not_read_game_store() {
    futures::executor::block_on(async {
        let (s, mut session) = setup(2);
        session.memberships.clear();
        assert!(
            GameService::new(s.clone())
                .initial_game(&session, Uuid::nil())
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(*s.state.lock().unwrap(), (0, 0));
    });
}
#[test]
fn epoch_change_restarts_entire_assembly() {
    futures::executor::block_on(async {
        let (mut s, session) = setup(2);
        s.resets = 1;
        let result = GameService::new(s.clone())
            .initial_game(&session, Uuid::nil())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(s.state.lock().unwrap().0, 2);
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json["candidate"]["binding"], json["settings"]["binding"]);
        assert_eq!(
            json["view"]["binding"]["epoch"],
            Uuid::from_u128(102).to_string()
        );
    });
}
#[test]
fn repeated_epoch_change_stops_after_three_attempts() {
    futures::executor::block_on(async {
        let (mut s, session) = setup(2);
        s.resets = 99;
        assert!(matches!(
            GameService::new(s.clone())
                .initial_game(&session, Uuid::nil())
                .await,
            Err(ServiceError::EpochChanged)
        ));
        assert_eq!(s.state.lock().unwrap().0, 3);
    });
}
#[test]
fn incompatible_data_is_never_published() {
    futures::executor::block_on(async {
        for foreign in [true, false] {
            let (mut s, session) = setup(2);
            s.foreign = foreign;
            s.mismatch = !foreign;
            assert!(
                GameService::new(s)
                    .initial_game(&session, Uuid::nil())
                    .await
                    .is_err()
            );
        }
    });
}

#[test]
fn unsupported_protocol_is_not_a_ready_snapshot() {
    futures::executor::block_on(async {
        let (mut store, session) = setup(2);
        store.facts.rules =
            Ruleset::from_json(include_bytes!("../../../rules/first-slice-v1.json")).unwrap();
        assert!(matches!(
            GameService::new(store)
                .initial_game(&session, Uuid::nil())
                .await,
            Err(ServiceError::UnsupportedProtocol)
        ));
    });
}

#[test]
fn planet_temperature_comes_from_body_state_without_colony_metadata() {
    futures::executor::block_on(async {
        for protocol in [3, 4] {
            for (temperature, known_homeworld) in [(-120, true), (0, true), (260, false)] {
                let (mut store, session) = setup(protocol);
                let facts = &mut store.facts;
                let body = Body {
                    name: None,
                    id: BodyId(Uuid::from_u128(50)),
                    universe: facts.universe,
                    owner: facts.player,
                    kind: BodyKind::Planet,
                    coordinates: Coordinates {
                        galaxy: 1,
                        system: 1,
                        position: 8,
                    },
                    fields: 163,
                    max_temperature: temperature,
                    retained_capacity: None,
                    checkpoint: ResourceCheckpoint {
                        amounts: Resources::default(),
                        carry: Resources::default(),
                        at: 0,
                    },
                    levels: Building::MVP
                        .into_iter()
                        .map(|building| (building, 0))
                        .collect(),
                    revision: 0,
                };
                facts.coverage.bodies.insert(body.id);
                facts.coverage.construction_bodies.insert(body.id);
                facts.coverage.production_bodies.insert(body.id);
                facts
                    .coverage
                    .inventory_owners
                    .insert((body.id, body.owner));
                facts.bodies.push(body.clone());
                if known_homeworld {
                    facts.homeworld = Some((
                        body.id,
                        Homeworld {
                            coordinates: body.coordinates,
                            diameter_km: 12800,
                            fields: 163,
                            max_temperature: 66,
                            rng_bytes: 8,
                        },
                    ));
                }
                for state in [&mut facts.progression, &mut facts.world]
                    .into_iter()
                    .flatten()
                {
                    state.coverage = facts.coverage.clone();
                    state.bodies.insert(body.id, body.clone());
                    state.production_settings.insert(
                        body.id,
                        ProductionSettingsRecord {
                            body: body.id,
                            settings: ProductionSettings::default(),
                            revision: 0,
                        },
                    );
                    for kind in ["constructions", "production"] {
                        state
                            .collection_revisions
                            .insert(format!("{kind}:{}", body.id), 0);
                    }
                    state
                        .collection_revisions
                        .insert(format!("research:{}", body.owner), 0);
                }
                let result = GameService::new(store)
                    .initial_game(&session, Uuid::nil())
                    .await
                    .unwrap()
                    .unwrap();
                let json = serde_json::to_value(result).unwrap();
                assert_eq!(json["view"]["bodies"][0]["max_temperature"], temperature);
                assert!(json["view"]["bodies"][0].get("colony").is_none());
                assert_eq!(
                    json["view"]["bodies"][0]["min_temperature"],
                    temperature - 40
                );
                if known_homeworld {
                    assert_eq!(json["view"]["bodies"][0]["diameter_km"], 12800);
                } else {
                    assert!(json["view"]["bodies"][0].get("diameter_km").is_none());
                }
            }
        }
    });
}
