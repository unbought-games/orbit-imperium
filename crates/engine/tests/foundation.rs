use orbit_engine::*;

#[test]
fn r1_catalog_preserves_selected_numeric_rules() {
    let old = Ruleset::from_json(include_bytes!("../../../rules/first-slice-v1.json")).unwrap();
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../rules/shared-foundation-r1.json");
    let bytes = std::fs::read(path).expect("R1 immutable artifact must exist");
    let new = Ruleset::from_json(&bytes).unwrap();
    assert_ne!(old.hash, new.hash);
    for building in Building::ALL {
        for level in 1..=10 {
            assert_eq!(
                construction_terms(building, level, &old).unwrap(),
                construction_terms(building, level, &new).unwrap()
            );
        }
    }
    let terms = construction_terms(Building::MetalMine, 2, &new).unwrap();
    assert_eq!(
        terms.cost,
        Resources {
            metal: 90_000_000,
            crystal: 22_000_000,
            deuterium: 0
        }
    );
    assert_eq!(terms.duration, 161_000);
    let fixture: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../fixtures/shared-foundation-r1/parity.json"
    ))
    .unwrap();
    assert_eq!(wire_resources(terms.cost), fixture["cost"]);
    assert_eq!(terms.duration, fixture["duration_ms"].as_i64().unwrap());
}

mod common;
#[test]
fn r1_quote_deadline_is_rejected_before_debit() {
    let (s, r, p, b) = common::fixture();
    assert_eq!(
        quote(
            &s,
            Actor::Player(p),
            &QuoteRequest::Upgrade {
                body: b,
                building: Building::MetalMine
            },
            9_007_199_254_740_991,
            &r
        ),
        Err(GameError::NumericRange)
    );
}
#[test]
fn covered_empty_inventory_and_missing_research_are_distinct() {
    let (mut s, r, p, b) = common::fixture();
    assert!(mobile_inventory(&s, b, p, &r).unwrap().is_empty());
    s.coverage.inventory_owners.clear();
    assert!(mobile_inventory(&s, b, p, &r).is_err());
    s.research
        .get_mut(&p)
        .unwrap()
        .levels
        .remove(&ResearchId::ComputerTechnology);
    let i = common::input(
        &s,
        &r,
        Actor::Player(p),
        0,
        40,
        Input::Command(Command::StartUpgrade {
            body: b,
            building: Building::MetalMine,
            expected_terms_hash: Hash("0".repeat(64)),
        }),
    );
    assert!(matches!(
        transition(&s, &i, &r),
        TransitionResult::InvalidState(_)
    ));
}

#[test]
fn v2_quote_hash_uses_the_public_canonical_preimage() {
    let (mut state, _, p, b) = common::fixture();
    let rules =
        Ruleset::from_json(include_bytes!("../../../rules/shared-foundation-r1.json")).unwrap();
    state.profile_hash = rules.hash.clone();
    let request = QuoteRequest::Upgrade {
        body: b,
        building: Building::MetalMine,
    };
    let q = quote(&state, Actor::Player(p), &request, 1000, &rules).unwrap();
    let expected = hash(
        &serde_json::json!({"protocol":2,"request":{"type":"Upgrade","body":b,"building":"MetalMine"},"terms":{"fuel":"0","capacity":"0","maximum_payload":"0","profile_hash":rules.hash,"cost":{"metal":"90000000","crystal":"22000000","deuterium":"0"},"duration":161000,"target_level":2}}),
    );
    assert_eq!(q.terms_hash, expected);
    let mut i = common::input(
        &state,
        &rules,
        Actor::Player(p),
        1000,
        100,
        Input::Command(Command::StartUpgrade {
            body: b,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash.clone(),
        }),
    );
    i.protocol = 2;
    let result = transition(&state, &i, &rules);
    let change = common::applied(&mut state, result);
    assert_eq!(change.constructions[0].terms_hash, q.terms_hash);
}

#[test]
fn malformed_catalog_cycles_and_unknown_input_schema_fail_closed() {
    let mut value: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/shared-foundation-r1.json")).unwrap();
    value["catalog"][0]["requirements"] = serde_json::json!([{"type":"BodyBuilding","building":value["catalog"][0]["key"]["id"],"level":1}]);
    assert!(Ruleset::from_json(&serde_json::to_vec(&value).unwrap()).is_err());
    let (s, r, p, b) = common::fixture();
    let mut input = common::input(
        &s,
        &r,
        Actor::Player(p),
        0,
        55,
        Input::Command(Command::StartUpgrade {
            body: b,
            building: Building::MetalMine,
            expected_terms_hash: Hash("a".repeat(64)),
        }),
    );
    input.schema_version = 99;
    assert!(matches!(
        transition(&s, &input, &r),
        TransitionResult::InvalidState(_)
    ));
}

#[test]
fn disabled_catalog_entry_cannot_be_quoted() {
    let (mut state, _, p, b) = common::fixture();
    let mut value: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/shared-foundation-r1.json")).unwrap();
    for entry in value["catalog"].as_array_mut().unwrap() {
        if entry["key"]["id"] == "MetalMine" {
            entry["enabled"] = serde_json::json!(false);
        }
    }
    let rules = Ruleset::from_json(&serde_json::to_vec(&value).unwrap()).unwrap();
    state.profile_hash = rules.hash.clone();
    assert_eq!(
        quote(
            &state,
            Actor::Player(p),
            &QuoteRequest::Upgrade {
                body: b,
                building: Building::MetalMine
            },
            0,
            &rules
        ),
        Err(GameError::UnavailableContent)
    );
}
