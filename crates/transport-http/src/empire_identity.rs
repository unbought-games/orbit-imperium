use super::*;

pub(super) async fn evidence<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    p: &EmpireProfile,
) -> Result<(SupporterEvidence, Option<AccountCosmeticObservation>), Problem> {
    let Some(profiles) = &s.profiles else {
        return Ok((SupporterEvidence::default(), None));
    };
    let identities = s
        .updates
        .player_identities(UniverseId(p.universe), vec![PlayerId(p.player)])
        .await
        .map_err(ServiceError::from)?;
    Ok(profiles.display(identities).await.first().map_or_else(
        || (SupporterEvidence::default(), None),
        |d| (d.evidence(), d.account_cosmetics.clone()),
    ))
}

pub(super) async fn decorate<S: GameStore + IdentityStore>(
    s: &HttpState<S>,
    p: &mut EmpireProfile,
) -> Result<(), Problem> {
    let fallback = InsigniaCatalog::default();
    let (catalog, policy) = s
        .customization
        .as_ref()
        .map_or((&fallback, CosmeticPolicy::Unrestricted), |c| {
            (&c.catalog, c.policy)
        });
    let (evidence, observation) = if policy == CosmeticPolicy::Supporter {
        evidence(s, p).await?
    } else {
        (SupporterEvidence::default(), None)
    };
    let mut catalog = catalog.clone();
    catalog.account_observation = observation;
    let catalog = &catalog;
    let now = unbought_auth::now();
    p.title = effective_title(
        catalog,
        &p.identity.title_id,
        policy,
        &p.title_grants,
        evidence,
        now,
    );
    if p.owner && !p.removed && !p.closed {
        p.title_choices = Some(
            catalog
                .titles()
                .iter()
                .map(|title| TitleChoice {
                    title: title.clone(),
                    availability: title_access(
                        catalog,
                        &title.id,
                        policy,
                        &p.title_grants,
                        evidence,
                        now,
                    ),
                })
                .collect(),
        );
    }
    Ok(())
}

/// Preserve the original archive response shape for cached older web clients.
pub(super) fn response(h: &HeaderMap, value: impl serde::Serialize) -> Result<Response, Problem> {
    let mut value = serde_json::to_value(value).map_err(|_| ServiceError::InvariantFailure)?;
    if h.get("x-orbit-identity").is_none_or(|v| v != "1") {
        fn strip(value: &mut serde_json::Value) {
            if let Some(obj) = value.as_object_mut() {
                for key in ["identity", "title", "title_choices"] {
                    obj.remove(key);
                }
            }
        }
        strip(&mut value);
        if let Some(empires) = value.get_mut("empires").and_then(|v| v.as_array_mut()) {
            for p in empires {
                strip(p);
            }
        }
    }
    Ok(bound_api::no_store_json(value))
}
