use orbit_engine::*;
use serde_json::json;

fn standard() -> Ruleset {
    standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap()
}

#[test]
fn only_debris_percentage_can_skip_state_preparation() {
    let before = standard();
    for bps in [0, 1, 3000, 7777, 10000] {
        let mut artifact = before.artifact.clone();
        artifact.world.as_mut().unwrap().combat.ship_debris_bps = bps;
        let next = Ruleset::from_artifact(artifact, before.speed).unwrap();
        let plan = plan_rules_update(&before, &next).unwrap();
        assert_eq!(
            plan.impact,
            if bps == 3000 {
                RulesUpdateImpact::Unchanged
            } else {
                RulesUpdateImpact::RulesOnly
            }
        );
        assert!(plan.initialize.add_buildings.is_empty());
        assert!(plan.initialize.add_research.is_empty());
    }
}

#[test]
fn every_other_difference_and_mixed_edit_preserves_full_preparation() {
    let before = standard();
    // Exercise unrelated fields across the artifact, not just known production inputs.
    let edits: &[fn(&mut RulesArtifact)] = &[
        |a| a.base_income[0] += 1,
        |a| a.production[0] += 1,
        |a| a.progression.as_mut().unwrap().storage_capacities[1] += 1,
        |a| {
            a.progression
                .as_mut()
                .unwrap()
                .solar_satellite
                .as_mut()
                .unwrap()
                .temperature_offset += 1
        },
        |a| {
            a.progression
                .as_mut()
                .unwrap()
                .fusion_reactor
                .as_mut()
                .unwrap()
                .fuel_base += 1
        },
        |a| a.world.as_mut().unwrap().combat.max_rounds += 1,
        |a| a.id.push_str("-custom"),
    ];
    for (index, edit) in edits.iter().enumerate() {
        for mixed in [false, true] {
            let mut artifact = before.artifact.clone();
            edit(&mut artifact);
            if mixed {
                artifact.world.as_mut().unwrap().combat.ship_debris_bps = 4000;
            }
            let next = Ruleset::from_artifact(artifact, before.speed)
                .unwrap_or_else(|error| panic!("edit {index}: {error}"));
            assert_eq!(
                plan_rules_update(&before, &next).unwrap().impact,
                RulesUpdateImpact::SettleAndInitialize
            );
        }
    }
    for mixed in [false, true] {
        let mut artifact = before.artifact.clone();
        if mixed {
            artifact.world.as_mut().unwrap().combat.ship_debris_bps = 4000;
        }
        let next = Ruleset::from_artifact(artifact, 3).unwrap();
        assert_eq!(
            plan_rules_update(&before, &next).unwrap().impact,
            RulesUpdateImpact::SettleAndInitialize
        );
    }
    let retained = Ruleset::signup_with_speed(UniverseProfile::signup(1, 5).unwrap(), 5).unwrap();
    let upgraded = upgrade_standard_rules(&retained).unwrap();
    let plan = plan_rules_update(&retained, &upgraded).unwrap();
    assert_eq!(plan.impact, RulesUpdateImpact::SettleAndInitialize);
    assert!(!plan.initialize.add_buildings.is_empty());
    assert!(!plan.initialize.add_research.is_empty());
}

#[test]
fn equivalent_historical_wire_is_unchanged_and_invalid_edits_still_fail() {
    let retained: Ruleset =
        serde_json::from_str(include_str!("fixtures/persistence/deathstar-rules.json")).unwrap();
    let normalized = Ruleset::from_artifact(retained.artifact.clone(), retained.speed).unwrap();
    assert_ne!(retained.hash, normalized.hash);
    assert_eq!(
        plan_rules_update(&retained, &normalized).unwrap().impact,
        RulesUpdateImpact::Unchanged
    );
    let before = standard();
    for (path, value) in [
        ("/artifact/world/combat/ship_debris_bps", json!(10001)),
        ("/artifact/world/combat/strategy", json!("unsupported")),
        ("/artifact/buildings/MetalMine/base/0", json!(-1)),
        ("/artifact/resource_scale", json!(10)),
    ] {
        let mut wire = serde_json::to_value(&before).unwrap();
        *wire.pointer_mut(path).unwrap() = value;
        wire["hash"] = json!(hash(&(&wire["artifact"], &wire["speed"])));
        let invalid: Ruleset = serde_json::from_value(wire).unwrap();
        assert!(plan_rules_update(&before, &invalid).is_err(), "{path}");
    }
    // Individually valid rules still cannot change the universe's topology.
    let other = standard_signup_rules(UniverseProfile::signup(2, 5).unwrap(), 5).unwrap();
    assert!(plan_rules_update(&before, &other).is_err());
}
