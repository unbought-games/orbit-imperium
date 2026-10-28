use super::RulesUpgradeConflict;
use serde_json::Value;

/// An explicit owned field or keyed entry, never a whole-document merge.
pub(super) enum Location {
    Field(String),
    Entry {
        list: &'static str,
        keys: Vec<(&'static str, Value)>,
    },
}
impl Location {
    fn matches(&self, entry: &Value) -> bool {
        match self {
            Self::Entry { keys, .. } => keys
                .iter()
                .all(|(key, value)| entry.get(*key) == Some(value)),
            Self::Field(_) => false,
        }
    }
    fn read<'a>(&self, artifact: &'a Value) -> Option<&'a Value> {
        match self {
            Self::Field(path) => artifact.pointer(path),
            Self::Entry { list, .. } => artifact
                .pointer(list)?
                .as_array()?
                .iter()
                .find(|v| self.matches(v)),
        }
    }
    fn write(&self, artifact: &mut Value, value: Value) {
        match self {
            Self::Field(path) => {
                let (parent, key) = path.rsplit_once('/').expect("owned field has a parent");
                artifact
                    .pointer_mut(parent)
                    .and_then(Value::as_object_mut)
                    .expect("validated artifact has the owned field's parent")
                    .insert(key.into(), value);
            }
            Self::Entry { list, .. } => {
                let entries = artifact
                    .pointer_mut(list)
                    .and_then(Value::as_array_mut)
                    .expect("validated artifact has the owned collection");
                if let Some(entry) = entries.iter_mut().find(|v| self.matches(v)) {
                    *entry = value;
                } else {
                    entries.push(value);
                }
            }
        }
    }
    fn label(&self) -> String {
        match self {
            Self::Field(path) => path.clone(),
            Self::Entry { list, keys } => format!(
                "{list}[{}]",
                keys.iter()
                    .map(|(k, v)| format!("{k}={v}"))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
        }
    }
}

pub(super) struct Patch {
    pub location: Location,
    pub value: Value,
    pub previous: Option<Value>,
}
impl Patch {
    pub fn field(path: impl Into<String>, value: Value) -> Self {
        Self {
            location: Location::Field(path.into()),
            value,
            previous: None,
        }
    }
    pub fn entry(list: &'static str, key: &'static str, value: Value) -> Self {
        let identity = value[key].clone();
        Self {
            location: Location::Entry {
                list,
                keys: vec![(key, identity)],
            },
            value,
            previous: None,
        }
    }
    pub fn rapid_fire(value: Value) -> Self {
        Self {
            location: Location::Entry {
                list: "/world/combat/rapid_fire",
                keys: vec![
                    ("shooter", value["shooter"].clone()),
                    ("target", value["target"].clone()),
                ],
            },
            value,
            previous: None,
        }
    }
    pub fn with_previous(mut self, previous: Value) -> Self {
        self.previous = Some(previous);
        self
    }
    pub fn apply(&self, current: &mut Value, baseline: &Value) -> Result<(), RulesUpgradeConflict> {
        let before = self.location.read(current);
        if before == Some(&self.value) {
            return Ok(());
        }
        let older = self.location.read(baseline);
        if before.is_some() && before != older && before != self.previous.as_ref() {
            return Err(RulesUpgradeConflict {
                path: self.location.label(),
                current: before.cloned(),
                older_default: older.cloned(),
                release_value: self.value.clone(),
            });
        }
        self.location.write(current, self.value.clone());
        Ok(())
    }
}
