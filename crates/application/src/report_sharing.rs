use crate::*;
use orbit_engine::ReportId;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReportShareOptions {
    pub include_identity: bool,
    pub include_coordinates: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum ReportShareAction {
    Status,
    Create { options: ReportShareOptions },
    Revoke,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportShareRequest {
    pub context: QueryContext,
    pub action: ReportShareAction,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReportShareStatus {
    pub token: Option<uuid::Uuid>,
    pub options: Option<ReportShareOptions>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SharedReport {
    pub report: ReportId,
    pub observed_at: i64,
    pub options: ReportShareOptions,
    pub player_names: BTreeMap<String, String>,
    pub payload: Value,
}
impl<S: GameStore> GameService<S> {
    pub async fn report_share(
        &self,
        principal: Principal,
        report: ReportId,
        request: ReportShareRequest,
    ) -> Result<ReportShareStatus, ServiceError> {
        Self::principal(principal, request.context.binding)?;
        self.store
            .report_share(request.context.binding, report, request.action)
            .await
            .map_err(Into::into)
    }
    pub async fn shared_report(&self, token: uuid::Uuid) -> Result<SharedReport, ServiceError> {
        self.store.shared_report(token).await.map_err(Into::into)
    }
}

// Explicit recursive allowlist: never serialize the stored recipient document wholesale.
// Scalar leaves also reject objects/arrays, so future nested private data fails closed.
fn fields(source: &Value, keys: &[&str]) -> Value {
    Value::Object(
        keys.iter()
            .filter_map(|key| {
                source
                    .get(*key)
                    .filter(|v| !v.is_object() && !v.is_array())
                    .map(|v| ((*key).into(), v.clone()))
            })
            .collect(),
    )
}
fn array(source: &Value, project: fn(&Value) -> Value) -> Value {
    Value::Array(
        source
            .as_array()
            .into_iter()
            .flatten()
            .map(project)
            .collect(),
    )
}
fn resources(v: &Value) -> Value {
    fields(v, &["metal", "crystal", "deuterium"])
}
fn coordinates(v: &Value) -> Value {
    fields(v, &["galaxy", "system", "position"])
}
fn unit(v: &Value) -> Value {
    let mut out = fields(v, &["count", "ship_type"]);
    if v.get("item").is_some() {
        out["item"] = fields(&v["item"], &["kind", "id"]);
    }
    out
}
fn participant(v: &Value) -> Value {
    let mut out = fields(
        v,
        &[
            "owner",
            "side",
            "shots",
            "raw_attack_ticks",
            "shield_removed_ticks",
            "hull_removed_ticks",
            "explosions",
        ],
    );
    out["origin"] = fields(&v["origin"], &["Fleet", "Stationed"]);
    if v.get("units").is_some() {
        out["units"] = array(&v["units"], unit);
    }
    if let Some(technology) = v["technology"].as_array() {
        out["technology"] = Value::Array(
            technology
                .iter()
                .take(3)
                .filter(|v| v.is_u64())
                .cloned()
                .collect(),
        );
    }
    out
}
fn round(v: &Value) -> Value {
    let mut out = fields(
        v,
        &[
            "number",
            "shots",
            "raw_attack_ticks",
            "shield_removed_ticks",
            "hull_removed_ticks",
            "explosions",
        ],
    );
    for key in ["start", "end", "fire"] {
        if v.get(key).is_some() {
            out[key] = array(&v[key], participant);
        }
    }
    out
}
fn observed(v: &Value, project: fn(&Value) -> Value) -> Value {
    if v["visibility"] == "Known" {
        json!({"visibility":"Known", "value":project(&v["value"])})
    } else {
        json!({"visibility":"Unknown"})
    }
}
fn units(v: &Value) -> Value {
    array(v, unit)
}
fn buildings(v: &Value) -> Value {
    fields(v, &BUILDINGS)
}
fn research(v: &Value) -> Value {
    fields(v, &RESEARCH)
}

pub fn shareable_report(payload: &Value) -> bool {
    matches!(
        payload["kind"].as_str(),
        Some("Combat" | "ContactLost" | "Espionage")
    )
}

pub fn project_shared_report(
    report: ReportId,
    observed_at: i64,
    source: &Value,
    names: &PublicPlayerNames,
    options: ReportShareOptions,
) -> Result<SharedReport, StoreError> {
    let kind = source["kind"].as_str().ok_or(StoreError::CorruptData)?;
    let mut payload = fields(source, &["kind", "at", "observed_at"]);
    match kind {
        "Combat" => {
            for key in ["outcome", "mission", "target_kind"] {
                if let Some(value) = fields(source, &[key]).get(key) {
                    payload[key] = value.clone();
                }
            }
            for key in [
                "participants",
                "survivors",
                "gross_losses",
                "recovered",
                "permanent_losses",
            ] {
                if source.get(key).is_some() {
                    payload[key] = array(&source[key], participant);
                }
            }
            payload["rounds"] = array(&source["rounds"], round);
            for key in ["debris", "loot", "own_cargo_loss"] {
                if source.get(key).is_some() {
                    payload[key] = resources(&source[key]);
                }
            }
            if options.include_identity {
                payload["target_name"] = fields(source, &["target_name"])["target_name"].clone();
            }
        }
        "ContactLost" => {
            payload["own_lost_ships"] = units(&source["own_lost_ships"]);
            payload["own_cargo_loss"] = resources(&source["own_cargo_loss"]);
        }
        "Espionage" => {
            payload["target"] = fields(&source["target"], &["owner", "kind"]);
            if options.include_identity {
                payload["target"]["name"] = fields(&source["target"], &["name"])["name"].clone();
            }
            if options.include_coordinates {
                payload["target"]["coordinates"] = coordinates(&source["target"]["coordinates"]);
            }
            payload["resources"] = observed(&source["resources"], resources);
            payload["fleet"] = observed(&source["fleet"], units);
            payload["defenses"] = observed(&source["defenses"], units);
            payload["buildings"] = observed(&source["buildings"], buildings);
            payload["research"] = observed(&source["research"], research);
            payload["activity"] = fields(&source["activity"], &["type", "minutes"]);
            payload["counterespionage"] = fields(
                &source["counterespionage"],
                &["probability_ppm", "detected"],
            );
        }
        _ => return Err(StoreError::NotFound),
    }
    if kind != "Espionage" && options.include_coordinates {
        payload["target"] = coordinates(&source["target"]);
    }
    let mut ids = BTreeMap::new();
    let mut player_names = BTreeMap::new();
    localize(
        &mut payload,
        names,
        options.include_identity,
        &mut ids,
        &mut player_names,
    );
    Ok(SharedReport {
        report,
        observed_at,
        options,
        player_names,
        payload,
    })
}
fn localize(
    value: &mut Value,
    names: &PublicPlayerNames,
    include_identity: bool,
    ids: &mut BTreeMap<String, String>,
    labels: &mut BTreeMap<String, String>,
) {
    match value {
        Value::Object(object) => {
            for (key, value) in object {
                if matches!(key.as_str(), "owner" | "Fleet" | "Stationed") {
                    if let Some(original) = value.as_str() {
                        let next = format!("participant-{}", ids.len() + 1);
                        let local = ids.entry(original.to_owned()).or_insert(next).clone();
                        if key == "owner" {
                            let name = include_identity
                                .then(|| {
                                    uuid::Uuid::parse_str(original)
                                        .ok()
                                        .and_then(|id| names.get(&PlayerId(id)).cloned())
                                })
                                .flatten()
                                .unwrap_or_else(|| {
                                    format!("Player {}", local.trim_start_matches("participant-"))
                                });
                            labels.insert(local.clone(), name);
                        }
                        *value = json!(local);
                    }
                } else {
                    localize(value, names, include_identity, ids, labels);
                }
            }
        }
        Value::Array(values) => {
            for value in values {
                localize(value, names, include_identity, ids, labels);
            }
        }
        _ => {}
    }
}
const BUILDINGS: [&str; 18] = [
    "MetalMine",
    "CrystalMine",
    "DeuteriumSynthesizer",
    "SolarPlant",
    "MetalStorage",
    "CrystalStorage",
    "DeuteriumTank",
    "RoboticsFactory",
    "ResearchLab",
    "Shipyard",
    "FusionReactor",
    "NaniteFactory",
    "Terraformer",
    "MissileSilo",
    "AllianceDepot",
    "LunarBase",
    "SensorPhalanx",
    "JumpGate",
];
const RESEARCH: [&str; 16] = [
    "CombustionDrive",
    "ComputerTechnology",
    "EnergyTechnology",
    "EspionageTechnology",
    "WeaponsTechnology",
    "ShieldingTechnology",
    "ArmourTechnology",
    "LaserTechnology",
    "IonTechnology",
    "PlasmaTechnology",
    "HyperspaceTechnology",
    "ImpulseDrive",
    "HyperspaceDrive",
    "Astrophysics",
    "IntergalacticResearchNetwork",
    "GravitonTechnology",
];

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn publication_preserves_numbers_and_redacts_nested_private_fields_and_unknown_sections() {
        let mut source: Value = serde_json::from_str(include_str!(
            "../../../contracts/fixtures/espionage-expanded.json"
        ))
        .unwrap();
        source["private"] = json!("SECRET");
        source["target"]["private"] = json!("SECRET");
        source["resources"]["value"]["internal"] = json!("SECRET");
        source["fleet"] = json!({"visibility":"Unknown", "value":[{"private":"SECRET"}]});
        source["buildings"]["value"]["PrivateBuilding"] = json!(999);
        let names = PublicPlayerNames::from([(
            PlayerId(uuid::Uuid::parse_str(source["target"]["owner"].as_str().unwrap()).unwrap()),
            "Historical name".into(),
        )]);
        let report = project_shared_report(
            ReportId::default(),
            1000,
            &source,
            &names,
            ReportShareOptions::default(),
        )
        .unwrap();
        let serialized = serde_json::to_string(&report).unwrap();
        for private in [
            "SECRET",
            "PrivateBuilding",
            "Historical name",
            source["target"]["owner"].as_str().unwrap(),
            source["target"]["body"].as_str().unwrap(),
        ] {
            assert!(!serialized.contains(private), "leaked {private}");
        }
        assert_eq!(report.payload["fleet"], json!({"visibility":"Unknown"}));
        assert_eq!(
            report.payload["resources"]["value"]["metal"],
            source["resources"]["value"]["metal"]
        );
        assert!(report.payload["target"].get("coordinates").is_none());
        let report = project_shared_report(
            ReportId::default(),
            1000,
            &source,
            &names,
            ReportShareOptions {
                include_identity: true,
                include_coordinates: true,
            },
        )
        .unwrap();
        assert_eq!(
            report.payload["target"]["coordinates"],
            source["target"]["coordinates"]
        );
        assert!(report.player_names.values().any(|n| n == "Historical name"));
        assert_eq!(report.payload["fleet"], json!({"visibility":"Unknown"}));
    }
    #[test]
    fn combat_local_identifiers_join_counts_without_exposing_fleet_ids_or_return_time() {
        let owner = PlayerId(uuid::Uuid::from_u128(1));
        let fleet = uuid::Uuid::from_u128(2);
        let p = json!({"owner":owner,"origin":{"Fleet":fleet,"secret":"SECRET"},"side":"Attacker","technology":[1,2,3],"units":[{"item":{"kind":"Ship","id":"LightFighter","secret":"SECRET"},"count":"9007199254740991999","private":"SECRET"}]});
        let source = json!({"kind":"Combat","participants":[p.clone()],"survivors":[p.clone()],"rounds":[{"number":1,"start":[p.clone()],"end":[p.clone()],"fire":[p]}],"return_at":999999,"private":"SECRET","loot":{"metal":"9007199254740991999"}});
        let report = project_shared_report(
            ReportId::default(),
            1000,
            &source,
            &PublicPlayerNames::from([(owner, "Name then".into())]),
            ReportShareOptions {
                include_identity: true,
                include_coordinates: false,
            },
        )
        .unwrap();
        let text = serde_json::to_string(&report).unwrap();
        for private in [
            owner.to_string(),
            fleet.to_string(),
            "return_at".into(),
            "SECRET".into(),
        ] {
            assert!(!text.contains(&private));
        }
        assert_eq!(
            report.payload["participants"][0]["owner"],
            report.payload["survivors"][0]["owner"]
        );
        assert_eq!(
            report.payload["participants"][0]["origin"],
            report.payload["rounds"][0]["fire"][0]["origin"]
        );
        assert_eq!(
            report.payload["participants"][0]["units"][0]["count"],
            "9007199254740991999"
        );
        assert_eq!(report.payload["loot"]["metal"], "9007199254740991999");
    }
    #[test]
    fn contact_lost_never_gains_defender_facts_even_when_publishing_everything() {
        let source = json!({"kind":"ContactLost","at":1000,"target":{"galaxy":1,"system":2,"position":3,"owner":"SECRET"},"participants":[{"owner":"SECRET"}],"outcome":"SECRET","own_lost_ships":[{"ship_type":"SmallCargo","count":"2","owner":"SECRET"}],"own_cargo_loss":{"metal":"100"}});
        let report = project_shared_report(
            ReportId::default(),
            1000,
            &source,
            &Default::default(),
            ReportShareOptions {
                include_identity: true,
                include_coordinates: true,
            },
        )
        .unwrap();
        assert!(!serde_json::to_string(&report).unwrap().contains("SECRET"));
        assert!(report.payload.get("outcome").is_none());
        assert_eq!(report.payload["own_lost_ships"][0]["count"], "2");
        assert!(
            project_shared_report(
                ReportId::default(),
                0,
                &json!({"kind":"FutureKind"}),
                &Default::default(),
                Default::default()
            )
            .is_err()
        );
    }
}
