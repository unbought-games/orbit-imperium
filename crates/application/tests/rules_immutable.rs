use orbit_application::*;
use orbit_engine::*;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

struct Store {
    current: ActiveRules,
    writes: Arc<AtomicUsize>,
}
impl RulesStore for Store {
    async fn current_rules(&self, _: UniverseId) -> Result<ActiveRules, RulesUpdateError> {
        Ok(self.current.clone())
    }
    async fn apply_rules(
        &self,
        _: UniverseId,
        _: i64,
        next: &Ruleset,
    ) -> Result<RulesApplyOutcome, RulesUpdateError> {
        self.writes.fetch_add(1, Ordering::SeqCst);
        Ok(RulesApplyOutcome::Applied {
            profile_hash: next.hash.clone(),
            revision: 1,
            effective_at: 0,
        })
    }
}
fn service(rules: Ruleset) -> (RulesService<Store>, RulesDocument, Arc<AtomicUsize>) {
    let writes = Arc::new(AtomicUsize::new(0));
    let document = RulesDocument {
        universe: uuid::Uuid::from_u128(1).into(),
        base_revision: 0,
        artifact: rules.artifact.clone(),
        speed: rules.speed,
    };
    (
        RulesService::new(Store {
            current: ActiveRules { revision: 0, rules },
            writes: writes.clone(),
        }),
        document,
        writes,
    )
}

#[test]
fn rules_diff_and_apply_name_changed_immutable_fields_before_mutation() {
    futures::executor::block_on(async {
        for (field, value) in [
            ("galaxies", 2),
            ("systems_per_galaxy", 6),
            ("positions_per_system", 14),
        ] {
            let (service, document, writes) = service(Ruleset::mvp_raids().unwrap());
            let mut raw = serde_json::to_value(document).unwrap();
            raw["artifact"]["universe"][field] = value.into();
            let document = serde_json::from_value(raw).unwrap();
            let expected = format!("immutable.{field}");
            assert!(
                service
                    .diff(&document)
                    .await
                    .unwrap_err()
                    .to_string()
                    .contains(&expected),
                "{field}"
            );
            assert!(
                service
                    .apply(&document)
                    .await
                    .unwrap_err()
                    .to_string()
                    .contains(&expected),
                "{field}"
            );
            assert_eq!(writes.load(Ordering::SeqCst), 0);
        }
    });
}

#[test]
fn catalog_change_retains_production_five_speed() {
    futures::executor::block_on(async {
        let rules =
            Ruleset::signup_with_speed(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
        let (service, mut document, writes) = service(rules);
        document
            .artifact
            .buildings
            .get_mut(&Building::MetalMine)
            .unwrap()
            .base[0] += 1;
        assert_eq!(service.diff(&document).await.unwrap().changes.len(), 1);
        service.apply(&document).await.unwrap();
        assert_eq!(writes.load(Ordering::SeqCst), 1);
    });
}

#[test]
fn speed_only_diff_is_visible_and_apply_validates_range_and_legacy_profiles() {
    futures::executor::block_on(async {
        let rules =
            Ruleset::signup_with_speed(UniverseProfile::signup(1, 100).unwrap(), 5).unwrap();
        let (service, mut document, writes) = service(rules);
        for speed in [0, 101, -1] {
            document.speed = speed;
            assert!(service.diff(&document).await.is_err());
            assert!(service.apply(&document).await.is_err());
        }
        assert_eq!(writes.load(Ordering::SeqCst), 0);
        document.speed = 3;
        let diff = service.diff(&document).await.unwrap();
        assert_ne!(diff.current_hash, diff.proposed_hash);
        assert_eq!(diff.changes.len(), 1);
        assert_eq!(diff.changes[0].path, "/speed");
        assert_eq!(diff.changes[0].before, Some(5.into()));
        assert_eq!(diff.changes[0].after, Some(3.into()));
        assert!(diff.initialize.add_buildings.is_empty());
        assert!(diff.initialize.add_research.is_empty());
        service.apply(&document).await.unwrap();
        assert_eq!(writes.load(Ordering::SeqCst), 1);
    });
    futures::executor::block_on(async {
        let (service, mut document, writes) = service(Ruleset::mvp_raids().unwrap());
        document.speed = 3;
        assert!(service.diff(&document).await.is_err());
        assert!(service.apply(&document).await.is_err());
        assert_eq!(writes.load(Ordering::SeqCst), 0);
    });
}
