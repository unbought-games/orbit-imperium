use super::{AllianceError, AlliancePermission};
use std::collections::BTreeSet;
pub(super) fn timestamp(now: i64) -> Result<(), AllianceError> {
    if !(0..=crate::MAX_WIRE_MS).contains(&now) {
        return Err(AllianceError::InvalidInput(
            "timestamp must be a nonnegative safe integer".into(),
        ));
    }
    Ok(())
}
pub(super) fn label(value: &str, min: usize, max: usize, field: &str) -> Result<(), AllianceError> {
    let value = value.trim();
    if !(min..=max).contains(&value.chars().count()) || value.chars().any(char::is_control) {
        return Err(AllianceError::InvalidInput(format!(
            "{field} must contain {min}–{max} characters without control characters"
        )));
    }
    Ok(())
}
pub(super) fn identity(name: &str, tag: &str) -> Result<(), AllianceError> {
    label(name, 3, 48, "name")?;
    label(tag, 3, 8, "tag")?;
    if !tag.trim().chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AllianceError::InvalidInput(
            "tag must contain only ASCII letters and numbers".into(),
        ));
    }
    Ok(())
}
pub(super) fn markdown(value: &str, max: usize, field: &str) -> Result<(), AllianceError> {
    if value.chars().count() > max
        || value
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
    {
        return Err(AllianceError::InvalidInput(format!(
            "{field} exceeds {max} characters or contains control characters"
        )));
    }
    if value.contains("![")
        || value.match_indices('<').any(|(i, _)| {
            value[i + 1..]
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_alphabetic() || matches!(c, '/' | '!' | '?'))
        })
    {
        return Err(AllianceError::InvalidInput(
            "raw HTML and images are not supported".into(),
        ));
    }
    // Rendering independently enforces a safe URL allowlist.
    let compact: String = value
        .chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect();
    if ["javascript:", "vbscript:", "data:", "file:"]
        .iter()
        .any(|scheme| compact.contains(scheme))
    {
        return Err(AllianceError::InvalidInput("unsafe link protocol".into()));
    }
    Ok(())
}
pub(super) fn post(title: &str, body: &str) -> Result<(), AllianceError> {
    label(title, 1, 120, "post title")?;
    markdown(body, 8000, "post body")?;
    if body.trim().is_empty() {
        return Err(AllianceError::InvalidInput(
            "post body cannot be empty".into(),
        ));
    }
    Ok(())
}
pub(super) fn dependencies(permissions: &[AlliancePermission]) -> Result<(), AllianceError> {
    use AlliancePermission::*;
    for (permission, required) in [
        (ViewActivity, ViewMembers),
        (ProcessApplications, ViewApplications),
    ] {
        if permissions.contains(&permission) && !permissions.contains(&required) {
            return Err(AllianceError::InvalidInput(format!(
                "{permission:?} requires {required:?}"
            )));
        }
    }
    Ok(())
}
pub(super) fn unique<T: Copy + Ord>(values: &[T]) -> Vec<T> {
    values
        .iter()
        .copied()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
