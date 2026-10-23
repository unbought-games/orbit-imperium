use orbit_engine::*;
use std::collections::BTreeMap;
use uuid::Uuid;
fn body() -> Body {
    Body {
        name: None,
        id: Uuid::from_u128(1).into(),
        universe: Uuid::from_u128(2).into(),
        owner: Uuid::from_u128(3).into(),
        kind: BodyKind::Planet,
        coordinates: Coordinates {
            galaxy: 1,
            system: 1,
            position: 8,
        },
        fields: 163,
        max_temperature: 40,
        retained_capacity: Some(Resources::all(10_000 * SCALE)),
        checkpoint: ResourceCheckpoint {
            amounts: Resources::all(1000 * SCALE),
            carry: Resources::default(),
            at: 0,
        },
        levels: BTreeMap::from([
            (Building::MetalMine, 1),
            (Building::CrystalMine, 1),
            (Building::DeuteriumSynthesizer, 0),
            (Building::SolarPlant, 2),
        ]),
        revision: 0,
    }
}
fn rules() -> Ruleset {
    Ruleset::from_json(include_bytes!("../../../rules/first-slice-v1.json")).unwrap()
}
#[test]
fn one_hour_and_read_frequency_have_exact_seed_totals() {
    let b = body();
    let r = rules();
    let end = settle_economy(&b, 3_600_000, &r).unwrap();
    assert_eq!(
        end.amounts,
        Resources {
            metal: 1_063 * SCALE,
            crystal: 1_037 * SCALE,
            deuterium: 1000 * SCALE
        }
    );
    for t in [1, 77, 987654, 3_599_999] {
        let mut split = b.clone();
        split.checkpoint = settle_economy(&split, t, &r).unwrap();
        assert_eq!(settle_economy(&split, 3_600_000, &r).unwrap(), end)
    }
}
#[test]
fn shortage_base_income_and_over_cap_are_preserved() {
    let mut b = body();
    let r = rules();
    b.levels.insert(Building::SolarPlant, 0);
    let rates = production_rates(&b, &r).unwrap();
    assert_eq!(
        rates,
        Resources {
            metal: 30 * SCALE,
            crystal: 15 * SCALE,
            deuterium: 0
        }
    );
    b.checkpoint.amounts = Resources::all(15_000 * SCALE);
    assert_eq!(
        settle_economy(&b, 3_600_000, &r).unwrap().amounts,
        Resources::all(15_000 * SCALE)
    );
    b.checkpoint.amounts = Resources::all(9990 * SCALE);
    let settled = settle_economy(&b, 3_600_000, &r).unwrap();
    assert_eq!(settled.amounts.metal, 10000 * SCALE);
    assert_eq!(settled.carry.metal, 0)
}
#[test]
fn checked_ranges_and_profile_hashing() {
    let mut b = body();
    b.levels.insert(Building::MetalMine, u32::MAX);
    assert!(production_rates(&b, &rules()).is_err());
    let original = rules();
    let reordered = serde_json::to_vec(
        &serde_json::from_slice::<serde_json::Value>(include_bytes!(
            "../../../rules/first-slice-v1.json"
        ))
        .unwrap(),
    )
    .unwrap();
    assert_eq!(original.hash, Ruleset::from_json(&reordered).unwrap().hash);
    assert_ne!(original.hash.clone(), original.with_speed(4).unwrap().hash);
    assert!(rules().with_speed(0).is_err());
}
#[test]
fn level_two_cost_and_duration_are_independently_rounded() {
    let q = construction_terms(Building::MetalMine, 2, &rules()).unwrap();
    assert_eq!(
        q.cost,
        Resources {
            metal: 90 * SCALE,
            crystal: 22 * SCALE,
            deuterium: 0
        }
    );
    assert_eq!(q.duration, 161_000);
    assert!(construction_terms(Building::MetalMine, u32::MAX, &rules()).is_err());
}
#[test]
fn public_energy_summary_uses_the_same_exact_ratio_as_production() {
    let mut b = body();
    let r = rules();
    let e = energy_stats(&b, &r).unwrap();
    assert_eq!(
        (e.supply, e.demand, e.utilization),
        (48_400_000, 22_000_000, 1_000_000)
    );
    b.levels.insert(Building::SolarPlant, 1);
    let e = energy_stats(&b, &r).unwrap();
    assert_eq!(
        (e.supply, e.demand, e.utilization),
        (22_000_000, 22_000_000, 1_000_000)
    );
    b.levels.insert(Building::SolarPlant, 0);
    assert_eq!(energy_stats(&b, &r).unwrap().utilization, 0);
}
#[test]
fn exact_capacity_boundary_discards_excess_and_spending_resumes() {
    let mut b = body();
    b.levels.insert(Building::MetalMine, 0);
    b.levels.insert(Building::CrystalMine, 0);
    let r = rules().with_speed(2).unwrap();
    b.checkpoint.amounts.metal = 9990 * SCALE;
    let before = settle_economy(&b, 599_999, &r).unwrap();
    assert_eq!(before.amounts.metal, 9_999_999_983);
    let full = settle_economy(&b, 600_000, &r).unwrap();
    assert_eq!(full.amounts.metal, 10000 * SCALE);
    assert_eq!(full.carry.metal, 0);
    b.checkpoint = full;
    b.checkpoint.amounts.metal = 15000 * SCALE;
    assert_eq!(
        settle_economy(&b, 4_200_000, &r).unwrap().amounts.metal,
        15000 * SCALE
    );
    b.checkpoint.amounts.metal = 9000 * SCALE;
    assert_eq!(
        settle_economy(&b, 4_200_000, &r).unwrap().amounts.metal,
        9060 * SCALE
    );
}
#[test]
fn all_four_building_catalog_entries_and_deuterium_energy_shortage() {
    let r = rules();
    for (building, level, metal, crystal, seconds) in [
        (Building::MetalMine, 2, 90, 22, 161),
        (Building::CrystalMine, 2, 76, 38, 164),
        (Building::DeuteriumSynthesizer, 1, 225, 75, 432),
        (Building::SolarPlant, 3, 168, 67, 338),
    ] {
        let q = construction_terms(building, level, &r).unwrap();
        assert_eq!(
            q.cost,
            Resources {
                metal: metal * SCALE,
                crystal: crystal * SCALE,
                deuterium: 0
            }
        );
        assert_eq!(q.duration, seconds * 1000)
    }
    let mut b = body();
    b.levels.insert(Building::DeuteriumSynthesizer, 1);
    assert_eq!(production_rates(&b, &r).unwrap().deuterium, 14_080_000);
    b.levels.insert(Building::SolarPlant, 1);
    assert_eq!(
        production_rates(&b, &r).unwrap(),
        Resources {
            metal: 46_500_000,
            crystal: 26_000_000,
            deuterium: 7_040_000
        }
    );
}

#[test]
fn progression_settlement_uses_storage_levels_and_selected_rules() {
    let mut b = body();
    b.levels = Building::MVP.into_iter().map(|k| (k, 0)).collect();
    b.levels.insert(Building::MetalStorage, 1);
    let r = Ruleset::mvp_progression().unwrap();
    b.checkpoint.amounts = Resources::all(9999 * SCALE);
    b.checkpoint.carry = Resources::all(123);
    let settled = settle_economy(&b, 3_600_000, &r).unwrap();
    assert_eq!(settled.amounts.metal, 10299 * SCALE);
    assert_eq!(settled.carry.metal, 123);
    assert_eq!(settled.amounts.crystal, 10000 * SCALE);
    assert_eq!(settled.carry.crystal, 0);
}

#[test]
fn capacity_uses_the_supplied_profile_and_rejects_incomplete_sources() {
    let mut b = body();
    let mut artifact: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/mvp-v1-slice-2.json")).unwrap();
    artifact["progression"]["storage_capacities"][1] = serde_json::json!(25000);
    let r = Ruleset::from_json(&serde_json::to_vec(&artifact).unwrap()).unwrap();
    b.retained_capacity = None;
    b.levels = Building::MVP.into_iter().map(|k| (k, 0)).collect();
    b.levels.insert(Building::CrystalStorage, 1);
    b.levels.insert(Building::DeuteriumTank, 2);
    assert_eq!(
        body_storage_capacity(&b, &r).unwrap(),
        Resources::from_values([10000 * SCALE, 25000 * SCALE, 40000 * SCALE])
    );
    b.levels.insert(Building::MetalStorage, u32::MAX);
    assert!(settle_economy(&b, 1, &r).is_err());
    b.levels.remove(&Building::MetalStorage);
    assert!(settle_economy(&b, 1, &r).is_err());
    assert!(settle_economy(&body_with_missing_legacy_capacity(), 1, &rules()).is_err());
}
fn body_with_missing_legacy_capacity() -> Body {
    let mut b = body();
    b.retained_capacity = None;
    b
}
