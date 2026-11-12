use super::*;
use serde_json::{Value, json};

/// Only call after resolving an issued game invitation. Current presentation is
/// derived through the same effective cosmetic policies as player profiles.
pub async fn invitation_player<S: GameStore + IdentityStore>(
    store: &S,
    observations: Option<&AccountRewardsClient>,
    customization: Option<&Customization>,
    universe: UniverseId,
    player: PlayerId,
) -> Result<Value, StoreError> {
    let identities = store.player_identities(universe, vec![player]).await?;
    let identity = identities.first().ok_or(StoreError::NotFound)?;
    let name = identity.username.clone();
    let observation =
        if let (Some(client), Some(subject)) = (observations, identity.subject.as_deref()) {
            client.resolve(subject).await
        } else {
            None
        };
    let record = store
        .empire_identities(vec![player])
        .await?
        .remove(&player)
        .ok_or(StoreError::NotFound)?;
    let mut catalog = customization.map_or_else(InsigniaCatalog::default, |c| c.catalog.clone());
    catalog.account_observation = observation.clone();
    let evidence = observation
        .as_ref()
        .map_or_else(SupporterEvidence::default, |o| SupporterEvidence {
            known: true,
            active: o.membership,
            expires_at: o.expires_at,
        });
    let policy = customization.map_or(CosmeticPolicy::Unrestricted, |c| c.policy);
    let title = effective_title(
        &catalog,
        &record.identity.title_id,
        policy,
        &record.grants,
        evidence,
        unbought_auth::now(),
    );
    let equipped = store.equipped_insignias(universe, vec![player]).await?;
    let insignia = customization.and_then(|c| {
        equipped.get(&player).map(|(recipe, grants)| {
            c.appearance(effective_insignia(
                &catalog,
                recipe,
                c.policy,
                grants,
                evidence,
                unbought_auth::now(),
            ))
        })
    });
    Ok(
        json!({"name":name,"empire_name":record.identity.name,"tagline":record.identity.tagline,"title":title,"insignia":insignia}),
    )
}
