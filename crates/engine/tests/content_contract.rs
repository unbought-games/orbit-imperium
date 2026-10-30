use orbit_engine::{
    Building, DefenseId, GameError, MissileId, Mission, MissionLeg, ResearchId, ShipType,
};
use serde::{
    Deserialize,
    de::{self, Visitor},
};
use serde_json::Value;

// Ask Serde for its actual wire vocabulary, so adding a Rust variant without
// updating OpenAPI fails even when no bundled rules enable that variant yet.
struct Vocabulary<'a>(&'a mut Vec<&'static str>);
impl<'de> de::Deserializer<'de> for Vocabulary<'_> {
    type Error = de::value::Error;

    fn deserialize_enum<V: Visitor<'de>>(
        self,
        _: &'static str,
        variants: &'static [&'static str],
        _: V,
    ) -> Result<V::Value, Self::Error> {
        self.0.extend_from_slice(variants);
        Err(de::Error::custom("vocabulary only"))
    }

    fn deserialize_any<V: Visitor<'de>>(self, _: V) -> Result<V::Value, Self::Error> {
        Err(de::Error::custom("expected an enum"))
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 char str string bytes byte_buf
        option unit unit_struct newtype_struct seq tuple tuple_struct map struct
        identifier ignored_any
    }
}

fn assert_vocabulary<T: for<'de> Deserialize<'de> + serde::Serialize>(schema: &Value, name: &str) {
    let mut variants = Vec::new();
    assert!(T::deserialize(Vocabulary(&mut variants)).is_err());
    assert!(!variants.is_empty());
    // Read aliases are compatibility inputs, not additional public identities.
    // Canonicalize through actual serialization; every unique emitted ID must
    // still be present in the shared contract, including disabled content.
    let mut variants: Vec<String> = variants
        .into_iter()
        .map(|name| {
            let value: T = serde_json::from_value(serde_json::json!(name)).unwrap();
            serde_json::to_value(value)
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect();
    variants.sort_unstable();
    variants.dedup();
    let mut declared: Vec<_> = schema["components"]["schemas"][name]["enum"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    declared.sort_unstable();
    assert_eq!(
        variants, declared,
        "{name}: update the shared content vocabulary"
    );
}

#[test]
fn all_content_ids_match_the_client_contract_including_disabled_content() {
    let schema: Value =
        serde_json::from_slice(include_bytes!("../../../contracts/openapi.json")).unwrap();
    assert_vocabulary::<Building>(&schema, "BuildingId3");
    assert_vocabulary::<ResearchId>(&schema, "ResearchId3");
    assert_vocabulary::<ShipType>(&schema, "ShipId3");
    assert_vocabulary::<DefenseId>(&schema, "DefenseId3");
    assert_vocabulary::<MissileId>(&schema, "MissileId");
    assert_vocabulary::<Mission>(&schema, "Mission4");
    assert_vocabulary::<MissionLeg>(&schema, "MissionLeg4");
    assert_vocabulary::<GameError>(&schema, "GameError4");
}
