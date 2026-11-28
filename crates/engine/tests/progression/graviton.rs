use super::*;

const GRAVITON: ResearchId = ResearchId::GravitonTechnology;

#[test]
fn local_gross_supply_is_rechecked_only_until_acceptance() {
    let (mut state, old, player, host) = research_network::fixture();
    let standard = standard_signup_rules(UniverseProfile::signup(1, 5).unwrap(), 1).unwrap();
    let mut artifact = old.artifact.clone();
    let definition = standard.artifact.progression.as_ref().unwrap().research[&GRAVITON].clone();
    artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .insert(GRAVITON, definition);
    let key = CatalogKey::Research(GRAVITON);
    *artifact.catalog.iter_mut().find(|e| e.key == key).unwrap() = standard
        .artifact
        .catalog
        .iter()
        .find(|e| e.key == key)
        .unwrap()
        .clone();
    artifact.universe = None;
    // One fully powered solar plant produces exactly the first threshold.
    artifact.energy_supply = 300_000;
    artifact.energy_demand[0] = 40_000;
    artifact.growth = [1, 1];
    let rules = Ruleset::from_artifact(artifact, 100).unwrap();
    state.profile_hash = rules.hash.clone();
    let body = state.bodies.get_mut(&host).unwrap();
    body.levels.insert(Building::MetalMine, 1);
    body.levels.insert(Building::SolarPlant, 1);
    body.levels.insert(Building::ResearchLab, 11);
    body.checkpoint.amounts = Resources::default();
    state
        .research
        .get_mut(&player)
        .unwrap()
        .levels
        .insert(GRAVITON, 0);
    let request = QuoteRequest::Research {
        host,
        research: GRAVITON,
    };
    // An independently eligible, powered remote lab cannot qualify the origin.
    research_network::colony(&mut state, host, 700, 12);
    blocked(
        &state,
        &rules,
        player,
        0,
        request.clone(),
        GameError::PrerequisiteMissing,
    );
    state
        .bodies
        .get_mut(&host)
        .unwrap()
        .levels
        .insert(Building::ResearchLab, 12);
    let actor = Actor::Player(player);
    let start = command(&state, &rules, player, 0, request.clone());
    let mut below = rules.artifact.clone();
    below.energy_supply -= 1;
    let below = Ruleset::from_artifact(below, rules.speed).unwrap();
    let mut underpowered = state.clone();
    underpowered.profile_hash = below.hash.clone();
    let quote = inspect_progression(&underpowered, actor, &request, 0, &below).unwrap();
    assert_eq!(quote.blockers.len(), 1);
    let blocker = &quote.blockers[0];
    assert_eq!(blocker.code, GameError::EnergyRequired);
    assert_eq!(blocker.actual.as_deref(), Some("299999000000"));
    assert_eq!(blocker.required.as_deref(), Some("300000000000"));
    assert_eq!(blocker.unit, Some(BlockerUnit::MicroEnergy));

    state
        .production_settings
        .get_mut(&host)
        .unwrap()
        .settings
        .solar_plant = 90;
    let mut input = common::input(
        &state,
        &rules,
        actor,
        0,
        8900,
        Input::Command(start.clone()),
    );
    input.protocol = rules.protocol();
    input.schema_version = rules.protocol();
    assert_eq!(
        transition(&state, &input, &rules),
        TransitionResult::Rejected(GameError::EnergyRequired)
    );

    state
        .production_settings
        .get_mut(&host)
        .unwrap()
        .settings
        .solar_plant = 100;
    let started = run(&mut state, &rules, actor, 0, 8901, Input::Command(start));
    assert_eq!(
        started.research_operations[0].commitment.paid,
        Resources::default()
    );
    assert_eq!(started.events[0].at, 1000);
    assert_eq!(state.research[&player].levels[&GRAVITON], 0);
    state
        .production_settings
        .get_mut(&host)
        .unwrap()
        .settings
        .solar_plant = 0;
    for id in [8902, 8903] {
        run(
            &mut state,
            &rules,
            Actor::Scheduler,
            1000,
            id,
            Input::Event(started.events[0].event.clone()),
        );
    }
    assert_eq!(state.research[&player].levels[&GRAVITON], 1);
    let next = inspect_progression(&state, actor, &request, 1000, &rules)
        .unwrap()
        .terms
        .unwrap();
    assert!(
        matches!(next, ProgressionMaterial::Research { required_energy, duration_ms: 1000, .. } if required_energy == 900_000 * SCALE)
    );
    assert_eq!(graviton_required_energy(2), Ok(2_700_000 * SCALE));
    assert_eq!(graviton_required_energy(15), Ok(4_304_672_100_000 * SCALE));
    assert_eq!(graviton_required_energy(16), Err(GameError::NumericRange));
}

#[test]
fn graviton_uses_only_stationed_satellites_and_fueled_output_on_the_origin() {
    let (mut state, _, player, host) = prepared();
    let rules = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
    state.profile_hash = rules.hash.clone();
    let body = state.bodies.get_mut(&host).unwrap();
    body.levels = rules.building_keys().into_iter().map(|k| (k, 0)).collect();
    body.levels.insert(Building::ResearchLab, 12);
    body.levels.insert(Building::FusionReactor, 10);
    body.checkpoint.amounts = Resources::default();
    body.max_temperature = 40; // 30 energy per satellite.
    state.research.get_mut(&player).unwrap().levels =
        rules.research_keys().into_iter().map(|k| (k, 0)).collect();
    state.inventories.push(InventoryStack {
        body: host,
        owner: player,
        item: ManufacturedItem::Ship(ShipType::SolarSatellite),
        count: 10_000,
        revision: 0,
    });
    let request = QuoteRequest::Research {
        host,
        research: GRAVITON,
    };
    command(&state, &rules, player, 0, request.clone());
    state.inventories[0].count -= 1;
    let short = inspect_progression(&state, Actor::Player(player), &request, 0, &rules).unwrap();
    assert!(short.blockers.iter().any(
        |b| b.code == GameError::EnergyRequired && b.actual.as_deref() == Some("299970000000")
    ));
    state
        .bodies
        .get_mut(&host)
        .unwrap()
        .checkpoint
        .amounts
        .deuterium = 1000 * SCALE;
    command(&state, &rules, player, 0, request.clone());
    state
        .production_settings
        .get_mut(&host)
        .unwrap()
        .settings
        .solar_satellite = 90;
    blocked(
        &state,
        &rules,
        player,
        0,
        request,
        GameError::EnergyRequired,
    );
}
