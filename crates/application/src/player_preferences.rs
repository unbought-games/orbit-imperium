//! Player-authored UI defaults, scoped to a universe membership.
use crate::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlayerPreferences {
    pub galaxy_probe_count: String,
}
impl Default for PlayerPreferences {
    fn default() -> Self {
        Self {
            galaxy_probe_count: "1".into(),
        }
    }
}
impl PlayerPreferences {
    pub fn valid(&self) -> bool {
        let bytes = self.galaxy_probe_count.as_bytes();
        matches!(bytes.first(), Some(b'1'..=b'9')) && bytes.iter().all(u8::is_ascii_digit)
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlayerPreferencesRequest {
    pub context: QueryContext,
    /// Absent for reads; a complete authored preference for writes.
    pub preferences: Option<PlayerPreferences>,
}
#[derive(Serialize)]
pub struct PlayerPreferencesResponse {
    pub binding: Binding,
    pub request_id: uuid::Uuid,
    pub preferences: PlayerPreferences,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn probe_counts_are_positive_decimal_integers_without_an_inventory_cap() {
        assert_eq!(PlayerPreferences::default().galaxy_probe_count, "1");
        for count in [
            "1",
            "7",
            "9007199254740993",
            "999999999999999999999999999999999",
        ] {
            assert!(
                PlayerPreferences {
                    galaxy_probe_count: count.into()
                }
                .valid()
            );
        }
        for count in ["", "0", "-1", "1.5", "1e3", "+1", "01", " 2", "２"] {
            assert!(
                !PlayerPreferences {
                    galaxy_probe_count: count.into()
                }
                .valid()
            );
        }
    }
}
