use orbit_engine::*;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
pub fn fixture() -> (GameState, Ruleset, PlayerId, BodyId) {
    let rules =
        Ruleset::from_json(include_bytes!("../../../../rules/first-slice-v1.json")).unwrap();
    let player = PlayerId(Uuid::from_u128(1));
    let body = BodyId(Uuid::from_u128(2));
    let u = UniverseId(Uuid::from_u128(3));
    let b = Body {
        name: None,
        id: body,
        universe: u,
        owner: player,
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
    };
    let s = GameState {
        world: None,
        production_settings: Default::default(),
        research_operations: Default::default(),
        manufacturing_batches: Default::default(),
        progression_reservations: Default::default(),
        fleets: BTreeMap::new(),
        reports: BTreeMap::new(),
        universe: u,
        epoch: Epoch(Uuid::from_u128(4)),
        profile_hash: rules.hash.clone(),
        bodies: BTreeMap::from([(body, b)]),
        players: BTreeMap::from([(
            player,
            Player {
                id: player,
                universe: u,
            },
        )]),
        inventories: vec![],
        research: BTreeMap::from([(
            player,
            ResearchLevels {
                owner: player,
                levels: BTreeMap::from([
                    (ResearchId::CombustionDrive, 1),
                    (ResearchId::ComputerTechnology, 0),
                ]),
                revision: 0,
            },
        )]),
        constructions: BTreeMap::new(),
        coverage: FactCoverage {
            production_bodies: Default::default(),
            research_operation_ids: Default::default(),
            research_slot_players: Default::default(),
            owned_body_players: Default::default(),
            lab_construction_players: Default::default(),
            manufacturing_operation_ids: Default::default(),
            manufacturing_bodies: Default::default(),
            reservation_bodies: Default::default(),
            operations: Default::default(),
            fleet_ids: Default::default(),
            bodies: BTreeSet::from([body]),
            construction_bodies: BTreeSet::from([body]),
            inventory_owners: BTreeSet::from([(body, player)]),
            research_players: BTreeSet::from([player]),
            fleet_owners: BTreeSet::from([player]),
        },
        collection_revisions: BTreeMap::new(),
    };
    (s, rules, player, body)
}
pub fn input(
    s: &GameState,
    r: &Ruleset,
    p: Actor,
    at: i64,
    n: u128,
    payload: Input,
) -> OrderedInput {
    OrderedInput {
        schema_version: 2,
        id: InputId(Uuid::from_u128(n)),
        universe: s.universe,
        epoch: s.epoch,
        actor: p,
        at,
        phase: if matches!(payload, Input::Event(_)) {
            0
        } else {
            1
        },
        sequence: i64::try_from(n).unwrap(),
        protocol: 1,
        profile_hash: r.hash.clone(),
        payload,
    }
}
pub fn applied(s: &mut GameState, result: TransitionResult) -> ChangeSet {
    if let TransitionResult::Applied(changes) = result {
        changes.apply_to(s).unwrap();
        *changes
    } else {
        panic!("expected applied, got {result:?}")
    }
}

#[allow(dead_code)]
pub fn impulse_rules(rules: &Ruleset) -> Ruleset {
    let content: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../rules/content/impulse-drive.json"
    ))
    .unwrap();
    let mut artifact = rules.artifact.clone();
    artifact.progression.as_mut().unwrap().research.insert(
        ResearchId::ImpulseDrive,
        serde_json::from_value(content["research"].clone()).unwrap(),
    );
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::ImpulseDrive))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    if artifact.world.is_some() {
        artifact
            .ships
            .get_mut(&ShipType::SmallCargo)
            .unwrap()
            .impulse_drive = Some(serde_json::from_value(content["small_cargo"].clone()).unwrap());
    }
    Ruleset::from_artifact(artifact, rules.speed).unwrap()
}

#[allow(dead_code)]
pub fn astrophysics_rules(rules: &Ruleset) -> Ruleset {
    let mut artifact = impulse_rules(rules).artifact;
    let content: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../rules/content/astrophysics.json"
    ))
    .unwrap();
    artifact.progression.as_mut().unwrap().research.insert(
        ResearchId::Astrophysics,
        serde_json::from_value(content["research"].clone()).unwrap(),
    );
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::Astrophysics))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    Ruleset::from_artifact(artifact, rules.speed).unwrap()
}

#[allow(dead_code)]
pub fn light_laser_rules(rules: &Ruleset) -> Ruleset {
    // Copy only the new feature from the immutable fixture; keep the caller's
    // world, protocol, speed and unrelated progression definitions intact.
    let fixture =
        Ruleset::from_json(include_bytes!("../../../../rules/mvp-v1-slice-8.json")).unwrap();
    let mut artifact = rules.artifact.clone();
    let laser = CatalogKey::Research(ResearchId::LaserTechnology);
    let defense = CatalogKey::Defense(DefenseId::LightLaser);
    for key in [laser, defense] {
        *artifact.catalog.iter_mut().find(|e| e.key == key).unwrap() = fixture
            .artifact
            .catalog
            .iter()
            .find(|e| e.key == key)
            .unwrap()
            .clone();
    }
    let source = fixture.artifact.progression.as_ref().unwrap();
    let progression = artifact.progression.as_mut().unwrap();
    progression.research.insert(
        ResearchId::LaserTechnology,
        source.research[&ResearchId::LaserTechnology].clone(),
    );
    progression.unit_costs.push(
        source
            .unit_costs
            .iter()
            .find(|u| u.item.catalog_key() == defense)
            .unwrap()
            .clone(),
    );
    if let Some(world) = artifact.world.as_mut() {
        world.combat.units.push(
            fixture
                .artifact
                .world
                .as_ref()
                .unwrap()
                .combat
                .units
                .iter()
                .find(|u| u.item.catalog_key() == defense)
                .unwrap()
                .clone(),
        );
    }
    Ruleset::from_artifact(artifact, rules.speed).unwrap()
}

#[allow(dead_code)]
pub fn ion_rules(rules: &Ruleset) -> Ruleset {
    let mut artifact = rules.artifact.clone();
    let content: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../rules/content/ion-technology.json"
    ))
    .unwrap();
    artifact.progression.as_mut().unwrap().research.insert(
        ResearchId::IonTechnology,
        serde_json::from_value(content["research"].clone()).unwrap(),
    );
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::IonTechnology))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    Ruleset::from_artifact(artifact, rules.speed).unwrap()
}

#[allow(dead_code)]
pub fn ion_cannon_rules(rules: &Ruleset) -> Ruleset {
    let mut artifact = rules.artifact.clone();
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../../rules/content/ion-cannon.json"))
            .unwrap();
    let item = ManufacturedItem::Defense(DefenseId::IonCannon);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .push(UnitCost {
            item,
            cost: serde_json::from_value(content["cost"].clone()).unwrap(),
        });
    if let Some(world) = artifact.world.as_mut() {
        world
            .combat
            .units
            .push(serde_json::from_value(content["combat"].clone()).unwrap());
    }
    Ruleset::from_artifact(artifact, rules.speed).unwrap()
}

#[allow(dead_code)]
pub fn gauss_cannon_rules(rules: &Ruleset) -> Ruleset {
    let mut artifact = rules.artifact.clone();
    let content: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../rules/content/gauss-cannon.json"
    ))
    .unwrap();
    let item = ManufacturedItem::Defense(DefenseId::GaussCannon);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .push(UnitCost {
            item,
            cost: serde_json::from_value(content["cost"].clone()).unwrap(),
        });
    if let Some(world) = artifact.world.as_mut() {
        world
            .combat
            .units
            .push(serde_json::from_value(content["combat"].clone()).unwrap());
    }
    Ruleset::from_artifact(artifact, rules.speed).unwrap()
}

#[allow(dead_code)]
pub fn heavy_laser_rules(rules: &Ruleset) -> Ruleset {
    let mut artifact = rules.artifact.clone();
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../../rules/content/heavy-laser.json"))
            .unwrap();
    let item = ManufacturedItem::Defense(DefenseId::HeavyLaser);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .push(UnitCost {
            item,
            cost: serde_json::from_value(content["cost"].clone()).unwrap(),
        });
    if let Some(world) = artifact.world.as_mut() {
        world
            .combat
            .units
            .push(serde_json::from_value(content["combat"].clone()).unwrap());
    }
    Ruleset::from_artifact(artifact, rules.speed).unwrap()
}

#[allow(dead_code)]
pub fn large_shield_dome_rules(rules: &Ruleset) -> Ruleset {
    let mut artifact = rules.artifact.clone();
    let content: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../rules/content/large-shield-dome.json"
    ))
    .unwrap();
    let item = ManufacturedItem::Defense(DefenseId::LargeShieldDome);
    let entry = artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .push(UnitCost {
            item,
            cost: serde_json::from_value(content["cost"].clone()).unwrap(),
        });
    if let Some(world) = artifact.world.as_mut() {
        world
            .combat
            .units
            .push(serde_json::from_value(content["combat"].clone()).unwrap());
    }
    Ruleset::from_artifact(artifact, rules.speed).unwrap()
}
