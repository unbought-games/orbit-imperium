//! Release-owned additions in dependency order. Sources are the reviewed content files.
use super::patch::Patch;
use serde_json::{Value, json};

fn read(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).expect("bundled content is tested JSON")
}
fn catalog(kind: &str, id: &str, mobile: bool, requirements: Value) -> Patch {
    Patch::entry(
        "/catalog",
        "key",
        json!({
            "key": {"kind":kind,"id":id}, "body_kinds":["Planet"],
            "enabled":true,"mobile":mobile,"requirements":requirements,
        }),
    )
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
        out.push(Patch::field(format!("/ships/{id}"), ship.clone()));
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
    unit(
        &mut out,
        "Defense",
        "LargeShieldDome",
        &read(include_bytes!(
            "../../../../rules/content/large-shield-dome.json"
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
    out
}
