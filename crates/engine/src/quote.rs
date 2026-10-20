use crate::*;
pub fn quote(
    state: &GameState,
    actor: Actor,
    request: &QuoteRequest,
    at: Timestamp,
    rules: &Ruleset,
) -> Result<Quote, GameError> {
    if rules.progression() {
        return crate::progression::progression_quote(state, actor, request, at, rules);
    }
    if state.profile_hash != rules.hash {
        return Err(GameError::QuoteChanged);
    }
    let mut result = match request {
        QuoteRequest::Fleet { .. } => return Err(GameError::UnavailableContent),
        QuoteRequest::Transport {
            origin,
            target,
            ships,
            cargo,
            speed_percent,
        } => {
            let source = state.bodies.get(origin).ok_or(GameError::NotFound)?;
            if actor != Actor::Player(source.owner) {
                return Err(GameError::NotOwned);
            }
            for stack in ships {
                if !rules.artifact.catalog.is_empty()
                    && !rules.artifact.catalog.iter().any(|e| {
                        e.key == CatalogKey::Ship(stack.ship_type)
                            && e.enabled
                            && e.mobile
                            && e.body_kinds.contains(&source.kind)
                    })
                {
                    return Err(GameError::UnavailableContent);
                }
            }
            let destination = state.bodies.get(target).ok_or(GameError::NotFound)?;
            if origin == target
                || source.universe != destination.universe
                || source.kind != BodyKind::Planet
                || destination.kind != BodyKind::Planet
            {
                return Err(GameError::InvalidInput);
            }
            if cargo.values().iter().any(|v| *v < 0 || *v % SCALE != 0)
                || ships.iter().any(|s| s.owner != source.owner)
            {
                return Err(GameError::InvalidInput);
            }
            let combustion = research_level(state, source.owner, ResearchId::CombustionDrive)
                .map_err(|_| GameError::InvalidInput)?;
            let terms = travel_terms(
                &TransportTermsRequest {
                    origin: source.coordinates,
                    target: destination.coordinates,
                    ships: ships.clone(),
                    combustion,
                    speed_percent: *speed_percent,
                },
                rules,
            )?;
            let payload = cargo
                .values()
                .iter()
                .try_fold(0i64, |sum, v| sum.checked_add(*v))
                .ok_or(GameError::NumericRange)?;
            if payload > terms.maximum_payload {
                return Err(GameError::CargoCapacity);
            }
            let terms_hash = hash(&(
                request,
                &terms,
                &rules.hash,
                source.coordinates,
                destination.coordinates,
                combustion,
            ));
            Ok(Quote {
                progression: None,
                profile_hash: rules.hash.clone(),
                terms_hash,
                cost: Resources {
                    metal: 0,
                    crystal: 0,
                    deuterium: terms.fuel,
                },
                duration: terms.duration,
                target_level: None,
                fuel: terms.fuel,
                capacity: terms.capacity,
                maximum_payload: terms.maximum_payload,
            })
        }
        QuoteRequest::Upgrade { body, building } => {
            let body = state.bodies.get(body).ok_or(GameError::NotFound)?;
            if actor != Actor::Player(body.owner) {
                return Err(GameError::NotOwned);
            }
            if !rules.artifact.catalog.is_empty()
                && !rules.artifact.catalog.iter().any(|e| {
                    e.key == CatalogKey::Building(*building)
                        && e.enabled
                        && e.body_kinds.contains(&body.kind)
                })
            {
                return Err(GameError::UnavailableContent);
            }
            let level = body
                .levels
                .get(building)
                .ok_or(GameError::UnavailableContent)?
                .checked_add(1)
                .ok_or(GameError::NumericRange)?;
            let terms = construction_terms(*building, level, rules)?;
            let mut upgraded = body.clone();
            upgraded.levels.insert(*building, level);
            production_rates(&upgraded, rules)?;
            let terms_hash = hash(&(request, &terms, &rules.hash));
            Ok(Quote {
                progression: None,
                fuel: 0,
                capacity: 0,
                maximum_payload: 0,
                profile_hash: rules.hash.clone(),
                terms_hash,
                cost: terms.cost,
                duration: terms.duration,
                target_level: Some(level),
            })
        }
        _ => return Err(GameError::UnavailableContent),
    }?;
    let first_due = deadline(at, result.duration)?;
    if matches!(request, QuoteRequest::Transport { .. }) {
        deadline(first_due, result.duration)?;
    }

    if rules.artifact.id != "first-slice-v1" {
        result.terms_hash = hash(
            &serde_json::json!({"protocol":2,"request":canonical_request(request),"terms":wire_terms(&result)}),
        );
    }
    Ok(result)
}
