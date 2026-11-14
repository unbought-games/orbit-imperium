//! Release-owned additions in dependency order. Sources are the reviewed content files.
use super::patch::Patch;
use serde_json::{Value, json};

fn read(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).expect("bundled content is tested JSON")
}
fn catalog(kind: &str, id: &str, mobile: bool, requirements: Value) -> Patch {
    let previous = json!({
        "key": {"kind":kind,"id":id}, "body_kinds":["Planet"],
        "enabled":true,"mobile":mobile,"requirements":requirements,
    });
    let mut current = previous.clone();
    if matches!(kind, "Ship" | "Defense")
        || (kind == "Building" && matches!(id, "RoboticsFactory" | "Shipyard"))
    {
        current["body_kinds"] = json!(["Planet", "Moon"]);
    }
    Patch::entry("/catalog", "key", current).with_previous(previous)
}
fn research(out: &mut Vec<Patch>, id: &str, definition: Value, requirements: Value) {
    out.push(Patch::field(
        format!("/progression/research/{id}"),
        definition,
    ));
    out.push(catalog("Research", id, false, requirements));
}
fn unit(out: &mut Vec<Patch>, kind: &str, id: &str, content: &Value) {
    let mobile = kind == "Ship" && id != "SolarSatellite";
    out.push(catalog(kind, id, mobile, content["requirements"].clone()));
    if let Some(ship) = content.get("ship") {
        let mut current = ship.clone();
        let mut patch = Patch::field(format!("/ships/{id}"), current.clone());
        // Recognize the exact released Impulse-only profile without overwriting custom ships.
        if id == "Bomber" {
            let drive = read(include_bytes!(
                "../../../../rules/content/hyperspace-drive.json"
            ));
            current["hyperspace_drive"] = drive["bomber"].clone();
            patch = Patch::field(format!("/ships/{id}"), current).with_previous(ship.clone());
        }
        out.push(patch);
    }
    out.push(Patch::entry(
        "/progression/unit_costs",
        "item",
        json!({
            "item":{"kind":kind,"id":id},"cost":content["cost"],
        }),
    ));
    out.push(Patch::entry(
        "/world/combat/units",
        "item",
        content["combat"].clone(),
    ));
    if let Some(rapid) = content.get("rapid_fire") {
        match rapid {
            Value::Array(entries) => out.extend(entries.iter().cloned().map(Patch::rapid_fire)),
            value => out.push(Patch::rapid_fire(value.clone())),
        }
    }
}

pub(super) fn patches() -> Vec<Patch> {
    let mut out = Vec::new();
    out.push(Patch::field("/world/moons", json!(true)));
    // Base facilities and units predate the release content files. Reuse their
    // exact released prerequisites; do not infer them from customized live rules.
    let baseline = read(include_bytes!("../../../../rules/mvp-v1-slice-5.json"));
    for entry in baseline["catalog"].as_array().expect("catalog array") {
        let kind = entry["key"]["kind"].as_str().expect("catalog kind");
        let id = entry["key"]["id"].as_str().expect("catalog id");
        if entry["enabled"] == true
            && (matches!(kind, "Ship" | "Defense")
                || (kind == "Building" && matches!(id, "RoboticsFactory" | "Shipyard")))
        {
            out.push(catalog(
                kind,
                id,
                entry["mobile"] == true,
                entry["requirements"].clone(),
            ));
        }
    }
    let lunar_base = read(include_bytes!("../../../../rules/content/lunar-base.json"));
    out.push(Patch::field(
        "/buildings/LunarBase",
        lunar_base["building"].clone(),
    ));
    out.push(
        Patch::entry(
            "/catalog",
            "key",
            json!({
                "key":{"kind":"Building","id":"LunarBase"}, "body_kinds":["Moon"],
                "enabled":true, "mobile":false, "requirements":lunar_base["requirements"]
            }),
        )
        .with_previous(json!({
            "key":{"kind":"Building","id":"LunarBase"}, "body_kinds":["Moon"],
            "enabled":false, "mobile":false, "requirements":[]
        })),
    );
    let phalanx = read(include_bytes!(
        "../../../../rules/content/sensor-phalanx.json"
    ));
    out.push(Patch::field("/world/phalanx", json!("sensor-phalanx-v1")));
    out.push(Patch::field(
        "/buildings/SensorPhalanx",
        phalanx["building"].clone(),
    ));
    out.push(
        Patch::entry(
            "/catalog",
            "key",
            json!({
                "key":{"kind":"Building","id":"SensorPhalanx"}, "body_kinds":["Moon"],
                "enabled":true,"mobile":false,"requirements":phalanx["requirements"]
            }),
        )
        .with_previous(json!({
            "key":{"kind":"Building","id":"SensorPhalanx"}, "body_kinds":["Moon"],
            "enabled":false,"mobile":false,"requirements":[]
        })),
    );
    let gate = read(include_bytes!("../../../../rules/content/jump-gate.json"));
    out.push(Patch::field("/world/jump_gates", json!("jump-gates-v1")));
    out.push(Patch::field(
        "/buildings/JumpGate",
        gate["building"].clone(),
    ));
    out.push(
        Patch::entry(
            "/catalog",
            "key",
            json!({
                "key":{"kind":"Building","id":"JumpGate"}, "body_kinds":["Moon"],
                "enabled":true,"mobile":false,"requirements":gate["requirements"]
            }),
        )
        .with_previous(json!({
            "key":{"kind":"Building","id":"JumpGate"}, "body_kinds":["Moon"],
            "enabled":false,"mobile":false,"requirements":[]
        })),
    );

    // Earlier released content is included so the original signup baseline can upgrade too.
    let impulse = read(include_bytes!(
        "../../../../rules/content/impulse-drive.json"
    ));
    research(
        &mut out,
        "ImpulseDrive",
        impulse["research"].clone(),
        impulse["requirements"].clone(),
    );
    out.push(Patch::field(
        "/ships/SmallCargo/impulse_drive",
        impulse["small_cargo"].clone(),
    ));
    let astro = read(include_bytes!(
        "../../../../rules/content/astrophysics.json"
    ));
    research(
        &mut out,
        "Astrophysics",
        astro["research"].clone(),
        astro["requirements"].clone(),
    );
    let colony = read(include_bytes!(
        "../../../../rules/content/colonization.json"
    ));
    unit(&mut out, "Ship", "ColonyShip", &colony);
    out.push(Patch::field(
        "/world/colonization",
        colony["colonization"].clone(),
    ));

    // v0.3.0 additions.
    unit(
        &mut out,
        "Ship",
        "HeavyFighter",
        &read(include_bytes!(
            "../../../../rules/content/heavy-fighter.json"
        )),
    );
    let laser = read(include_bytes!("../../../../rules/content/light-laser.json"));
    research(
        &mut out,
        "LaserTechnology",
        laser["research"]["definition"].clone(),
        laser["research"]["requirements"].clone(),
    );
    unit(&mut out, "Defense", "LightLaser", &laser["defense"]);
    let ion = read(include_bytes!(
        "../../../../rules/content/ion-technology.json"
    ));
    research(
        &mut out,
        "IonTechnology",
        ion["research"].clone(),
        ion["requirements"].clone(),
    );
    unit(
        &mut out,
        "Ship",
        "Cruiser",
        &read(include_bytes!("../../../../rules/content/cruiser.json")),
    );
    unit(
        &mut out,
        "Defense",
        "IonCannon",
        &read(include_bytes!("../../../../rules/content/ion-cannon.json")),
    );

    // v0.4.0 additions. No template world replaces the live artifact.
    unit(
        &mut out,
        "Ship",
        "LargeCargo",
        &read(include_bytes!("../../../../rules/content/large-cargo.json")),
    );
    let satellite = read(include_bytes!(
        "../../../../rules/content/solar-satellite.json"
    ));
    unit(&mut out, "Ship", "SolarSatellite", &satellite);
    out.push(Patch::field(
        "/progression/solar_satellite",
        satellite["energy"].clone(),
    ));
    unit(
        &mut out,
        "Defense",
        "HeavyLaser",
        &read(include_bytes!("../../../../rules/content/heavy-laser.json")),
    );
    unit(
        &mut out,
        "Defense",
        "GaussCannon",
        &read(include_bytes!(
            "../../../../rules/content/gauss-cannon.json"
        )),
    );
    let plasma = read(include_bytes!(
        "../../../../rules/content/plasma-technology.json"
    ));
    research(
        &mut out,
        "PlasmaTechnology",
        plasma["research"].clone(),
        plasma["requirements"].clone(),
    );
    // Next content bundle: existing worlds opt in through rules upgrade.
    let hyperspace = read(include_bytes!(
        "../../../../rules/content/hyperspace-technology.json"
    ));
    research(
        &mut out,
        "HyperspaceTechnology",
        hyperspace["research"].clone(),
        hyperspace["requirements"].clone(),
    );
    let network = read(include_bytes!(
        "../../../../rules/content/intergalactic-research-network.json"
    ));
    research(
        &mut out,
        "IntergalacticResearchNetwork",
        network["research"].clone(),
        network["requirements"].clone(),
    );
    let drive = read(include_bytes!(
        "../../../../rules/content/hyperspace-drive.json"
    ));
    research(
        &mut out,
        "HyperspaceDrive",
        drive["research"].clone(),
        drive["requirements"].clone(),
    );
    unit(
        &mut out,
        "Defense",
        "LargeShieldDome",
        &read(include_bytes!(
            "../../../../rules/content/large-shield-dome.json"
        )),
    );
    unit(
        &mut out,
        "Defense",
        "PlasmaTurret",
        &read(include_bytes!(
            "../../../../rules/content/plasma-turret.json"
        )),
    );
    // Only ships supported and enabled by this release. Future content is not activated.
    for id in [
        "SmallCargo",
        "LargeCargo",
        "LightFighter",
        "HeavyFighter",
        "Cruiser",
        "ColonyShip",
        "Recycler",
    ] {
        out.push(Patch::rapid_fire(json!({
            "shooter":{"kind":"Ship","id":id},
            "target":{"kind":"Ship","id":"SolarSatellite"},
            "factor":satellite["rapid_fire_from"][id],
        })));
    }
    unit(
        &mut out,
        "Ship",
        "Bomber",
        &read(include_bytes!("../../../../rules/content/bomber.json")),
    );
    unit(
        &mut out,
        "Ship",
        "Battleship",
        &read(include_bytes!("../../../../rules/content/battleship.json")),
    );
    unit(
        &mut out,
        "Ship",
        "Battlecruiser",
        &read(include_bytes!(
            "../../../../rules/content/battlecruiser.json"
        )),
    );
    unit(
        &mut out,
        "Ship",
        "Destroyer",
        &read(include_bytes!("../../../../rules/content/destroyer.json")),
    );
    let depot = read(include_bytes!(
        "../../../../rules/content/alliance-depot.json"
    ));
    out.push(Patch::field(
        "/buildings/AllianceDepot",
        depot["building"].clone(),
    ));
    out.push(catalog(
        "Building",
        "AllianceDepot",
        false,
        depot["requirements"].clone(),
    ));
    out.push(Patch::field("/world/holding", depot["holding"].clone()));
    let nanite = read(include_bytes!(
        "../../../../rules/content/nanite-factory.json"
    ));
    out.push(Patch::field(
        "/buildings/NaniteFactory",
        nanite["building"].clone(),
    ));
    out.push(catalog(
        "Building",
        "NaniteFactory",
        false,
        nanite["requirements"].clone(),
    ));
    let terraformer = read(include_bytes!("../../../../rules/content/terraformer.json"));
    out.push(Patch::field(
        "/buildings/Terraformer",
        terraformer["building"].clone(),
    ));
    out.push(catalog(
        "Building",
        "Terraformer",
        false,
        terraformer["requirements"].clone(),
    ));
    let fusion = read(include_bytes!(
        "../../../../rules/content/fusion-reactor.json"
    ));
    out.push(Patch::field(
        "/buildings/FusionReactor",
        fusion["building"].clone(),
    ));
    out.push(Patch::field(
        "/progression/fusion_reactor",
        fusion["production"].clone(),
    ));
    out.push(catalog(
        "Building",
        "FusionReactor",
        false,
        fusion["requirements"].clone(),
    ));
    let missiles = read(include_bytes!(
        "../../../../rules/content/missile-warfare.json"
    ));
    out.push(Patch::field(
        "/buildings/MissileSilo",
        missiles["building"].clone(),
    ));
    out.push(catalog(
        "Building",
        "MissileSilo",
        false,
        missiles["requirements"].clone(),
    ));
    out.push(Patch::field("/world/missiles", missiles["rules"].clone()));
    for id in ["AntiBallisticMissile", "InterplanetaryMissile"] {
        let entry = &missiles[id];
        out.push(catalog("Missile", id, false, entry["requirements"].clone()));
        out.push(Patch::entry(
            "/progression/unit_costs",
            "item",
            json!({"item":{"kind":"Missile","id":id},"cost":entry["cost"]}),
        ));
    }
    out.push(Patch::field(
        "/world/attack_groups",
        json!("oi-group-attack-v1"),
    ));
    out
}
