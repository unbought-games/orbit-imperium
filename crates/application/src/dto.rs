//! Wire quantities are canonical decimal strings. Domain records are never HTTP serializers.
use crate::*;
use orbit_engine::{Building, FleetId, OperationId, Resources, SCALE, ShipStack, ShipType};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShipRequestDto {
    pub owner: PlayerId,
    pub ship_type: ShipType,
    pub count: String,
}
pub(crate) fn quantity(value: &str) -> Result<i64, ServiceError> {
    if value.is_empty()
        || value.len() > 19
        || !value.bytes().all(|b| b.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return Err(ServiceError::Malformed);
    }
    value.parse().map_err(|_| ServiceError::Malformed)
}
fn cargo(value: ResourceDto) -> Result<Resources, ServiceError> {
    let r = Resources {
        metal: quantity(&value.metal)?,
        crystal: quantity(&value.crystal)?,
        deuterium: quantity(&value.deuterium)?,
    };
    if r.values().iter().any(|v| *v % SCALE != 0) {
        return Err(ServiceError::Malformed);
    }
    Ok(r)
}
fn speed(value: u32) -> Result<u32, ServiceError> {
    if !(10..=100).contains(&value) || !value.is_multiple_of(10) {
        return Err(ServiceError::Malformed);
    }
    Ok(value)
}
fn stacks(values: Vec<ShipRequestDto>) -> Result<Vec<ShipStack>, ServiceError> {
    if values.is_empty() || values.len() > 64 {
        return Err(ServiceError::Malformed);
    }
    let mut seen = std::collections::BTreeSet::new();
    values
        .into_iter()
        .map(|v| {
            let count = quantity(&v.count)?;
            if count == 0 || !seen.insert((v.owner, v.ship_type)) {
                return Err(ServiceError::Malformed);
            }
            Ok(ShipStack {
                owner: v.owner,
                ship_type: v.ship_type,
                count,
            })
        })
        .collect()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum QuoteRequestDto {
    Upgrade {
        body: BodyId,
        building: Building,
    },
    Transport {
        origin: BodyId,
        target: BodyId,
        ships: Vec<ShipRequestDto>,
        cargo: ResourceDto,
        speed_percent: u32,
    },
}
impl TryFrom<QuoteRequestDto> for QuoteRequest {
    type Error = ServiceError;
    fn try_from(value: QuoteRequestDto) -> Result<Self, Self::Error> {
        Ok(match value {
            QuoteRequestDto::Upgrade { body, building } => Self::Upgrade { body, building },
            QuoteRequestDto::Transport {
                origin,
                target,
                ships,
                cargo: payload,
                speed_percent,
            } => Self::Transport {
                origin,
                target,
                ships: stacks(ships)?,
                cargo: cargo(payload)?,
                speed_percent: speed(speed_percent)?,
            },
        })
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum CommandDto {
    StartUpgrade {
        body: BodyId,
        building: Building,
        expected_terms_hash: Hash,
    },
    CancelConstruction {
        operation: OperationId,
    },
    LaunchTransport {
        origin: BodyId,
        target: BodyId,
        ships: Vec<ShipRequestDto>,
        cargo: ResourceDto,
        speed_percent: u32,
        expected_terms_hash: Hash,
    },
    RecallFleet {
        fleet: FleetId,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandEnvelopeDto {
    pub command_id: CommandId,
    pub epoch: Epoch,
    pub protocol: i32,
    pub command: CommandDto,
}
impl TryFrom<CommandEnvelopeDto> for CommandEnvelope {
    type Error = ServiceError;
    fn try_from(value: CommandEnvelopeDto) -> Result<Self, Self::Error> {
        let command = match value.command {
            CommandDto::StartUpgrade {
                body,
                building,
                expected_terms_hash,
            } => Command::StartUpgrade {
                body,
                building,
                expected_terms_hash,
            },
            CommandDto::CancelConstruction { operation } => {
                Command::CancelConstruction { operation }
            }
            CommandDto::RecallFleet { fleet } => Command::RecallFleet { fleet },
            CommandDto::LaunchTransport {
                origin,
                target,
                ships,
                cargo: payload,
                speed_percent,
                expected_terms_hash,
            } => Command::LaunchTransport {
                origin,
                target,
                ships: stacks(ships)?,
                cargo: cargo(payload)?,
                speed_percent: speed(speed_percent)?,
                expected_terms_hash,
            },
        };
        if let Command::StartUpgrade {
            expected_terms_hash,
            ..
        }
        | Command::LaunchTransport {
            expected_terms_hash,
            ..
        } = &command
            && (expected_terms_hash.0.len() != 64
                || !expected_terms_hash
                    .0
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
        {
            return Err(ServiceError::Malformed);
        }
        Ok(Self {
            command_id: value.command_id,
            epoch: value.epoch,
            protocol: value.protocol,
            command,
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decimal_wire_rejects_ambiguous_or_inexact_quantities() {
        for bad in ["", "-1", "1.0", "01", "9223372036854775808", "1e6"] {
            assert!(quantity(bad).is_err())
        }
        assert_eq!(quantity("9007199254740993").unwrap(), 9_007_199_254_740_993);
        assert!(
            cargo(ResourceDto {
                metal: "1".into(),
                crystal: "0".into(),
                deuterium: "0".into()
            })
            .is_err()
        );
    }
}

#[cfg(test)]
mod v2_validation_tests {
    use super::*;
    #[test]
    fn transport_speed_enum_is_validated_before_quote_or_admission() {
        let body = BodyId(uuid::Uuid::from_u128(1));
        let player = PlayerId(uuid::Uuid::from_u128(2));
        for speed_percent in [0, 15, 101] {
            let ships = vec![ShipRequestDto {
                owner: player,
                ship_type: ShipType::SmallCargo,
                count: "1".into(),
            }];
            let cargo = ResourceDto {
                metal: "0".into(),
                crystal: "0".into(),
                deuterium: "0".into(),
            };
            let q = QuoteRequestDto::Transport {
                origin: body,
                target: BodyId(uuid::Uuid::from_u128(3)),
                ships: ships.clone(),
                cargo: cargo.clone(),
                speed_percent,
            };
            assert!(matches!(
                QuoteRequest::try_from(q),
                Err(ServiceError::Malformed)
            ));
            let e = CommandEnvelopeDto {
                protocol: 2,
                epoch: Epoch(uuid::Uuid::from_u128(4)),
                command_id: CommandId(uuid::Uuid::from_u128(5)),
                command: CommandDto::LaunchTransport {
                    origin: body,
                    target: BodyId(uuid::Uuid::from_u128(3)),
                    ships,
                    cargo,
                    speed_percent,
                    expected_terms_hash: Hash("a".repeat(64)),
                },
            };
            assert!(matches!(
                CommandEnvelope::try_from(e),
                Err(ServiceError::Malformed)
            ));
        }
    }
}
