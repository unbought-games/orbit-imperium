use orbit_engine::*;
use uuid::Uuid;
fn capacity(origin: BattleOrigin, free_capacity: i64) -> LootCapacity {
    LootCapacity {
        owner: PlayerId(Uuid::from_u128(1)),
        origin,
        free_capacity,
    }
}
fn units(v: [i64; 3]) -> Resources {
    Resources::from_values(v.map(|n| n * SCALE))
}
#[test]
fn new_profile_is_explicit_and_keeps_wire_version() {
    let old = Ruleset::mvp_fleets().unwrap();
    let mut artifact = serde_json::to_value(&old.artifact).unwrap();
    artifact["id"] = "mvp-v1-slice-5".into();
    artifact["world"]["raiding"] = "oi-classic-five-pass-v1".into();
    let new = Ruleset::from_json(&serde_json::to_vec(&artifact).unwrap());
    assert!(new.is_ok(), "{new:?}");
    assert_eq!(new.unwrap().protocol(), 4);
    assert_eq!(old.artifact.id, "mvp-v1-slice-4");
}
#[test]
fn five_pass_goldens_preserve_unused_space_and_fractional_stock() {
    assert_eq!(
        raid_loot(units([12000, 2000, 0]), 6000 * SCALE).unwrap(),
        units([3500, 1000, 0])
    );
    assert_eq!(
        raid_loot(Resources::from_values([3_999_999, 0, 0]), 6000 * SCALE).unwrap(),
        units([1, 0, 0])
    );
    assert_eq!(
        raid_loot(units([12000, 2000, 9]), 0).unwrap(),
        Resources::default()
    );
    assert_eq!(
        raid_loot(units([10, 10, 10]), SCALE).unwrap(),
        units([0, 0, 1])
    );
}
#[test]
fn pooled_allocation_uses_residual_capacity_and_canonical_ties() {
    let a = BattleOrigin::Fleet(FleetId(Uuid::from_u128(1)));
    let b = BattleOrigin::Fleet(FleetId(Uuid::from_u128(2)));
    assert_eq!(
        allocate_loot(
            units([2, 1, 0]),
            &[capacity(b, SCALE), capacity(a, 2 * SCALE)]
        )
        .unwrap(),
        vec![(a, units([1, 1, 0])), (b, units([1, 0, 0]))]
    );
    assert_eq!(
        allocate_loot(units([1, 0, 0]), &[capacity(b, SCALE), capacity(a, SCALE)]).unwrap(),
        vec![(a, units([1, 0, 0])), (b, units([0, 0, 0]))]
    );
    assert_eq!(
        allocate_loot(Resources::default(), &[capacity(a, 0)]).unwrap(),
        vec![(a, Resources::default())]
    );
    assert!(allocate_loot(units([1, 0, 0]), &[capacity(a, 0)]).is_err());
}
#[test]
fn loot_conservation_across_bounded_resource_and_capacity_grid() {
    for m in [0, 1, 2, 3, 17, 2000, 12000] {
        for c in [0, 1, 5, 2000] {
            for d in [0, 1, 21] {
                for f in [0, 1, 2, 3, 9, 6000, 20000] {
                    let stock = Resources::from_values([m * SCALE + 999999, c * SCALE, d * SCALE]);
                    let loot = raid_loot(stock, f * SCALE).unwrap();
                    assert!(loot.values().iter().all(|v| v % SCALE == 0 && *v >= 0));
                    assert!(loot.values().iter().sum::<i64>() <= f * SCALE);
                    for (l, s) in loot.values().iter().zip(stock.values()) {
                        assert!(*l <= s / 2);
                    }
                    let a = BattleOrigin::Fleet(FleetId(Uuid::from_u128(1)));
                    let b = BattleOrigin::Fleet(FleetId(Uuid::from_u128(2)));
                    let out = allocate_loot(
                        loot,
                        &[capacity(a, f / 2 * SCALE), capacity(b, (f - f / 2) * SCALE)],
                    )
                    .unwrap();
                    for k in 0..3 {
                        assert_eq!(
                            out.iter().map(|(_, r)| r.values()[k]).sum::<i64>(),
                            loot.values()[k]
                        );
                    }
                    assert!(out[0].1.values().iter().sum::<i64>() <= f / 2 * SCALE);
                    assert!(out[1].1.values().iter().sum::<i64>() <= (f - f / 2) * SCALE);
                }
            }
        }
    }
}

#[test]
fn owner_precedes_origin_in_canonical_allocation_ties() {
    let first = BattleOrigin::Fleet(FleetId(Uuid::from_u128(2)));
    let second = BattleOrigin::Fleet(FleetId(Uuid::from_u128(1)));
    let a = LootCapacity {
        owner: PlayerId(Uuid::from_u128(1)),
        origin: first,
        free_capacity: SCALE,
    };
    let b = LootCapacity {
        owner: PlayerId(Uuid::from_u128(2)),
        origin: second,
        free_capacity: SCALE,
    };
    assert_eq!(
        allocate_loot(units([1, 0, 0]), &[b, a]).unwrap(),
        vec![(first, units([1, 0, 0])), (second, Resources::default())]
    );
}
