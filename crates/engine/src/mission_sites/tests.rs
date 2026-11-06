use super::*;
fn input(n: u128) -> OrderedInput {
    OrderedInput {
        schema_version: 4,
        id: InputId(Uuid::from_u128(n)),
        universe: UniverseId(Uuid::from_u128(1)),
        epoch: Epoch(Uuid::from_u128(2)),
        actor: Actor::Player(PlayerId(Uuid::from_u128(3))),
        at: n as i64,
        phase: 1,
        sequence: n as i64,
        protocol: 4,
        profile_hash: rules().hash.clone(),
        payload: Input::Command(Command::RecallFleet {
            fleet: FleetId::default(),
        }),
    }
}
fn rules() -> Ruleset {
    Ruleset::mvp_raids().unwrap()
}
fn key(name: &str) -> SiteIssuanceKey {
    SiteIssuanceKey {
        universe: input(1).universe,
        epoch: input(1).epoch,
        beneficiary: PlayerId(Uuid::from_u128(3)),
        key: name.into(),
    }
}
fn origin() -> Coordinates {
    Coordinates {
        galaxy: 1,
        system: 1,
        position: 8,
    }
}
// Independently authored generic fixtures, not production tutorial content.
fn definition() -> SiteDefinition {
    SiteDefinition {
        schema_version: 1,
        id: "fixtures:abandoned-freighter".into(),
        version: 1,
        placement: SitePlacementPolicy::Orbital,
        access: SiteAccessPolicy::BeneficiaryOnly,
        admission: SiteAdmissionPolicy::OneActiveOperation,
        debris: SiteDebrisPolicy::None,
        initial_stock: Resources::from_values([20 * SCALE, 12 * SCALE, 4 * SCALE]),
        forces: vec![SiteForce {
            item: ManufacturedItem::Ship(ShipType::LightFighter),
            count: 1,
        }],
        combat_technology: [0; 3],
    }
}
fn second_definition() -> SiteDefinition {
    SiteDefinition {
        id: "fixtures:regional-cache".into(),
        placement: SitePlacementPolicy::Bounded {
            candidates: vec![
                origin(),
                Coordinates {
                    position: 9,
                    ..origin()
                },
            ],
            maximum_distance: 1000,
        },
        admission: SiteAdmissionPolicy::MultipleOperations,
        debris: SiteDebrisPolicy::RetainedSiteLocal,
        initial_stock: Resources::all(30 * SCALE),
        forces: vec![],
        ..definition()
    }
}
fn site() -> MissionSite {
    create_mission_site(
        key("fixtures:first"),
        definition(),
        origin(),
        &input(10),
        &rules(),
        &[7; 32],
    )
    .unwrap()
}
fn reference(n: u128) -> SiteOperationReference {
    SiteOperationReference {
        operation: OperationId(Uuid::from_u128(n)),
        fleet: FleetId(Uuid::from_u128(n + 100)),
        actor: key("x").beneficiary,
    }
}
fn append(site: &mut MissionSite, n: u128, kind: SiteEventKind) {
    site.append(&input(n), site.revision(), kind).unwrap();
}
#[test]
fn issuance_is_once_only_across_inputs_definition_versions_and_secret_changes() {
    let mut sites = BTreeMap::new();
    let id = issue_mission_site(
        &mut sites,
        key("fixtures:first"),
        second_definition(),
        origin(),
        &input(10),
        &rules(),
        &[7; 32],
    )
    .unwrap();
    let saved = sites[&id].clone();
    let mut replacement = definition();
    replacement.version = 99;
    assert_eq!(
        issue_mission_site(
            &mut sites,
            key("fixtures:first"),
            replacement,
            Coordinates {
                position: 1,
                ..origin()
            },
            &input(20),
            &rules(),
            &[8; 32]
        )
        .unwrap(),
        id
    );
    assert_eq!(sites[&id], saved);
    let another = issue_mission_site(
        &mut sites,
        key("fixtures:second"),
        definition(),
        origin(),
        &input(20),
        &rules(),
        &[7; 32],
    )
    .unwrap();
    assert_ne!(id, another);
    let mut other_epoch = key("fixtures:first");
    other_epoch.epoch = Epoch(Uuid::from_u128(9));
    assert_ne!(other_epoch.id(), id);
    assert_eq!(
        issue_mission_site(
            &mut sites,
            other_epoch,
            definition(),
            origin(),
            &input(20),
            &rules(),
            &[7; 32]
        ),
        Err(SiteError::InvalidFacts)
    );
}
#[test]
fn private_disclosure_revision_and_unsupported_actions_fail_closed() {
    let mut site = site();
    let owner = key("x").beneficiary;
    assert_eq!(
        site.view(input(1).universe, input(1).epoch, owner),
        Err(SiteError::NotFound)
    );
    append(&mut site, 11, SiteEventKind::Disclosed);
    let view = site.view(input(1).universe, input(1).epoch, owner).unwrap();
    assert_eq!(
        site.resolve(
            input(1).universe,
            input(1).epoch,
            owner,
            SiteSelection {
                expected_revision: 0,
                ..view.destination.selection
            }
        ),
        Err(SiteError::StaleRevision)
    );
    for (u, e, p) in [
        (UniverseId(Uuid::nil()), input(1).epoch, owner),
        (input(1).universe, Epoch(Uuid::nil()), owner),
        (input(1).universe, input(1).epoch, PlayerId(Uuid::nil())),
    ] {
        assert_eq!(site.view(u, e, p), Err(SiteError::NotFound));
    }
    assert_eq!(
        site.authorize_mission(input(1).universe, input(1).epoch, owner, Mission::Attack),
        Ok(())
    );
    for mission in [
        Mission::Transport,
        Mission::Harvest,
        Mission::Espionage,
        Mission::Deploy,
        Mission::Colonize,
        Mission::Hold,
    ] {
        assert_eq!(
            site.authorize_mission(input(1).universe, input(1).epoch, owner, mission),
            Err(SiteError::Unsupported)
        );
    }
}
#[test]
fn bounded_placement_is_order_independent_persisted_and_has_explicit_unavailability() {
    let def = second_definition();
    let a = create_mission_site(
        key("cache"),
        def.clone(),
        origin(),
        &input(10),
        &rules(),
        &[7; 32],
    )
    .unwrap();
    let mut reordered = def;
    if let SitePlacementPolicy::Bounded { candidates, .. } = &mut reordered.placement {
        candidates.reverse();
    }
    let b = create_mission_site(
        key("cache"),
        reordered,
        origin(),
        &input(10),
        &rules(),
        &[7; 32],
    )
    .unwrap();
    assert_eq!(a.creation.coordinates, b.creation.coordinates);
    let restored: MissionSite = serde_json::from_value(serde_json::to_value(&a).unwrap()).unwrap();
    assert_eq!(restored, a);
    for candidates in [
        vec![],
        vec![Coordinates {
            system: 5,
            ..origin()
        }],
    ] {
        let mut impossible = definition();
        impossible.placement = SitePlacementPolicy::Bounded {
            candidates,
            maximum_distance: 1,
        };
        assert_eq!(
            create_mission_site(
                key("none"),
                impossible,
                origin(),
                &input(10),
                &rules(),
                &[7; 32]
            ),
            Err(SiteError::NoPlacement)
        );
    }
}
#[test]
fn distinct_orbital_instances_do_not_use_body_occupancy_or_player_identity() {
    let a = site();
    let b = create_mission_site(
        key("second"),
        definition(),
        origin(),
        &input(10),
        &rules(),
        &[7; 32],
    )
    .unwrap();
    assert_ne!(a.id(), b.id());
    assert_ne!(a.creation.encounter, b.creation.encounter);
    assert_eq!(a.creation.coordinates, b.creation.coordinates);
    assert_eq!(a.creation.coordinates, origin());
    assert_eq!(galaxy_distance(origin(), a.creation.coordinates), 5);
}
#[test]
fn finite_half_loot_is_capacity_bounded_and_retry_cannot_replenish_or_extract_twice() {
    let mut site = site();
    append(&mut site, 11, SiteEventKind::Disclosed);
    for n in 12..25 {
        let reference = reference(n);
        append(
            &mut site,
            n * 10,
            SiteEventKind::OperationAccepted {
                reference: reference.clone(),
            },
        );
        let before = site.remaining_stock().unwrap();
        let loot = raid_loot(before, 5 * SCALE).unwrap();
        let kind = SiteEventKind::Extracted {
            reference: reference.clone(),
            free_capacity: 5 * SCALE,
            resources: loot,
        };
        let revision = site.revision();
        site.append(&input(n * 10 + 1), revision, kind.clone())
            .unwrap();
        let after = site.remaining_stock().unwrap();
        site.append(&input(n * 10 + 1), revision, kind.clone())
            .unwrap();
        assert_eq!(site.remaining_stock().unwrap(), after);
        assert_eq!(
            site.append(&input(n * 10 + 2), site.revision(), kind),
            Err(SiteError::Conflict)
        );
        for ((b, a), l) in before
            .values()
            .into_iter()
            .zip(after.values())
            .zip(loot.values())
        {
            assert_eq!(b - a, l);
            assert!(l <= b / 2);
        }
        assert!(loot.values().iter().sum::<i64>() <= 5 * SCALE);
        append(
            &mut site,
            n * 10 + 3,
            SiteEventKind::OperationSettled {
                operation: reference.operation,
                fleet: reference.fleet,
            },
        );
    }
    assert_eq!(
        raid_loot(site.remaining_stock().unwrap(), i64::MAX).unwrap(),
        Resources::default()
    );
    site.validate_history().unwrap();
    let mut corrupt = site.clone();
    if let SiteEventKind::Extracted { resources, .. } = &mut corrupt.events[2].kind {
        resources.metal += SCALE;
    }
    assert_eq!(corrupt.validate_history(), Err(SiteError::InvalidFacts));
}
#[test]
fn retirement_retains_live_references_and_permits_their_defined_settlement() {
    let mut site = site();
    append(&mut site, 11, SiteEventKind::Disclosed);
    let r = reference(1);
    append(
        &mut site,
        12,
        SiteEventKind::OperationAccepted {
            reference: r.clone(),
        },
    );
    assert_eq!(
        site.append(
            &input(13),
            site.revision(),
            SiteEventKind::OperationAccepted {
                reference: reference(2)
            }
        ),
        Err(SiteError::Busy)
    );
    append(
        &mut site,
        14,
        SiteEventKind::Retired {
            reason: "lesson-completed".into(),
        },
    );
    assert_eq!(site.active_references(), vec![r.clone()]);
    assert_eq!(
        site.append(
            &input(15),
            site.revision(),
            SiteEventKind::OperationAccepted {
                reference: reference(2)
            }
        ),
        Err(SiteError::Retired)
    );
    let loot = raid_loot(site.remaining_stock().unwrap(), 3 * SCALE).unwrap();
    append(
        &mut site,
        16,
        SiteEventKind::Extracted {
            reference: r.clone(),
            free_capacity: 3 * SCALE,
            resources: loot,
        },
    );
    append(
        &mut site,
        17,
        SiteEventKind::OperationSettled {
            operation: r.operation,
            fleet: r.fleet,
        },
    );
    assert!(site.active_references().is_empty());
    assert!(
        site.view(input(1).universe, input(1).epoch, r.actor)
            .unwrap()
            .retired
    );
    assert_eq!(site.events.len(), 5);
    site.validate_history().unwrap();
}
#[test]
fn definitions_reject_unsupported_content_unknown_policies_and_invalid_topology() {
    for mutate in [
        |d: &mut SiteDefinition| d.schema_version = 2,
        |d: &mut SiteDefinition| d.initial_stock.metal = -1,
        |d: &mut SiteDefinition| d.forces[0].count = 0,
        |d: &mut SiteDefinition| {
            d.placement = SitePlacementPolicy::Bounded {
                candidates: vec![Coordinates {
                    position: 16,
                    ..origin()
                }],
                maximum_distance: 1,
            }
        },
    ] {
        let mut def = definition();
        mutate(&mut def);
        assert_eq!(def.validate(&rules()), Err(SiteError::InvalidDefinition));
    }
    let mut value = serde_json::to_value(definition()).unwrap();
    value["access"] = "Public".into();
    assert!(serde_json::from_value::<SiteDefinition>(value).is_err());
    let current = rules();
    let mut artifact = current.artifact.clone();
    artifact
        .catalog
        .iter_mut()
        .find(|entry| entry.key == CatalogKey::Ship(ShipType::LightFighter))
        .unwrap()
        .enabled = false;
    let disabled = Ruleset::from_artifact(artifact, current.speed).unwrap();
    assert_eq!(
        definition().validate(&disabled),
        Err(SiteError::InvalidDefinition)
    );
    definition().validate(&rules()).unwrap();
    second_definition().validate(&rules()).unwrap();
}
