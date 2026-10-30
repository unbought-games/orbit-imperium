//! Immutable canonical JSON is the authority; `Deref` exposes only its derived interpretation.
use crate::{Hash, hash};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use std::ops::Deref;

/// Saved values cannot be edited under their existing identity.
///
/// ```compile_fail
/// use orbit_engine::Ruleset;
/// let mut rules = Ruleset::mvp_fleets().unwrap();
/// rules.artifact.base_income[0] += 1;
/// ```
///
/// ```compile_fail
/// use orbit_engine::{FleetTerms, Hash};
/// fn replace_identity(mut accepted: FleetTerms) {
///     accepted.terms_hash = Hash("stale".into());
/// }
/// ```
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Persisted<T> {
    original: Value,
    interpreted: T,
}
/// Closed, explicitly supported hash formats. No generic format/version fallback.
pub trait PersistedFormat: private::Sealed + Serialize + DeserializeOwned {
    fn verify_original(value: &Value) -> Result<(), String>;
    fn validate_interpretation(&self) -> Result<(), String> {
        Ok(())
    }
}
pub(crate) mod private {
    pub trait Sealed {}
}
impl<T> Deref for Persisted<T> {
    type Target = T;
    fn deref(&self) -> &T {
        &self.interpreted
    }
}
impl<T: PersistedFormat> Persisted<T> {
    pub(crate) fn from_new(interpreted: T) -> Self {
        let original = serde_json::to_value(&interpreted).expect("domain JSON");
        Self {
            original,
            interpreted,
        }
    }
}
impl<T> Serialize for Persisted<T> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.original.serialize(serializer)
    }
}
impl<'de, T: PersistedFormat> Deserialize<'de> for Persisted<T> {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let original = Value::deserialize(deserializer)?;
        T::verify_original(&original).map_err(serde::de::Error::custom)?;
        let interpreted: T =
            serde_json::from_value(original.clone()).map_err(serde::de::Error::custom)?;
        interpreted
            .validate_interpretation()
            .map_err(serde::de::Error::custom)?;
        Ok(Self {
            original,
            interpreted,
        })
    }
}

pub(crate) fn verify_terms(value: &Value, key: &str) -> Result<(), String> {
    let expected: Hash =
        serde_json::from_value(value["terms_hash"].clone()).map_err(|e| e.to_string())?;
    let mut material = value.clone();
    material["terms_hash"] = Value::String(String::new());
    let actual = hash(&serde_json::json!({"protocol":4,key:material}));
    if actual != expected {
        return Err("accepted terms hash mismatch".into());
    }
    Ok(())
}

/// Aliases in keyed maps must never overwrite another spelling of the same identity.
pub(crate) fn unique_map<'de, D, K, V>(
    deserializer: D,
) -> Result<std::collections::BTreeMap<K, V>, D::Error>
where
    D: serde::Deserializer<'de>,
    K: Deserialize<'de> + Ord,
    V: Deserialize<'de>,
{
    struct Visitor<K, V>(std::marker::PhantomData<(K, V)>);
    impl<'de, K: Deserialize<'de> + Ord, V: Deserialize<'de>> serde::de::Visitor<'de>
        for Visitor<K, V>
    {
        type Value = std::collections::BTreeMap<K, V>;
        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("unique identifier map")
        }
        fn visit_map<A: serde::de::MapAccess<'de>>(
            self,
            mut access: A,
        ) -> Result<Self::Value, A::Error> {
            let mut result = std::collections::BTreeMap::new();
            while let Some((key, value)) = access.next_entry()? {
                if result.insert(key, value).is_some() {
                    return Err(serde::de::Error::custom("duplicate logical identifier"));
                }
            }
            Ok(result)
        }
    }
    deserializer.deserialize_map(Visitor(std::marker::PhantomData))
}
