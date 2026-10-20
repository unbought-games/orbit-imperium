//! Protocol-2 canonical public values, independent of the application adapter.
use crate::*;
use serde_json::{Value, json};
pub const MAX_WIRE_MS: i64 = 9_007_199_254_740_991;
pub fn deadline(at: Timestamp, duration: DurationMs) -> Result<Timestamp, GameError> {
    at.checked_add(duration)
        .filter(|v| at >= 0 && duration > 0 && *v <= MAX_WIRE_MS)
        .ok_or(GameError::NumericRange)
}
pub fn wire_resources(r: Resources) -> Value {
    json!({"metal":r.metal.to_string(),"crystal":r.crystal.to_string(),"deuterium":r.deuterium.to_string()})
}
pub fn canonical_request(request: &QuoteRequest) -> Value {
    match request {
        QuoteRequest::Fleet { .. }
        | QuoteRequest::Demolition { .. }
        | QuoteRequest::Research { .. }
        | QuoteRequest::Manufacture { .. } => {
            serde_json::to_value(request).expect("request serialization")
        }
        QuoteRequest::Upgrade { body, building } => {
            json!({"type":"Upgrade","body":body,"building":building})
        }
        QuoteRequest::Transport {
            origin,
            target,
            ships,
            cargo,
            speed_percent,
        } => {
            let mut ships = ships.clone();
            ships.sort_by_key(|s| (s.owner, s.ship_type));
            json!({"type":"Transport","origin":origin,"target":target,"ships":ships.iter().map(|s|json!({"owner":s.owner,"ship_type":s.ship_type,"count":s.count.to_string()})).collect::<Vec<_>>(),"cargo":wire_resources(*cargo),"speed_percent":speed_percent})
        }
    }
}
pub fn wire_terms(q: &Quote) -> Value {
    json!({"fuel":q.fuel.to_string(),"capacity":q.capacity.to_string(),"maximum_payload":q.maximum_payload.to_string(),"profile_hash":q.profile_hash,"cost":wire_resources(q.cost),"duration":q.duration,"target_level":q.target_level})
}
pub fn canonical_command(command: &Command) -> Value {
    match command {
        Command::World { .. }
        | Command::SetProduction { .. }
        | Command::StartDemolition { .. }
        | Command::StartResearch { .. }
        | Command::CancelResearch { .. }
        | Command::StartManufacture { .. } => {
            serde_json::to_value(command).expect("command serialization")
        }
        Command::StartUpgrade {
            body,
            building,
            expected_terms_hash,
        } => {
            json!({"type":"StartUpgrade","body":body,"building":building,"expected_terms_hash":expected_terms_hash})
        }
        Command::CancelConstruction { operation } => {
            json!({"type":"CancelConstruction","operation":operation})
        }
        Command::RecallFleet { fleet } => json!({"type":"RecallFleet","fleet":fleet}),
        Command::LaunchTransport {
            origin,
            target,
            ships,
            cargo,
            speed_percent,
            expected_terms_hash,
        } => {
            let mut v = canonical_request(&QuoteRequest::Transport {
                origin: *origin,
                target: *target,
                ships: ships.clone(),
                cargo: *cargo,
                speed_percent: *speed_percent,
            });
            v["type"] = json!("LaunchTransport");
            v["expected_terms_hash"] = json!(expected_terms_hash);
            v
        }
    }
}
