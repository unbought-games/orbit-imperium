use orbit_engine::*;
use serde_json::{Value, json};

fn historical() -> Value {
    serde_json::from_str(include_str!("fixtures/persistence/deathstar-rules.json")).unwrap()
}
fn identity(value: &mut Value) {
    value["hash"] = json!(hash(&(&value["artifact"], &value["speed"])));
}
fn terms_identity(value: &mut Value, key: &str) {
    value["terms_hash"] = json!("");
    value["terms_hash"] = json!(hash(&json!({"protocol":4,key:value})));
}
#[test]
fn retained_wire_is_authority_before_defaults_and_identifier_translation() {
    let original = historical();
    assert!(
        original["artifact"]["world"]
            .get("beginner_protection_multiplier")
            .is_none()
    );
    assert!(
        original["artifact"]["ships"]["SmallCargo"]
            .get("drive")
            .is_none()
    );
    let rules: Ruleset = serde_json::from_value(original.clone()).unwrap();
    rules.validate().unwrap();
    assert_eq!(
        rules
            .artifact
            .world
            .as_ref()
            .unwrap()
            .beginner_protection_multiplier,
        5
    );
    assert!(
        rules
            .artifact
            .catalog
            .iter()
            .any(|e| e.key == CatalogKey::Ship(ShipType::Dreadnought))
    );
    assert_eq!(serde_json::to_value(&rules).unwrap(), original);
    let normalized = Ruleset::from_artifact(rules.artifact.clone(), rules.speed).unwrap();
    assert_ne!(normalized.hash, rules.hash);
    assert!(normalized.equivalent(&rules));
    assert_eq!(
        serde_json::to_value(&normalized).unwrap()["artifact"]["world"]["beginner_protection_multiplier"],
        5
    );
    let reloaded: Ruleset =
        serde_json::from_value(serde_json::to_value(&normalized).unwrap()).unwrap();
    reloaded.validate().unwrap();
    assert_eq!(reloaded, normalized);
    let mut edited = rules.artifact.clone();
    edited.base_income[0] += 1;
    let next = Ruleset::from_artifact(edited, rules.speed).unwrap();
    assert_ne!(next.hash, rules.hash);
    assert_eq!(serde_json::to_value(&rules).unwrap(), original);
    let mut tampered = original.clone();
    tampered["artifact"]["base_income"][0] = json!(31);
    assert!(serde_json::from_value::<Ruleset>(tampered).is_err());
    let mut unsupported = original.clone();
    unsupported["artifact"]["world"]["unknown_mechanic"] = json!(true);
    identity(&mut unsupported);
    assert!(serde_json::from_value::<Ruleset>(unsupported).is_err());
    let mut invalid = original;
    invalid["artifact"]["buildings"]["MetalMine"]["base"][0] = json!(-1);
    identity(&mut invalid);
    assert!(
        serde_json::from_value::<Ruleset>(invalid)
            .unwrap()
            .validate()
            .is_err()
    );
}
#[test]
fn aliases_reject_ambiguous_maps_and_catalog_entries() {
    let mut saved = historical();
    let ship = saved["artifact"]["ships"]["SmallCargo"].clone();
    saved["artifact"]["ships"]["Deathstar"] = ship.clone();
    saved["artifact"]["ships"]["Dreadnought"] = ship;
    identity(&mut saved);
    assert!(serde_json::from_value::<Ruleset>(saved).is_err());
    let mut saved = historical();
    let mut entry = saved["artifact"]["catalog"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["key"]["id"] == "Deathstar")
        .unwrap()
        .clone();
    entry["key"]["id"] = json!("Dreadnought");
    saved["artifact"]["catalog"]
        .as_array_mut()
        .unwrap()
        .push(entry);
    identity(&mut saved);
    assert!(
        serde_json::from_value::<Ruleset>(saved)
            .unwrap()
            .validate()
            .is_err()
    );
}
fn legacy_terms() -> Value {
    let mut raw = json!({
        "intent": {"origin":"00000000-0000-0000-0000-000000000001",
          "destination":{"type":"Body","id":"00000000-0000-0000-0000-000000000002","expected_kind":"Planet","expected_owner":"00000000-0000-0000-0000-000000000003"},
          "mission":"Transport","ships":[{"owner":"00000000-0000-0000-0000-000000000004","ship_type":"Deathstar","count":"1"}],
          "cargo":{"metal":"9007199254000000","crystal":"0","deuterium":"0"},"speed_percent":100},
        "profile_hash": historical()["hash"],"distance":5,"speeds":[["Deathstar","100"]],
        "duration_ms":10000,"fuel":"1000000","capacity":"9007199255000000","maximum_payload":"9007199254000000","slot_limit":"1","terms_hash":""
    });
    terms_identity(&mut raw, "terms");
    raw
}
#[test]
fn legacy_accepted_terms_preserve_hash_payment_integer_precision_and_roundtrip() {
    let raw = legacy_terms();
    let terms: FleetTerms = serde_json::from_value(raw.clone()).unwrap();
    assert_eq!(terms.intent.ships[0].ship_type, ShipType::Dreadnought);
    assert_eq!(terms.intent.cargo.metal, 9_007_199_254_000_000);
    assert_eq!(terms.fuel, 1_000_000);
    assert_eq!(terms.duration_ms, 10000);
    assert_eq!(serde_json::to_value(&terms).unwrap(), raw);
    let mut draft = (*terms).clone();
    draft.fuel += SCALE;
    let edited = draft.seal();
    assert_ne!(edited.terms_hash, terms.terms_hash);
    let reloaded: FleetTerms =
        serde_json::from_value(serde_json::to_value(&edited).unwrap()).unwrap();
    assert_eq!(reloaded, edited);
    assert_eq!(serde_json::to_value(&terms).unwrap(), raw);
    let mut changed = raw.clone();
    changed["fuel"] = json!("0");
    assert!(serde_json::from_value::<FleetTerms>(changed).is_err());
    let mut duplicate = raw;
    let mut ship = duplicate["intent"]["ships"][0].clone();
    ship["ship_type"] = json!("Dreadnought");
    duplicate["intent"]["ships"]
        .as_array_mut()
        .unwrap()
        .push(ship);
    terms_identity(&mut duplicate, "terms");
    assert!(serde_json::from_value::<FleetTerms>(duplicate).is_err());
}
