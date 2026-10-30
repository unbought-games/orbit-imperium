use orbit_engine::*;
#[allow(dead_code)]
mod common;

#[test]
fn ion_fixture_is_an_additive_research_only_update() {
    let previous =
        Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-8.json")).unwrap();
    let next = Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-slice-9.json")).unwrap();
    let delta = validate_rules_update(&previous, &next).unwrap();
    assert_eq!(delta.add_research, vec![ResearchId::IonTechnology]);
    assert!(delta.add_buildings.is_empty());
    assert_eq!(previous.protocol(), next.protocol());
    let mut expected = common::ion_rules(&previous).artifact.clone();
    expected.id = next.artifact.id.clone();
    assert_eq!(expected, next.artifact);
    assert!(validate_rules_update(&next, &previous).is_err());
    for key in [
        CatalogKey::Building(Building::ResearchLab),
        CatalogKey::Research(ResearchId::EnergyTechnology),
        CatalogKey::Research(ResearchId::LaserTechnology),
    ] {
        let mut artifact = next.artifact.clone();
        artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == key)
            .unwrap()
            .enabled = false;
        assert!(Ruleset::from_artifact(artifact, next.speed).is_err());
    }
    let mut missing = next.artifact.clone();
    missing
        .progression
        .as_mut()
        .unwrap()
        .research
        .remove(&ResearchId::IonTechnology);
    assert!(Ruleset::from_artifact(missing, next.speed).is_err());
    let mut disabled = next.artifact.clone();
    disabled
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::IonTechnology))
        .unwrap()
        .enabled = false;
    assert!(
        validate_rules_update(
            &next,
            &Ruleset::from_artifact(disabled, next.speed).unwrap()
        )
        .is_ok()
    );
}
