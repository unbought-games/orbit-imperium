use crate::*;

pub fn normalize_planet_name(name: &str) -> Result<String, GameError> {
    // Check controls before trimming so newlines and tabs cannot disappear silently.
    if name.chars().any(char::is_control) {
        return Err(GameError::InvalidInput);
    }
    let name = name.trim();
    if !(1..=40).contains(&name.chars().count()) {
        return Err(GameError::InvalidInput);
    }
    Ok(name.to_owned())
}

pub(crate) fn rename_planet(
    state: &GameState,
    actor: Actor,
    id: BodyId,
    name: &str,
) -> Result<Body, GameError> {
    let body = state.bodies.get(&id).ok_or(GameError::NotOwned)?;
    if actor != Actor::Player(body.owner) {
        return Err(GameError::NotOwned);
    }
    if body.kind != BodyKind::Planet {
        return Err(GameError::InvalidInput);
    }
    let mut renamed = body.clone();
    renamed.name = Some(normalize_planet_name(name)?);
    renamed.revision = body
        .revision
        .checked_add(1)
        .ok_or(GameError::NumericRange)?;
    Ok(renamed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_trim_unicode_whitespace_and_count_unicode_scalars() {
        for name in ["A", "New Terra", "Luna’s End — 世界 🪐", &"🪐".repeat(40)] {
            assert_eq!(
                normalize_planet_name(&format!(" \u{2003}{name} ")).unwrap(),
                name
            );
        }
        for name in [
            "",
            " \u{2003} ",
            "a\nb",
            "\tTerra",
            "Terra\r",
            "a\0b",
            "a\u{7f}b",
            "a\u{85}b",
            &"🪐".repeat(41),
        ] {
            assert_eq!(normalize_planet_name(name), Err(GameError::InvalidInput));
        }
    }
}
