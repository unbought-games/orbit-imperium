use super::Integration;
use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;

const COOKIE: &str = "orbit_attribution";
const WINDOW: i64 = 30 * 86400000;
#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Source {
    at: String,
    page: String,
    route: String,
    referrer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    campaign: Option<Value>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Journey {
    visit_id: uuid::Uuid,
    visitor_id: uuid::Uuid,
    seen: i64,
    source: Source,
    #[serde(default)]
    bound: Option<uuid::Uuid>,
    #[serde(default)]
    epoch: String,
    #[serde(default)]
    returned_page: Option<String>,
}
fn label(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && !value.chars().any(|c| c.is_control() || "<>@\\".contains(c))
}
pub(super) fn page_context(url: &reqwest::Url, routes: &[String]) -> (String, String) {
    let actual: Vec<_> = url.path().split('/').collect();
    let compared = if actual.len() > 2 && actual.last() == Some(&"") {
        &actual[..actual.len() - 1]
    } else {
        &actual[..]
    };
    let mut matching: Vec<_> = routes
        .iter()
        .filter(|route| {
            let parts: Vec<_> = route.trim_end_matches('/').split('/').collect();
            parts.len() == compared.len()
                && parts.iter().zip(compared).all(|(p, a)| {
                    if p.starts_with(':') {
                        !a.is_empty()
                    } else {
                        p == a
                    }
                })
        })
        .collect();
    matching.sort_by_key(|v| v.matches(':').count());
    let route = matching.first().map_or(url.path(), |v| v.as_str());
    let template: Vec<_> = route.trim_end_matches('/').split('/').collect();
    let path = actual
        .iter()
        .enumerate()
        .map(|(i, p)| match template.get(i).copied() {
            Some(":code" | ":token" | ":secret" | ":password") => template[i],
            _ => p,
        })
        .collect::<Vec<_>>()
        .join("/");
    let origin = url.origin().ascii_serialization();
    (
        format!("{origin}{}", if path.is_empty() { "/" } else { &path }),
        format!("{origin}{route}"),
    )
}
fn source(
    url: &reqwest::Url,
    headers: &axum::http::HeaderMap,
    routes: &[String],
    internal_origins: &std::collections::BTreeMap<String, uuid::Uuid>,
) -> Source {
    let mut campaign = serde_json::Map::new();
    for key in [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "experiment_id",
    ] {
        let values: Vec<_> = url
            .query_pairs()
            .filter(|(k, _)| k == key || (key == "experiment_id" && k == "experiment"))
            .collect();
        if values.len() == 1 && label(&values[0].1) {
            campaign.insert(key.into(), json!(values[0].1));
        }
    }
    let (page, route) = page_context(url, routes);
    let referrer = headers
        .get(header::REFERER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| reqwest::Url::parse(v).ok())
        .filter(|u| {
            matches!(u.scheme(), "http" | "https")
                && u.username().is_empty()
                && u.password().is_none()
        })
        .map(|u| page_context(&u, routes).0);
    if campaign.is_empty() {
        if route.contains("/invite/:") {
            campaign.insert("utm_source".into(), json!("invitation"));
            campaign.insert("utm_medium".into(), json!("referral"));
        } else if let Some(referrer) = &referrer
            && let Ok(r) = reqwest::Url::parse(referrer)
            && r.origin() != url.origin()
            && !internal_origins.contains_key(&r.origin().ascii_serialization())
        {
            campaign.insert("utm_source".into(), json!(r.host_str().unwrap_or_default()));
            campaign.insert("utm_medium".into(), json!("referral"));
        }
    }
    Source {
        at: Utc::now().to_rfc3339(),
        page,
        route,
        referrer,
        campaign: (!campaign.is_empty()).then_some(Value::Object(campaign)),
    }
}
fn preference_epoch(headers: &axum::http::HeaderMap) -> String {
    headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            v.split(';')
                .find_map(|part| part.trim().strip_prefix("orbit_analytics_epoch="))
        })
        .unwrap_or_default()
        .to_owned()
}
fn read(headers: &axum::http::HeaderMap, key: &str, now: i64) -> Option<Journey> {
    let cookie = headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|p| p.trim().strip_prefix(&format!("{COOKIE}=")))?;
    if cookie.len() > 6000 {
        return None;
    }
    let (body, signature) = cookie.split_once('.')?;
    let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).ok()?;
    mac.update(body.as_bytes());
    mac.verify_slice(&URL_SAFE_NO_PAD.decode(signature).ok()?)
        .ok()?;
    let value: Journey = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(body).ok()?).ok()?;
    (value.epoch == preference_epoch(headers)
        && value.seen >= now - WINDOW
        && value.seen <= now + 300000)
        .then_some(value)
}
fn cookie(journey: &Journey, integration: &Integration) -> Option<String> {
    let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(journey).ok()?);
    let mut mac = Hmac::<Sha256>::new_from_slice(integration.token.as_bytes()).ok()?;
    mac.update(body.as_bytes());
    let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    let cookie = format!(
        "{COOKIE}={body}.{signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000{}",
        if integration.origin.starts_with("https:") {
            "; Secure"
        } else {
            ""
        }
    );
    (cookie.len() < 4096).then_some(cookie)
}
pub(super) async fn middleware(
    State(s): State<Arc<Integration>>,
    mut request: Request,
    next: Next,
) -> Response {
    let headers = request.headers().clone();
    let path = request.uri().path().to_owned();
    let document = request.method() == axum::http::Method::GET
        && headers
            .get(header::ACCEPT)
            .is_some_and(|v| v.to_str().unwrap_or_default().contains("text/html"));
    let logout = path == "/api/v1/session" && request.method() == axum::http::Method::DELETE;
    if logout {
        let mut response = next.run(request).await;
        if response.status().is_success() {
            response.headers_mut().append(
                header::SET_COOKIE,
                format!("{COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
                    .parse()
                    .unwrap(),
            );
        }
        return response;
    }
    let auth = matches!(
        path.as_str(),
        "/api/auth/login" | "/api/auth/entry" | "/api/auth/callback" | "/api/auth/enroll"
    );
    let disabled = super::blocked(&headers)
        || headers.get(header::COOKIE).is_some_and(|v| {
            v.to_str()
                .unwrap_or_default()
                .split(';')
                .any(|p| p.trim() == "orbit_analytics_disabled=true")
        });
    if disabled {
        let mut response = next.run(request).await;
        if headers.get(header::COOKIE).is_some_and(|v| {
            v.to_str()
                .unwrap_or_default()
                .split(';')
                .any(|p| p.trim().starts_with("orbit_attribution="))
        }) {
            response.headers_mut().append(
                header::SET_COOKIE,
                format!("{COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
                    .parse()
                    .unwrap(),
            );
        }
        return response;
    }
    if !document && !auth {
        return next.run(request).await;
    }
    let Ok(url) = reqwest::Url::parse(&format!(
        "{}{}",
        s.origin.trim_end_matches('/'),
        request.uri()
    )) else {
        return next.run(request).await;
    };
    let now = Utc::now().timestamp_millis();
    let mut current = source(&url, &headers, &s.routes, &s.config.handoff_origins);
    let mut old = read(&headers, &s.token, now);
    let page_key = hex::encode(Sha256::digest(url.path().as_bytes()));
    let auth_return = old.as_ref().and_then(|j| j.returned_page.as_ref()) == Some(&page_key);
    if document
        && current.campaign.is_some()
        && old.as_ref().is_some_and(|j| j.bound.is_some())
        && !auth_return
    {
        old = None;
    }

    // A fresh authentication must not reuse another authenticated person's
    // acquisition on a shared browser. A new anonymous landing remains eligible.
    if matches!(
        path.as_str(),
        "/api/auth/login" | "/api/auth/entry" | "/api/auth/callback"
    ) && old.as_ref().is_some_and(|j| j.bound.is_some())
    {
        old = None;
        if let Some(referrer) = headers
            .get(header::REFERER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| reqwest::Url::parse(v).ok())
            && referrer.origin() == url.origin()
            && !referrer.path().starts_with("/api/")
        {
            current = source(
                &referrer,
                &Default::default(),
                &s.routes,
                &s.config.handoff_origins,
            );
        }
    }
    let retained = old.as_ref().filter(|j| {
        DateTime::parse_from_rfc3339(&j.source.at)
            .is_ok_and(|at| at.timestamp_millis() >= now - WINDOW)
            && (j.source.campaign.is_some() || current.campaign.is_none())
    });
    let mut journey = Journey {
        visit_id: old
            .as_ref()
            .filter(|j| j.seen > now - 1800000)
            .map_or_else(uuid::Uuid::new_v4, |j| j.visit_id),
        visitor_id: old
            .as_ref()
            .map_or_else(uuid::Uuid::new_v4, |j| j.visitor_id),
        seen: now,
        source: retained.map_or(current.clone(), |j| j.source.clone()),
        bound: old.as_ref().and_then(|j| j.bound),
        epoch: preference_epoch(&headers),
        returned_page: old.as_ref().and_then(|j| j.returned_page.clone()),
    };
    let context = json!({"config": s.public(), "journey": journey});
    request
        .extensions_mut()
        .insert(orbit_application::ServerAttribution(context));
    let mut response = next.run(request).await;
    let rendered_document = document
        && response.status().is_success()
        && response
            .headers()
            .get(header::CONTENT_TYPE)
            .is_some_and(|v| v.to_str().unwrap_or_default().starts_with("text/html"));
    if !rendered_document
        && !(auth && (response.status().is_success() || response.status().is_redirection()))
    {
        return response;
    }
    if let Some(identity) = response
        .extensions()
        .get::<orbit_application::ServerAnalyticsIdentity>()
    {
        journey.bound = Some(identity.0.0);
        if path == "/api/auth/callback" {
            journey.returned_page = response
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| url.join(v).ok())
                .filter(|v| v.origin() == url.origin())
                .map(|v| hex::encode(Sha256::digest(v.path().as_bytes())));
        }
    }
    if rendered_document {
        journey.returned_page = None;
    }
    // The normal auth redirect carries only source metadata, not identities or
    // invite credentials. Accounts validates the registered redirect origin.
    if let Some(target) = response
        .headers()
        .get(header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| reqwest::Url::parse(v).ok())
        && s.oidc.as_ref().is_some_and(|rp| {
            target.origin().ascii_serialization()
                == reqwest::Url::parse(&rp.configuration().issuer)
                    .unwrap()
                    .origin()
                    .ascii_serialization()
        })
        && s.config
            .handoff_origins
            .contains_key(&target.origin().ascii_serialization())
        && target.path().ends_with("/oauth2/authorize")
    {
        let mut target = target;
        target.query_pairs_mut().append_pair(
            "analytics_context",
            &URL_SAFE_NO_PAD.encode(serde_json::to_vec(&journey.source).unwrap()),
        );
        if let Ok(value) = target.as_str().parse() {
            response.headers_mut().insert(header::LOCATION, value);
        }
    }
    if rendered_document {
        let id = uuid::Uuid::new_v4();
        let payload = json!({"event_id": id,"property_id":s.config.property_id,"name":"page_view","schema_version":1,"producer":"server","category":"navigation","occurred_at":Utc::now().to_rfc3339(),"clock":"server","visit_id":journey.visit_id,"visitor_id":journey.visitor_id,"context":{"environment":s.config.environment,"page":current.page,"route":current.route,"referrer":current.referrer},"campaign":current.campaign,"collection":{"profile":"identified","policy_version":s.config.policy_version,"consent":true,"sample_rate":1,"dropped_events":0},"properties":{}});
        match s.permits.try_acquire() {
            Ok(_permit) => {
                if !matches!(
                    tokio::time::timeout(
                        std::time::Duration::from_secs(1),
                        s.store.capture_page_analytics(id, payload)
                    )
                    .await,
                    Ok(Ok(()))
                ) {
                    eprintln!("analytics page capture unavailable");
                }
            }
            Err(_) => eprintln!("analytics page capture saturated"),
        }
    }
    if let Some(value) = cookie(&journey, &s).and_then(|v| v.parse().ok()) {
        response.headers_mut().append(header::SET_COOKIE, value);
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, "private, no-store".parse().unwrap());
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn page_labels_aggregate_without_losing_entity_or_unknown_paths() {
        let routes = vec![
            "/invite/:code".into(),
            "/alliances/:universe/:alliance".into(),
        ];
        for (raw, page, route) in [
            (
                "/invite/inv_fixture?secret=discard",
                "/invite/:code",
                "/invite/:code",
            ),
            (
                "/alliances/world/team",
                "/alliances/world/team",
                "/alliances/:universe/:alliance",
            ),
            (
                "/unlisted/path/?discard=1",
                "/unlisted/path/",
                "/unlisted/path/",
            ),
        ] {
            let actual = page_context(
                &reqwest::Url::parse(&format!("https://game.example{raw}")).unwrap(),
                &routes,
            );
            assert_eq!(
                actual,
                (
                    format!("https://game.example{page}"),
                    format!("https://game.example{route}")
                )
            );
        }
    }
    #[test]
    fn clean_invite_source_preserves_explicit_campaigns_and_strips_credentials() {
        let routes = vec!["/invite/:code".into()];
        let value = source(
            &reqwest::Url::parse("https://game.example/invite/inv_fixture").unwrap(),
            &Default::default(),
            &routes,
            &Default::default(),
        );
        assert_eq!(
            value.campaign,
            Some(json!({"utm_source":"invitation","utm_medium":"referral"}))
        );
        assert!(
            !serde_json::to_string(&value)
                .unwrap()
                .contains("inv_fixture")
        );
        let tagged = source(
            &reqwest::Url::parse(
                "https://game.example/invite/inv_fixture?utm_source=newsletter&private=discard",
            )
            .unwrap(),
            &Default::default(),
            &routes,
            &Default::default(),
        );
        assert_eq!(tagged.campaign, Some(json!({"utm_source":"newsletter"})));
    }
    #[test]
    fn server_cookie_rejects_tampering_expiry_and_changed_collection_choice() {
        let now = Utc::now().timestamp_millis();
        let journey = Journey {
            visit_id: uuid::Uuid::new_v4(),
            visitor_id: uuid::Uuid::new_v4(),
            seen: now,
            source: source(
                &reqwest::Url::parse("https://game.example/").unwrap(),
                &Default::default(),
                &[],
                &Default::default(),
            ),
            bound: None,
            epoch: String::new(),
            returned_page: None,
        };
        let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&journey).unwrap());
        let mut mac = Hmac::<Sha256>::new_from_slice(b"synthetic-signing-key").unwrap();
        mac.update(body.as_bytes());
        let raw = format!(
            "{COOKIE}={body}.{}",
            URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
        );
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(header::COOKIE, raw.parse().unwrap());
        assert_eq!(
            read(&headers, "synthetic-signing-key", now)
                .unwrap()
                .visit_id,
            journey.visit_id
        );
        assert!(read(&headers, "different-key", now).is_none());
        assert!(read(&headers, "synthetic-signing-key", now + WINDOW + 1).is_none());
        headers.insert(
            header::COOKIE,
            format!("{raw}; orbit_analytics_epoch=changed")
                .parse()
                .unwrap(),
        );
        assert!(read(&headers, "synthetic-signing-key", now).is_none());
    }
}
