use orbit_engine::*;
use serde_json::{Value, json};

fn baseline() -> Value {
    serde_json::from_slice(include_bytes!("../../../rules/mvp-v1-slice-5.json")).unwrap()
}
fn parse(v: &Value) -> Result<Ruleset, RulesError> {
    Ruleset::from_json(&serde_json::to_vec(v).unwrap())
}
fn expanded() -> Value {
    let mut v = baseline();
    v["id"] = json!("universe-custom");
    v["progression"]["research"]["LaserTechnology"] = json!({"base":[200,100,0],"growth":[2,1]});
    v["ships"]["LargeCargo"] =
        json!({"base_speed":7500,"drive_coefficient":[1,10],"fuel":50,"capacity":25000});
    v["progression"]["unit_costs"].as_array_mut().unwrap().push(json!({"item":{"kind":"Ship","id":"LargeCargo"},"cost":{"metal":6000,"crystal":6000,"deuterium":0}}));
    v["world"]["combat"]["units"].as_array_mut().unwrap().push(json!({"item":{"kind":"Ship","id":"LargeCargo"},"cost":[6000,6000,0],"attack_hundredths":500,"shield_hundredths":2500}));
    for e in v["catalog"].as_array_mut().unwrap() {
        match e["key"]["id"].as_str().unwrap() {
            "LaserTechnology" => {
                e["enabled"] = json!(true);
                e["requirements"] = json!([{"type":"BodyBuilding","building":"ResearchLab","level":1},{"type":"PlayerResearch","research":"EnergyTechnology","level":2}]);
            }
            "LargeCargo" => {
                e["enabled"] = json!(true);
                e["mobile"] = json!(true);
                e["requirements"] = json!([{"type":"BodyBuilding","building":"Shipyard","level":4},{"type":"PlayerResearch","research":"CombustionDrive","level":6}]);
            }
            _ => {}
        }
    }
    v
}
#[test]
fn custom_catalog_can_add_generic_ship_and_research() {
    let r = parse(&expanded()).expect("valid additive configuration");
    assert_eq!(r.artifact.ships[&ShipType::LargeCargo].capacity, 25000);
    assert_eq!(
        r.artifact.progression.unwrap().research[&ResearchId::LaserTechnology].base,
        [200, 100, 0]
    );
}
#[test]
fn disabling_new_production_retains_existing_definitions() {
    let mut v = baseline();
    for e in v["catalog"].as_array_mut().unwrap() {
        if e["key"]["id"] == "LightFighter" {
            e["enabled"] = json!(false);
        }
    }
    assert!(parse(&v).is_ok());
}
#[test]
fn incomplete_or_unimplemented_content_is_rejected() {
    let mut v = expanded();
    v["ships"].as_object_mut().unwrap().remove("LargeCargo");
    assert!(parse(&v).is_err());
    let mut v = expanded();
    v["progression"]["research"]["ImpulseDrive"] = json!({"base":[2000,4000,600],"growth":[2,1]});
    for e in v["catalog"].as_array_mut().unwrap() {
        if e["key"]["id"] == "ImpulseDrive" {
            e["enabled"] = json!(true);
        }
    }
    assert!(parse(&v).is_err());
}
#[test]
fn enabled_dependency_must_have_an_enabled_definition() {
    let mut v = expanded();
    for e in v["catalog"].as_array_mut().unwrap() {
        if e["key"]["id"] == "LaserTechnology" {
            e["requirements"] =
                json!([{"type":"PlayerResearch","research":"GravitonTechnology","level":1}]);
        }
    }
    assert!(parse(&v).is_err());
}

#[test]
fn update_rejects_structural_conversion_and_removing_retained_definitions() {
    let old = parse(&expanded()).unwrap();
    let next = Ruleset::mvp_raids().unwrap();
    assert!(validate_rules_update(&old, &next).is_err());
    let mut next = old.clone();
    next.artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::LargeCargo))
        .unwrap()
        .enabled = false;
    let next = Ruleset::from_artifact(next.artifact, 10).unwrap();
    assert!(validate_rules_update(&old, &next).is_ok());
    let mut invalid = old.clone();
    invalid.hash = Hash("tampered".into());
    assert!(validate_rules_update(&old, &invalid).is_err());
}

#[test]
fn rejects_combat_precision_that_fails_after_research() {
    let mut v = baseline();
    v["world"]["combat"]["technology_bonus"] = json!([1, 3]);
    assert!(
        parse(&v).is_err(),
        "one-third increments cannot be represented for all researched units"
    );
    // A representable non-default fraction remains configurable.
    v["world"]["combat"]["technology_bonus"] = json!([1, 5]);
    assert!(parse(&v).is_ok());
}
#[test]
fn rejects_temperature_rules_that_break_future_homeworlds() {
    let mut v = baseline();
    v["temperature"] = json!([1, -1, 1, 100]);
    assert!(
        parse(&v).is_err(),
        "110-degree homeworld must remain usable even before one exists"
    );
    v["temperature"] = json!([110, -1, 1, 1]);
    assert!(
        parse(&v).is_ok(),
        "zero production multiplier at the hottest supported homeworld is valid"
    );
}

#[test]
fn rejects_combat_hull_overflow_without_panicking() {
    let mut combat = CombatRules::selected();
    combat.units[0].cost = [i64::MAX, 0, 0];
    combat.base_hull_fraction = [u64::MAX, u64::MAX];
    assert!(combat.validate().is_err());
}

#[allow(dead_code)]
mod common;
#[test]
fn impulse_content_requires_complete_propulsion_and_keeps_retained_hashes() {
    let old = Ruleset::mvp_raids().unwrap();
    let next = common::impulse_rules(&old);
    assert_eq!(
        validate_rules_update(&old, &next).unwrap().add_research,
        vec![ResearchId::ImpulseDrive]
    );
    assert_eq!(serde_json::to_value(&old.artifact).unwrap(), baseline());
    let mut invalid = next.artifact.clone();
    invalid
        .ships
        .get_mut(&ShipType::SmallCargo)
        .unwrap()
        .impulse_drive = None;
    assert!(Ruleset::from_artifact(invalid, 10).is_err());
    let mut invalid = next.artifact.clone();
    invalid
        .ships
        .get_mut(&ShipType::SmallCargo)
        .unwrap()
        .impulse_drive
        .as_mut()
        .unwrap()
        .minimum_level = 0;
    assert!(Ruleset::from_artifact(invalid, 10).is_err());
    let mut disabled = next.artifact.clone();
    disabled
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::ImpulseDrive))
        .unwrap()
        .enabled = false;
    assert!(Ruleset::from_artifact(disabled, 10).is_ok());
}
