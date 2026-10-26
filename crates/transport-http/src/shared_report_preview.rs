//! Crawler-visible metadata consumes only the same redacted projection as the public API.
use super::*;
use std::collections::BTreeSet;

struct Preview {
    title: String,
    description: String,
}
fn side(report: &SharedReport, side: &str) -> String {
    let mut seen = BTreeSet::new();
    let owners: Vec<_> = report.payload["participants"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|p| p["side"] == side)
        .filter_map(|p| p["owner"].as_str())
        .filter(|owner| seen.insert(*owner))
        .collect();
    let names: Vec<_> = owners
        .iter()
        .filter_map(|owner| report.player_names.get(*owner))
        .take(4)
        .map(|name| name.chars().take(60).collect::<String>())
        .collect();
    if names.is_empty() {
        return format!("{side}s");
    }
    let more = if seen.len() > names.len() {
        " and others"
    } else {
        ""
    };
    format!("{}{more}", names.join(", "))
}
impl Preview {
    fn from_report(report: &SharedReport) -> Self {
        match report.payload["kind"].as_str() {
            Some("Combat") => Self {
                title: format!("{} vs {} · Combat report", side(report, "Attacker"), side(report, "Defender")),
                description: format!("{}. Shared combat report in Orbit Imperium.", match report.payload["outcome"].as_str() {
                    Some("AttackerVictory") => "Attacker victory",
                    Some("DefenderVictory") => "Defender victory",
                    Some("Draw") => "Draw",
                    _ => "Outcome unavailable",
                }),
            },
            Some("ContactLost") => Self {
                title: "Contact lost · Combat report".into(),
                description: "Contact was lost with the attacking fleet. The defender’s outcome is unknown. Shared report in Orbit Imperium.".into(),
            },
            _ => Self {
                title: "Shared espionage report · Orbit Imperium".into(),
                description: "View the intelligence revealed in this shared observation. Unobserved sections remain unknown.".into(),
            },
        }
    }
    fn unavailable() -> Self {
        Self {
            title: "Shared report unavailable · Orbit Imperium".into(),
            description: "This link may have been revoked or its report deleted.".into(),
        }
    }
    fn metadata(&self, url: &str) -> String {
        let title = escape(&self.title);
        let description = escape(&self.description);
        let url = escape(url);
        format!(
            r#"<title>{title}</title><meta name="description" content="{description}"><meta property="og:type" content="website"><meta property="og:site_name" content="Orbit Imperium"><meta property="og:title" content="{title}"><meta property="og:description" content="{description}"><meta property="og:url" content="{url}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="{title}"><meta name="twitter:description" content="{description}">"#
        )
    }
}
fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn render(template: &str, preview: &Preview, url: &str) -> Option<String> {
    let start = template.find("<!--orbit-page-metadata:start-->")?;
    let end =
        template.find("<!--orbit-page-metadata:end-->")? + "<!--orbit-page-metadata:end-->".len();
    let mut html = template.to_owned();
    html.replace_range(start..end, &preview.metadata(url));
    bootstrap_html::render_bootstrap_html(
        &html,
        &Bootstrap {
            version: 1,
            signup_enabled: false,
            result: BootstrapResult::Anonymous,
        },
    )
    .ok()
}
fn response(status: StatusCode, body: String) -> Response {
    let mut response = (
        status,
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "private, no-store"),
        ],
        body,
    )
        .into_response();
    response.headers_mut().insert(
        "x-robots-tag",
        "noindex, nofollow, noarchive".parse().unwrap(),
    );
    response
        .headers_mut()
        .insert("referrer-policy", "no-referrer".parse().unwrap());
    response
}
pub(super) async fn page<S: GameStore + IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    Path(token): Path<String>,
) -> Response {
    let result = match uuid::Uuid::parse_str(&token) {
        Ok(token) => s.game.shared_report(token).await,
        Err(_) => Err(ServiceError::NotFound),
    };
    let (status, preview) = match result {
        Ok(report) => (StatusCode::OK, Preview::from_report(&report)),
        Err(ServiceError::NotFound) => (StatusCode::NOT_FOUND, Preview::unavailable()),
        Err(_) => {
            return response(
                StatusCode::SERVICE_UNAVAILABLE,
                "Shared report temporarily unavailable.".into(),
            );
        }
    };
    let template =
        match tokio::fs::read_to_string(std::path::Path::new(&s.config.assets).join("index.html"))
            .await
        {
            Ok(template) => template,
            Err(_) => {
                return response(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Shared report temporarily unavailable.".into(),
                );
            }
        };
    let url = format!(
        "{}/reports/shared/{token}",
        s.config.origin.trim_end_matches('/')
    );
    match render(&template, &preview, &url) {
        Some(html) => response(status, html),
        None => response(
            StatusCode::SERVICE_UNAVAILABLE,
            "Shared report temporarily unavailable.".into(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_engine::{PlayerId, ReportId};
    use serde_json::json;
    #[test]
    fn metadata_uses_redacted_participants_and_outcomes_and_escapes_names() {
        let attacker = PlayerId(uuid::Uuid::from_u128(1));
        let defender = PlayerId(uuid::Uuid::from_u128(2));
        for outcome in ["AttackerVictory", "DefenderVictory", "Draw"] {
            for identity in [false, true] {
                let source = json!({"kind":"Combat","outcome":outcome,"target":{"galaxy":9,"system":8,"position":7},"target_name":"PRIVATE PLANET","participants":[{"owner":attacker,"side":"Attacker"},{"owner":attacker,"side":"Attacker"},{"owner":defender,"side":"Defender"}]});
                let shared = project_shared_report(
                    ReportId::default(),
                    1,
                    &source,
                    &PublicPlayerNames::from([
                        (attacker, "Alice <\"&>".into()),
                        (defender, "Bob".into()),
                    ]),
                    ReportShareOptions {
                        include_identity: identity,
                        include_coordinates: false,
                    },
                )
                .unwrap();
                let preview = Preview::from_report(&shared);
                let html = render(
                    include_str!("../../../apps/web/index.html"),
                    &preview,
                    "https://game.test/reports/shared/token",
                )
                .unwrap();
                assert!(!html.contains("Build planets"));
                assert!(!html.contains("PRIVATE PLANET"));
                assert!(!html.contains(&attacker.to_string()));
                assert!(!html.contains("[9:8:7]"));
                assert!(html.contains("anonymous"));
                assert_eq!(html.matches("<title>").count(), 1);
                assert_eq!(html.matches("name=\"description\"").count(), 1);
                if identity {
                    assert!(html.contains("Alice &lt;&quot;&amp;&gt; vs Bob"));
                    assert!(!preview.title.contains("Alice <\"&>, Alice"));
                } else {
                    assert!(!html.contains("Alice"));
                    assert!(!html.contains("Bob"));
                    assert!(html.contains("Player 1 vs Player 2"));
                }
                assert!(html.contains(match outcome {
                    "AttackerVictory" => "Attacker victory",
                    "DefenderVictory" => "Defender victory",
                    _ => "Draw",
                }));
            }
        }
    }
    #[test]
    fn group_previews_bound_names_and_acknowledge_additional_participants() {
        let source = json!({"kind":"Combat","outcome":"Draw","participants": (1..=6).map(|n| json!({"owner":PlayerId(uuid::Uuid::from_u128(n)),"side":"Attacker"})).collect::<Vec<_>>()});
        let shared = project_shared_report(
            ReportId::default(),
            1,
            &source,
            &Default::default(),
            Default::default(),
        )
        .unwrap();
        let title = Preview::from_report(&shared).title;
        assert!(title.contains("Player 1, Player 2, Player 3, Player 4 and others"));
        assert!(!title.contains("Player 5"));
        assert!(title.contains("vs Defenders"));
    }
    #[test]
    fn contact_lost_and_unavailable_never_infer_hidden_outcomes() {
        let shared = project_shared_report(ReportId::default(), 1, &json!({"kind":"ContactLost","outcome":"DefenderVictory","participants":[{"owner":"SECRET"}]}), &Default::default(), Default::default()).unwrap();
        let preview = Preview::from_report(&shared).metadata("https://game.test");
        assert!(preview.contains("outcome is unknown"));
        assert!(!preview.contains("Defender victory"));
        assert!(!preview.contains("SECRET"));
        let unavailable = render(
            include_str!("../../../apps/web/index.html"),
            &Preview::unavailable(),
            "https://game.test",
        )
        .unwrap();
        assert!(!unavailable.contains("Build planets"));
        assert!(unavailable.contains("Shared report unavailable"));
    }
}
