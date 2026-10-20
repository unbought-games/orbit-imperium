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
            ("speed", 5),
            ("galaxies", 2),
            ("systems_per_galaxy", 6),
            ("positions_per_system", 14),
        ] {
            let (service, document, writes) = service(Ruleset::mvp_raids().unwrap());
            let mut raw = serde_json::to_value(document).unwrap();
            if field == "speed" {
                raw[field] = value.into();
            } else {
                raw["artifact"]["universe"][field] = value.into();
            }
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
