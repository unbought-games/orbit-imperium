use orbit_engine::*;
#[test]
fn progression_profile_has_exact_selected_closure() {
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../rules/mvp-v1-slice-2.json");
    let bytes = std::fs::read(path).expect("new immutable progression artifact");
    let rules = Ruleset::from_json(&bytes).expect("validated progression rules");
    assert_eq!(rules.speed, 10);
    assert_eq!(
        rules.hash.0,
        "4e5eff1be2e97e0baa2bb6317f13f6abdd2afea774e5a40a27d9c6c5158e2584"
    );
    let enabled: Vec<_> = rules
        .artifact
        .catalog
        .iter()
        .filter(|e| e.enabled)
        .collect();
    assert_eq!(enabled.len(), 23);
    for (kind, expected) in [
        ("Building", 10),
        ("Research", 7),
        ("Ship", 4),
        ("Defense", 2),
    ] {
        assert_eq!(
            enabled
                .iter()
                .filter(|e| serde_json::to_value(e.key).unwrap()["kind"] == kind)
                .count(),
            expected
        );
    }
    for key in [
        "FusionReactor",
        "NaniteFactory",
        "ImpulseDrive",
        "SolarSatellite",
    ] {
        assert!(
            rules
                .artifact
                .catalog
                .iter()
                .any(|e| serde_json::to_value(e.key).unwrap()["id"] == key && !e.enabled)
        );
    }
    let recycler = enabled
        .iter()
        .find(|e| serde_json::to_value(e.key).unwrap()["id"] == "Recycler")
        .unwrap();
    assert_eq!(
        serde_json::to_value(&recycler.requirements).unwrap(),
        serde_json::json!([
            {"type":"BodyBuilding","building":"Shipyard","level":4},
            {"type":"PlayerResearch","research":"CombustionDrive","level":6},
            {"type":"PlayerResearch","research":"ShieldingTechnology","level":2}
        ])
    );
}
fn body() -> Body {
    Body {
        name: None,
        id: BodyId::default(),
        universe: UniverseId::default(),
        owner: PlayerId::default(),
        kind: BodyKind::Planet,
        coordinates: Coordinates {
            galaxy: 1,
            system: 1,
            position: 8,
        },
        fields: 163,
        max_temperature: 40,
        retained_capacity: None,
        checkpoint: ResourceCheckpoint {
            amounts: Resources::all(0),
            carry: Resources::all(0),
            at: 0,
        },
        levels: Building::MVP.into_iter().map(|k| (k, 0)).collect(),
        revision: 0,
    }
}
#[test]
fn independent_cost_time_and_storage_vectors() {
    let mut r = Ruleset::mvp_progression().unwrap();
    let mut b = body();
    b.levels.insert(Building::MetalMine, 2);
    b.levels.insert(Building::RoboticsFactory, 2);
    let t = building_terms(&b, Building::MetalMine, BuildingAction::Upgrade, &r).unwrap();
    assert_eq!(
        t.paid(),
        Resources::from_values([135 * SCALE, 33 * SCALE, 0])
    );
    assert_eq!(t.duration(), 8000);
    // Synthetic fixed-speed formula fixtures; production MVP validation still requires S=10.
    r.speed = 1;
    assert_eq!(
        building_terms(&b, Building::MetalMine, BuildingAction::Upgrade, &r)
            .unwrap()
            .duration(),
        81000
    );
    b.levels.insert(Building::MetalMine, 3);
    assert_eq!(
        building_terms(&b, Building::MetalMine, BuildingAction::Upgrade, &r)
            .unwrap()
            .duration(),
        31000
    );
    assert_eq!(
        building_terms(&b, Building::MetalMine, BuildingAction::Demolition, &r)
            .unwrap()
            .duration(),
        54000
    );
    b.levels.insert(Building::MetalMine, 1);
    b.levels.insert(Building::RoboticsFactory, 0);
    let d = building_terms(&b, Building::MetalMine, BuildingAction::Demolition, &r).unwrap();
    assert_eq!(
        d.paid(),
        Resources::from_values([40 * SCALE, 10 * SCALE, 0])
    );
    assert_eq!(d.duration(), 72000);
    assert_eq!(storage_capacity(0, &r).unwrap(), 10000 * SCALE);
    assert_eq!(storage_capacity(3, &r).unwrap(), 75000 * SCALE);
    assert_eq!(storage_capacity(33, &r).unwrap(), 6064564940000 * SCALE);
    assert_eq!(storage_capacity(34, &r), Err(GameError::NumericRange));
    r.speed = 7;
    b.levels.insert(Building::Shipyard, 3);
    let m = manufacture_terms(&b, ManufacturedItem::Ship(ShipType::EspionageProbe), 3, &r).unwrap();
    assert_eq!(m.duration(), 51000);
    assert_eq!(m.paid(), Resources::from_values([0, 3000 * SCALE, 0]));
    assert!(
        manufacture_terms(
            &b,
            ManufacturedItem::Ship(ShipType::EspionageProbe),
            i64::MAX,
            &r
        )
        .is_err()
    );
    assert_eq!(
        manufacture_terms(&b, ManufacturedItem::Ship(ShipType::SolarSatellite), 1, &r),
        Err(GameError::UnavailableContent)
    );
}

#[test]
fn redesign_threshold_is_applied_after_speed_and_raw_floor() {
    let b = body();
    let mut r = Ruleset::mvp_progression().unwrap();
    // At S=10/R=0, raw seconds are floor(M*0.144): 99,100,101,0.
    for (metal, seconds) in [(689, 99), (695, 10), (702, 11), (1, 1)] {
        r.artifact
            .buildings
            .get_mut(&Building::MetalMine)
            .unwrap()
            .base = [metal, 0, 0];
        let t = building_terms(&b, Building::MetalMine, BuildingAction::Upgrade, &r).unwrap();
        assert_eq!(t.duration(), seconds * 1000);
        assert_eq!(t.paid().metal, metal * SCALE);
    }
}
