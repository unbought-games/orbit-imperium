//! Versioned machine participation contracts. Usage and eligibility are projections.
use crate::*;
use serde::{Deserialize, Serialize};
pub const BOT_DAY_MS: i64 = 86_400_000;
pub const BOT_REST_MS: i64 = 28_800_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlayerKind {
    #[default]
    Human,
    Bot,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BotPolicy {
    pub version: u32,
    pub enabled: bool,
    pub max_active: u32,
    #[serde(deserialize_with = "required_allowance")]
    pub action_units_per_24h: Option<u32>,
}
impl Default for BotPolicy {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: false,
            max_active: 0,
            action_units_per_24h: None,
        }
    }
}
impl BotPolicy {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("policy.bots.version must be 1".into());
        }
        if self.action_units_per_24h == Some(0)
            || (self.enabled && (self.max_active == 0 || self.action_units_per_24h.is_none()))
        {
            return Err("enabled bots require positive max_active and action_units_per_24h".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[error("{code}")]
pub struct BotDenial {
    pub code: BotDenialCode,
    pub next_eligible_at: Option<i64>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BotDenialCode {
    BotsDisabled,
    BotSleeping,
    BotBudgetExhausted,
    BotRetired,
    BotCapacityReached,
}
impl std::fmt::Display for BotDenialCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl BotDenialCode {
    pub fn denied(self, next_eligible_at: Option<i64>) -> StoreError {
        StoreError::BotDenied(BotDenial {
            code: self,
            next_eligible_at,
        })
    }
}
/// The most recent daily start and its exclusive end, including midnight wrap.
pub fn bot_sleep_interval(at: i64, start_minute: u16) -> (i64, i64) {
    let start = at - (at - i64::from(start_minute) * 60_000).rem_euclid(BOT_DAY_MS);
    (start, start + BOT_REST_MS)
}
pub fn bot_awake_at(at: i64, start_minute: u16) -> i64 {
    let (_, end) = bot_sleep_interval(at, start_minute);
    at.max(end)
}
pub fn parse_bot_sleep(value: &str) -> Result<u16, String> {
    let bytes = value.as_bytes();
    if bytes.len() != 5
        || bytes[2] != b':'
        || !bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 2 || b.is_ascii_digit())
    {
        return Err("sleep start must be HH:MM UTC".into());
    }
    let h: u16 = value[..2].parse().map_err(|_| "invalid hour")?;
    let m: u16 = value[3..].parse().map_err(|_| "invalid minute")?;
    if h >= 24 || m >= 60 {
        return Err("sleep start must be HH:MM UTC".into());
    }
    Ok(h * 60 + m)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BotStatus {
    pub binding: Binding,
    pub policy_revision: i64,
    pub policy: BotPolicy,
    pub state: String,
    pub retired_at: Option<i64>,
    pub retirement_reason: Option<String>,
    pub sleep_start_utc_minute: u16,
    pub sleep_start: i64,
    pub sleep_end: i64,
    pub allowance_used: u64,
    pub allowance_available: u64,
    pub next_eligible_at: Option<i64>,
}
/// Deterministic participation skeleton for receipt recovery. Storage resolves
/// its body inside admission; the client supplies only the gameplay envelope.
pub fn machine_action(gameplay: CommandEnvelopeV4) -> Result<ForegroundAction, ServiceError> {
    gameplay.domain()?;
    let mut bytes = *gameplay.command_id.0.as_bytes();
    bytes[0] ^= 0x80;
    let presence = CommandEnvelopeV4 {
        protocol: 4,
        binding: gameplay.binding,
        command_id: CommandId(uuid::Uuid::from_bytes(bytes)),
        command: crate::CommandDto3::Progression(Command::World {
            action: orbit_engine::WorldAction::RecordForegroundPresence {
                body: None,
                cause: orbit_engine::PresenceCause::GameplayGesture,
                paired_command_id: Some(gameplay.command_id),
            },
        }),
    };
    let pair = ForegroundAction { presence, gameplay };
    pair.validate()?;
    Ok(pair)
}

fn required_allowance<'de, D: serde::Deserializer<'de>>(de: D) -> Result<Option<u32>, D::Error> {
    Option::deserialize(de)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sleep_boundaries_and_midnight() {
        let start = 23 * 60;
        assert_eq!(bot_awake_at(23 * 3_600_000 - 1, start), 23 * 3_600_000 - 1);
        assert_eq!(bot_awake_at(23 * 3_600_000, start), 31 * 3_600_000);
        assert_eq!(bot_awake_at(BOT_DAY_MS, start), 31 * 3_600_000);
        assert_eq!(bot_awake_at(31 * 3_600_000, start), 31 * 3_600_000);
        assert_eq!(parse_bot_sleep("23:59"), Ok(1439));
        assert!(parse_bot_sleep("24:00").is_err());
        assert!(parse_bot_sleep("é:00").is_err());
    }
    #[test]
    fn policy_requires_explicit_budget() {
        let mut p = BotPolicy::default();
        assert!(p.validate().is_ok());
        p.enabled = true;
        assert!(p.validate().is_err());
        p.max_active = 2;
        assert!(p.validate().is_err());
        p.action_units_per_24h = Some(10);
        assert!(p.validate().is_ok());
        p.version = 2;
        assert!(p.validate().is_err());
    }
}
