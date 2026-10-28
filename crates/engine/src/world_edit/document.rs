use super::*;
use serde::de::{MapAccess, Visitor};
/// Reject duplicate spellings instead of allowing map decoding to silently overwrite.
pub(super) fn catalog_values<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<BTreeMap<String, i64>, D::Error> {
    struct Values;
    impl<'de> Visitor<'de> for Values {
        type Value = BTreeMap<String, i64>;
        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("case-insensitive catalog names mapped to nonnegative integers")
        }
        fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
            let mut values = BTreeMap::new();
            while let Some((key, value)) = map.next_entry::<String, i64>()? {
                if value < 0 {
                    return Err(serde::de::Error::custom(format!("{key}: negative amount")));
                }
                if values.insert(key.to_ascii_lowercase(), value).is_some() {
                    return Err(serde::de::Error::custom(format!(
                        "duplicate case-insensitive identifier {key}"
                    )));
                }
            }
            Ok(values)
        }
    }
    d.deserialize_map(Values)
}
impl WorldEdit {
    pub fn check_shape(&self) -> EditResult<()> {
        let op = self.op.to_ascii_lowercase();
        let fields: &[&str] = match op.as_str() {
            "set" | "give" => &[
                "user",
                "planet",
                "all_planets",
                "name",
                "resources",
                "buildings",
                "research",
                "ships",
                "defenses",
                "stock",
                "valuation",
                "activity",
                "vacation",
                "presence_age_ms",
            ],
            "add-player" | "add-bot" => &["user", "name", "password", "planet", "from", "preset"],
            "add-planet" => &["user", "planet", "name", "colony"],
            "attack" | "spy" | "transport" => &[
                "user",
                "planet",
                "from",
                "ships",
                "resources",
                "arrives_in",
                "returning",
                "travel_time",
                "valuation",
            ],
            "queue" => &[
                "user",
                "planet",
                "buildings",
                "research",
                "ships",
                "defenses",
                "arrives_in",
                "paid",
                "paid_rules_hash",
                "first_in",
            ],
            "finish" | "clear" => &["user", "planet", "all_planets"],
            "message" => &["user", "from", "text"],
            "report" => &["user", "kind", "resources", "payload"],
            "debris" => &["planet", "resources"],
            "alliance" => &["user", "name", "text"],
            _ => return Err(format!("unknown operation {}", self.op)),
        };
        let value = serde_json::to_value(self).map_err(|e| e.to_string())?;
        for (key, value) in value.as_object().unwrap() {
            if key != "op"
                && value != &serde_json::Value::Bool(false)
                && !fields.contains(&key.as_str())
            {
                return Err(format!("{key} is not supported by {op}"));
            }
        }
        if self.all_planets && (self.planet.is_some() || self.user.is_none()) {
            return Err("all_planets requires user and cannot be combined with planet".into());
        }
        if let Some(p) = &self.planet {
            coordinates(p)?;
        }
        if let Some(t) = &self.arrives_in {
            duration_ms(t)?;
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mixed_case_maps_and_duplicates() {
        let e: WorldEdit =
            serde_json::from_str(r#"{"op":"SET","planet":"1:50:8","ships":{"cRuIsEr":10}}"#)
                .unwrap();
        assert_eq!(e.ships["cruiser"], 10);
        assert!(e.check_shape().is_ok());
        for text in [
            r#"{"op":"set","ships":{"Cruiser":1,"cruiser":2}}"#,
            r#"{"op":"set","ships":{"cruiser":1,"cruiser":2}}"#,
        ] {
            assert!(serde_json::from_str::<WorldEdit>(text).is_err())
        }
    }
    #[test]
    fn wrong_fields_and_ambiguous_targets_fail() {
        for text in [
            r#"{"op":"message","user":"bob","ships":{"cruiser":1}}"#,
            r#"{"op":"set","planet":"home"}"#,
            r#"{"op":"set","all_planets":true}"#,
            r#"{"op":"set","user":"bob","planet":"1:50:8","all_planets":true}"#,
        ] {
            assert!(
                serde_json::from_str::<WorldEdit>(text)
                    .unwrap()
                    .check_shape()
                    .is_err()
            )
        }
    }
}
