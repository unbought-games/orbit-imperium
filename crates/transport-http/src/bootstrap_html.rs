use orbit_application::{Bootstrap, ServiceError};
pub(super) const OPEN: &str = "<script id=\"orbit-bootstrap\" type=\"application/json\">";
pub(super) const PLACEHOLDER: &str =
    "<script id=\"orbit-bootstrap\" type=\"application/json\"></script>";
pub(super) fn render_bootstrap_html(
    template: &str,
    bootstrap: &Bootstrap,
) -> Result<String, ServiceError> {
    if template.matches(PLACEHOLDER).count() != 1
        || template.matches("id=\"orbit-bootstrap\"").count() != 1
    {
        return Err(ServiceError::InvariantFailure);
    }
    let json = serde_json::to_string(bootstrap).map_err(|_| ServiceError::InvariantFailure)?;
    let safe = json
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");
    Ok(template.replacen(PLACEHOLDER, &format!("{OPEN}{safe}</script>"), 1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_application::*;
    #[test]
    fn script_terminators_are_inert_and_round_trip() {
        let text = "</script><script>alert(1)</script>&>\u{2028}\u{2029}";
        let b = Bootstrap {
            version: 1,
            signup_enabled: true,
            result: BootstrapResult::Authenticated {
                session: AuthenticatedSession {
                    account: AccountId(uuid::Uuid::nil()),
                    csrf: text.into(),
                    expires_at: 0,
                    memberships: vec![],
                },
                game: BootstrapGame::NoMembership,
            },
        };
        let html = render_bootstrap_html(PLACEHOLDER, &b).unwrap();
        assert_eq!(html.matches("</script>").count(), 1);
        let payload = html
            .strip_prefix(OPEN)
            .unwrap()
            .strip_suffix("</script>")
            .unwrap();
        assert!(!payload.contains(['<', '>', '&', '\u{2028}', '\u{2029}']));
        let value: serde_json::Value = serde_json::from_str(payload).unwrap();
        assert_eq!(value["result"]["session"]["csrf"], text);
        assert!(render_bootstrap_html("missing", &b).is_err());
        assert!(render_bootstrap_html(&PLACEHOLDER.repeat(2), &b).is_err());
    }
}
