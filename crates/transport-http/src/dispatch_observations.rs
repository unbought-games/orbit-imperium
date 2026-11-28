//! Private, bounded browser timings. Receipt and admission logs remain authoritative.
use super::*;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Batch {
    observations: Vec<Observation>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Observation {
    id: uuid::Uuid,
    phase: String,
    elapsed_ms: u32,
    foreground: bool,
}

impl Observation {
    fn valid(&self) -> bool {
        !self.id.is_nil()
            && self.elapsed_ms <= 86_400_000
            && matches!(
                self.phase.as_str(),
                "review_started_warm"
                    | "review_started_cold"
                    | "review_ready_reused"
                    | "review_ready_fetched"
                    | "send_started"
                    | "accepted"
                    | "outcome_received"
                    | "confirmed_visible"
                    | "rejected"
                    | "not_admitted"
                    | "uncertain"
            )
    }
}

impl Batch {
    fn valid(&self) -> bool {
        (1..=24).contains(&self.observations.len())
            && self.observations.iter().all(Observation::valid)
    }
}

pub(super) async fn collect<S: IdentityStore>(
    State(s): State<Arc<HttpState<S>>>,
    Path(universe): Path<uuid::Uuid>,
    headers: HeaderMap,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    ApiJson(batch): ApiJson<Batch>,
) -> Result<Response, Problem> {
    if headers.contains_key(header::AUTHORIZATION) {
        return Err(ServiceError::Forbidden.into());
    }
    let session = authenticate(&s, &headers, true).await?;
    let principal = bound_api::principal(&session, UniverseId(universe))?;
    if !batch.valid() {
        return Err(ServiceError::Malformed.into());
    }
    if let Err(retry) = s.dispatch_observation_budget.lock().await.admit(
        login_source(peer.map(|p| p.0.0)),
        &principal.account.to_string(),
        600,
        Instant::now(),
    ) {
        return Ok(rate_limited(retry));
    }
    for observation in batch.observations {
        orbit_application::orbit_log!(INFO, event = "dispatch_client_observation",
            universe = %universe, player = %principal.player, observation_id = %observation.id,
            phase = observation.phase.as_str(), elapsed_ms = observation.elapsed_ms,
            foreground = observation.foreground);
    }
    Ok(StatusCode::NO_CONTENT.into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_the_entire_batch_before_logging_any_client_fields() {
        let observation = serde_json::json!({"id": uuid::Uuid::new_v4(), "phase": "accepted", "elapsed_ms": 250, "foreground": true});
        let valid = |rows| {
            serde_json::from_value::<Batch>(serde_json::json!({"observations": rows}))
                .is_ok_and(|batch| batch.valid())
        };
        assert!(valid(vec![observation.clone(); 24]));
        assert!(!valid(vec![]));
        assert!(!valid(vec![observation.clone(); 25]));
        for (name, value) in [
            ("phase", serde_json::json!("private draft")),
            ("elapsed_ms", serde_json::json!(86400001)),
            ("id", serde_json::json!(uuid::Uuid::nil())),
            ("payload", serde_json::json!("unexpected")),
        ] {
            let mut invalid = observation.clone();
            invalid[name] = value;
            assert!(!valid(vec![observation.clone(), invalid]));
        }
    }
}
