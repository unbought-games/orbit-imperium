//! Explicit world edits reuse gameplay terms and authoritative asset lineage.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
mod assets;
mod document;
mod events;
mod queues;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorldAssetValue {
    pub category: String,
    pub item: String,
    pub level: Option<u32>,
    pub quantity: i64,
    pub unit_value_micro: i64,
    pub rules_hash: Hash,
}
pub type EditResult<T> = Result<T, String>;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorldEdit {
    pub op: String,
    #[serde(default)]
    pub returning: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colony: Option<GeneratedColony>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stock: Option<Resources>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub valuation: Option<Vec<WorldAssetValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub presence_age_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paid: Option<Resources>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paid_rules_hash: Option<Hash>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub planet: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub all_planets: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vacation: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arrives_in: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_in: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub travel_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(
        default,
        deserialize_with = "document::catalog_values",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub resources: BTreeMap<String, i64>,
    #[serde(
        default,
        deserialize_with = "document::catalog_values",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub buildings: BTreeMap<String, i64>,
    #[serde(
        default,
        deserialize_with = "document::catalog_values",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub research: BTreeMap<String, i64>,
    #[serde(
        default,
        deserialize_with = "document::catalog_values",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub ships: BTreeMap<String, i64>,
    #[serde(
        default,
        deserialize_with = "document::catalog_values",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub defenses: BTreeMap<String, i64>,
}
pub fn coordinates(value: &str) -> EditResult<Coordinates> {
    let parts = value
        .split(':')
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "planet must be galaxy:system:position")?;
    match parts.as_slice() {
        [g, s, p] if *g > 0 && *s > 0 && (1..=15).contains(p) => Ok(Coordinates {
            galaxy: *g,
            system: *s,
            position: *p,
        }),
        _ => Err(
            "planet must be galaxy:system:position (positive galaxy/system, position 1–15)".into(),
        ),
    }
}
pub fn coordinate_label(c: Coordinates) -> String {
    format!("{}:{}:{}", c.galaxy, c.system, c.position)
}
pub fn duration_ms(value: &str) -> EditResult<i64> {
    let split = value
        .find(|c: char| !c.is_ascii_digit())
        .ok_or("duration requires ms, s, m, h, or d")?;
    let (n, unit) = value.split_at(split);
    let scale = match unit.to_ascii_lowercase().as_str() {
        "ms" => 1,
        "s" => 1000,
        "m" => 60_000,
        "h" => 3_600_000,
        "d" => 86_400_000,
        _ => return Err("duration requires ms, s, m, h, or d".into()),
    };
    n.parse::<i64>()
        .ok()
        .and_then(|n| n.checked_mul(scale))
        .filter(|n| *n > 0 && *n <= MAX_WIRE_MS)
        .ok_or("duration outside supported range".into())
}
pub fn catalog_key<T: Copy + std::fmt::Debug>(
    name: &str,
    keys: impl IntoIterator<Item = T>,
) -> EditResult<T> {
    keys.into_iter()
        .find(|key| format!("{key:?}").eq_ignore_ascii_case(name))
        .ok_or_else(|| format!("unknown or unavailable catalog item: {name}"))
}
pub fn canonical_map<T: Copy + Ord + std::fmt::Debug>(
    values: &BTreeMap<String, i64>,
    keys: impl IntoIterator<Item = T>,
) -> EditResult<BTreeMap<T, i64>> {
    let keys: Vec<_> = keys.into_iter().collect();
    let mut out = BTreeMap::new();
    for (name, n) in values {
        if *n < 0 {
            return Err(format!("{name}: value must be nonnegative"));
        }
        let key = catalog_key(name, keys.iter().copied())?;
        if out.insert(key, *n).is_some() {
            return Err(format!("duplicate case-insensitive identifier: {name}"));
        }
    }
    Ok(out)
}
pub fn planet_id(s: &GameState, label: &str) -> EditResult<BodyId> {
    let c = coordinates(label)?;
    s.bodies
        .values()
        .find(|b| b.kind == BodyKind::Planet && b.coordinates == c)
        .map(|b| b.id)
        .ok_or_else(|| format!("planet {label} does not exist"))
}

pub fn edit_world(
    state: &GameState,
    rules: &Ruleset,
    input: &OrderedInput,
    edit: &WorldEdit,
    owner: Option<PlayerId>,
) -> EditResult<ChangeSet> {
    let mut next = state.clone();
    let mut change = ChangeSet::new(state, input, rules);
    let op = edit.op.to_ascii_lowercase();
    let ids = if matches!(op.as_str(), "add-planet" | "debris") {
        vec![]
    } else if let Some(label) = &edit.planet {
        let id = planet_id(state, label)?;
        if owner.is_some_and(|p| state.bodies[&id].owner != p) {
            return Err(format!(
                "planet {label} does not belong to the selected user"
            ));
        }
        vec![id]
    } else if edit.all_planets {
        let p = owner.ok_or("all_planets requires user")?;
        state
            .bodies
            .values()
            .filter(|b| b.owner == p)
            .map(|b| b.id)
            .collect()
    } else {
        vec![]
    };
    match op.as_str() {
        "set" | "give" => {
            if ids.is_empty()
                && (!edit.resources.is_empty()
                    || !edit.buildings.is_empty()
                    || !edit.ships.is_empty()
                    || !edit.defenses.is_empty()
                    || edit.name.is_some())
            {
                return Err(
                    "planet edits require coordinates or explicit all_planets with user".into(),
                );
            }
            for id in ids {
                assets::edit_body(&mut next, rules, input, edit, id, op == "give")?;
            }
            if !edit.research.is_empty() {
                assets::edit_research(
                    &mut next,
                    rules,
                    input,
                    edit,
                    owner.ok_or("research requires user")?,
                    op == "give",
                )?;
            }
            if edit.activity.is_some() || edit.vacation.is_some() {
                let p = owner.ok_or("player policy requires user")?;
                let policy = next
                    .world
                    .as_mut()
                    .ok_or("missing world")?
                    .records
                    .policies
                    .get_mut(&p)
                    .ok_or("missing player policy")?;
                if let Some(v) = edit.vacation {
                    policy.vacation = v
                }
                if let Some(a) = &edit.activity {
                    let age = match a.to_ascii_lowercase().as_str() {
                        "active" => 0,
                        "inactive" | "inactive7" => 8 * 86_400_000,
                        "inactive28" => 29 * 86_400_000,
                        _ => return Err("activity must be active, inactive7, or inactive28".into()),
                    };
                    policy.last_presence_at = input.at.saturating_sub(age).max(0);
                }
                policy.revision += 1;
            }
        }
        "attack" | "spy" | "transport" => return events::mission(state, rules, input, edit),
        "finish" | "clear" | "queue" => {
            return events::queues(state, rules, input, edit, &ids, owner);
        }
        "add-planet" => {
            return events::colony(
                state,
                rules,
                input,
                edit,
                owner.ok_or("add-planet requires user")?,
            );
        }
        "debris" => {
            let coord = coordinates(edit.planet.as_deref().ok_or("debris requires planet")?)?;
            if !rules
                .artifact
                .universe
                .as_ref()
                .ok_or("missing topology")?
                .contains(coord)
            {
                return Err("debris coordinates outside universe".into());
            }
            if let Some(old) = state
                .world
                .as_ref()
                .unwrap()
                .records
                .debris
                .values()
                .find(|f| f.coordinates == coord)
            {
                change
                    .cancelled_events
                    .push(ScheduledEvent::DebrisCleanupDue {
                        field: old.id,
                        generation: old.generation,
                    });
            }
            events::debris(&mut next, input, edit)?;
            let field = next
                .world
                .as_ref()
                .unwrap()
                .records
                .debris
                .values()
                .find(|f| f.coordinates == coord)
                .unwrap();
            change.events.push(NewEvent {
                id: InputId(derived_id(input.id, "debris-cleanup")),
                at: field.cleanup_at,
                event: ScheduledEvent::DebrisCleanupDue {
                    field: field.id,
                    generation: field.generation,
                },
            });
        }
        "report" => events::report(
            &mut next,
            rules,
            input,
            edit,
            owner.ok_or("report requires user")?,
        )?,
        _ => return Err(format!("unknown edit operation: {}", edit.op)),
    }
    if let Some(age) = edit.presence_age_ms {
        if age < 0 || age > input.at {
            return Err("presence age outside supported range".into());
        }
        let owner = owner.ok_or("presence age requires user")?;
        let policy = next
            .world
            .as_mut()
            .unwrap()
            .records
            .policies
            .get_mut(&owner)
            .ok_or("missing player")?;
        policy.last_presence_at = input.at - age;
        policy.revision += 1;
    }
    if let Some(values) = &edit.valuation {
        assets::restore_values(
            &mut next,
            rules,
            input,
            edit,
            owner.ok_or("valuation requires user")?,
            values,
        )?;
    }
    validate_asset_lineage(&next).map_err(|e| e.to_string())?;
    for body in next.bodies.values() {
        validate_body(&next, body.id, rules).map_err(|e| e.to_string())?;
        let used: u64 = body.levels.values().map(|n| u64::from(*n)).sum();
        if used > u64::from(body.fields) {
            return Err(format!(
                "{}: buildings use {used} fields, planet has {}",
                coordinate_label(body.coordinates),
                body.fields
            ));
        }
    }
    for (id, r) in &next.research {
        let count = next.bodies.values().filter(|b| b.owner == *id).count() as u64;
        if count > 1
            && !colony_capacity_available(
                r.levels
                    .get(&ResearchId::Astrophysics)
                    .copied()
                    .unwrap_or(0),
                count - 1,
            )
        {
            return Err("Astrophysics is too low for existing colonies".into());
        }
    }
    change.bodies = next
        .bodies
        .values()
        .filter(|b| state.bodies.get(&b.id) != Some(*b))
        .cloned()
        .collect();
    change.research = next
        .research
        .values()
        .filter(|r| state.research.get(&r.owner) != Some(*r))
        .cloned()
        .collect();
    change.inventories = next
        .inventories
        .iter()
        .filter(|n| !state.inventories.contains(n))
        .cloned()
        .collect();
    change.world = Some(WorldChanges {
        records: next.world.ok_or("missing world")?.records,
        score_deltas: vec![],
        audits: vec![serde_json::json!({"kind":"WorldEdit","operation":op})],
    });
    change.affected_viewers = state.players.keys().copied().collect::<BTreeSet<_>>();
    Ok(change)
}
