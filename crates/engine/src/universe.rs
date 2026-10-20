//! Versioned universe profiles and deterministic homeworld creation.
use crate::*;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
#[cfg(test)]
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UniverseProfile {
    pub id: String,
    pub galaxies: u32,
    pub systems_per_galaxy: u32,
    pub positions_per_system: u32,
    /// Fixed bootstrap size for legacy profiles; absent for online admission.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub players: Option<u32>,
    pub homeworld_policy: String,
}
impl UniverseProfile {
    pub fn validate(&self) -> Result<(), RulesError> {
        if !matches!(self.id.as_str(), "mvp-v1" | "signup-v2")
            || !matches!(
                self.homeworld_policy.as_str(),
                "oi-homeworld-frontier-v1" | "oi-homeworld-balanced-v2"
            )
        {
            return Err(RulesError::Unsupported);
        }
        let valid = match self.id.as_str() {
            "mvp-v1" => {
                self.galaxies == 1
                    && self.systems_per_galaxy == 5
                    && self.players == Some(5)
                    && self.homeworld_policy == "oi-homeworld-frontier-v1"
            }
            "signup-v2" => {
                (1..=100).contains(&self.galaxies)
                    && (1..=1000).contains(&self.systems_per_galaxy)
                    && self.players.is_none()
                    && self.homeworld_policy == "oi-homeworld-balanced-v2"
            }
            _ => false,
        };
        if !valid || self.positions_per_system != 15 {
            return Err(RulesError::Range);
        }
        Ok(())
    }
    pub fn signup(galaxies: u32, systems_per_galaxy: u32) -> Result<Self, RulesError> {
        let profile = Self {
            id: "signup-v2".into(),
            galaxies,
            systems_per_galaxy,
            positions_per_system: 15,
            players: None,
            homeworld_policy: "oi-homeworld-balanced-v2".into(),
        };
        profile.validate()?;
        Ok(profile)
    }
    /// Geometric homeworld capacity, independent of the operator's admission ceiling.
    pub fn homeworld_capacity(&self) -> Result<u32, RulesError> {
        self.validate()?;
        Ok(self.galaxies * self.systems_per_galaxy * 9)
    }
    pub fn contains(&self, c: Coordinates) -> bool {
        (1..=self.galaxies).contains(&c.galaxy)
            && (1..=self.systems_per_galaxy).contains(&c.system)
            && (1..=self.positions_per_system).contains(&c.position)
    }
}

/// Explicit startup overrides. Omission retains a saved world's dimensions.
#[derive(Clone, Copy, Debug, Default)]
pub struct UniverseOptions {
    pub galaxies: Option<u32>,
    pub systems_per_galaxy: Option<u32>,
    pub positions_per_system: Option<u32>,
}
impl UniverseOptions {
    pub fn validate(&self) -> Result<(), RulesError> {
        if self.galaxies.is_some_and(|n| !(1..=100).contains(&n))
            || self
                .systems_per_galaxy
                .is_some_and(|n| !(1..=1000).contains(&n))
            || self.positions_per_system.is_some_and(|n| n != 15)
        {
            return Err(RulesError::Range);
        }
        Ok(())
    }
    pub fn resolve(&self, saved: Option<&UniverseProfile>) -> Result<UniverseProfile, RulesError> {
        self.validate()?;
        if let Some(profile) = saved {
            profile.validate()?;
            if self.galaxies.is_some_and(|n| n != profile.galaxies)
                || self
                    .systems_per_galaxy
                    .is_some_and(|n| n != profile.systems_per_galaxy)
                || self
                    .positions_per_system
                    .is_some_and(|n| n != profile.positions_per_system)
            {
                return Err(RulesError::Range);
            }
            return Ok(profile.clone());
        }
        UniverseProfile::signup(
            self.galaxies.unwrap_or(1),
            self.systems_per_galaxy.unwrap_or(100),
        )
    }
}
pub fn parse_speed(text: &str) -> Result<i32, RulesError> {
    let speed: i32 = text.parse().map_err(|_| RulesError::Range)?;
    if !(1..=100).contains(&speed) || speed.to_string() != text {
        return Err(RulesError::Range);
    }
    Ok(speed)
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Homeworld {
    pub coordinates: Coordinates,
    pub diameter_km: u32,
    pub fields: u32,
    pub max_temperature: i32,
    pub rng_bytes: u64,
}
fn hmac(key: &[u8], bytes: &[u8]) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts every key length");
    mac.update(bytes);
    mac.finalize().into_bytes().into()
}
fn stream_key(
    secret: &[u8; 32],
    universe: UniverseId,
    epoch: Epoch,
    input: InputId,
    domain: &str,
) -> [u8; 32] {
    let mut bytes = b"OI-RNG-v1\0".to_vec();
    bytes.extend(universe.0.as_bytes());
    bytes.extend(epoch.0.as_bytes());
    bytes.extend(input.0.as_bytes());
    bytes.extend((domain.len() as u16).to_be_bytes());
    bytes.extend(domain.as_bytes());
    hmac(secret, &bytes)
}
struct Stream {
    key: [u8; 32],
    bytes: u64,
}
impl Stream {
    fn byte(&mut self) -> Result<u8, RulesError> {
        let mut preimage = b"block\0".to_vec();
        preimage.extend((self.bytes / 32).to_be_bytes());
        let value = hmac(&self.key, &preimage)[(self.bytes % 32) as usize];
        self.bytes = self.bytes.checked_add(1).ok_or(RulesError::Range)?;
        Ok(value)
    }
    // Admission uses n<=41. Wider colony/combat sampling is a later domain extension.
    fn uniform(&mut self, n: u16) -> Result<u16, RulesError> {
        if n == 0 || n > 256 {
            return Err(RulesError::Range);
        }
        if n == 1 {
            return Ok(0);
        }
        loop {
            let x = u16::from(self.byte()?);
            if x < 256 / n * n {
                return Ok(x % n);
            }
        }
    }
}
/// Five sequential admissions from the G06 cursor [1:1]; nine eligible slots suffice.
/// Each ordinal has its own stable InputId and homeworld stream, starting at byte zero.
pub fn mvp_homeworlds(
    secret: &[u8; 32],
    universe: UniverseId,
    epoch: Epoch,
) -> Result<Vec<Homeworld>, RulesError> {
    homeworlds(secret, universe, epoch, 5)
}

const HOMEWORLD_TEMPERATURE_LOWS: [i32; 15] = [
    220, 170, 120, 70, 60, 50, 40, 30, 20, 10, 0, -10, -50, -90, -130,
];
/// Complete Tmax envelope for the currently implemented admission positions 4..=12.
pub(crate) fn homeworld_temperature_bounds() -> (i32, i32) {
    let lows = &HOMEWORLD_TEMPERATURE_LOWS[3..12];
    (
        *lows.iter().min().expect("admission positions"),
        *lows.iter().max().expect("admission positions") + 40,
    )
}

/// Deterministic sequential admissions across the MVP frontier (nine slots/system).
pub fn homeworlds(
    secret: &[u8; 32],
    universe: UniverseId,
    epoch: Epoch,
    count: usize,
) -> Result<Vec<Homeworld>, RulesError> {
    if count > 45 {
        return Err(RulesError::Range);
    }
    let mut available: Vec<u32> = Vec::new();
    let mut worlds = Vec::new();
    for ordinal in 0..count {
        if ordinal % 9 == 0 {
            available = (4..=12).collect();
        }
        let input = InputId(derived_id(
            InputId(universe.0),
            &format!("mvp-homeworld-{ordinal}"),
        ));
        let mut rng = Stream {
            key: stream_key(secret, universe, epoch, input, "homeworld"),
            bytes: 0,
        };
        let index = usize::from(rng.uniform(available.len() as u16)?);
        let position = available.remove(index);
        let max_temperature =
            HOMEWORLD_TEMPERATURE_LOWS[(position - 1) as usize] + i32::from(rng.uniform(41)?);
        worlds.push(Homeworld {
            coordinates: Coordinates {
                galaxy: 1,
                system: (ordinal / 9 + 1) as u32,
                position,
            },
            diameter_km: 12800,
            fields: 163,
            max_temperature,
            rng_bytes: rng.bytes,
        });
    }
    Ok(worlds)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejection_sampling_consumes_rejected_bytes() {
        let mut stream = Stream {
            key: [1; 32],
            bytes: 0,
        };
        // Independently computed HMAC block starts 131,116: reject 131 for n=129.
        assert_eq!(stream.uniform(129).unwrap(), 116);
        assert_eq!(stream.bytes, 2);
    }
    #[test]
    fn approved_stream_key_and_block_vector() {
        let secret = std::array::from_fn(|i| i as u8);
        let key = stream_key(
            &secret,
            UniverseId(Uuid::from_u128(1)),
            Epoch(Uuid::from_u128(2)),
            InputId(Uuid::from_u128(3)),
            "colony",
        );
        assert_eq!(
            hex::encode(key),
            "ad427eed80232b6381aaeb11f632b4a15a1c340fb4810af05749afb397933814"
        );
        let mut stream = Stream { key, bytes: 0 };
        let block: Vec<_> = (0..32).map(|_| stream.byte().unwrap()).collect();
        assert_eq!(
            hex::encode(block),
            "df891d2ccbd45bc662c88f7632f2c064ca7f3833de30f167251301ee7b4e5537"
        );
        let before = stream.bytes;
        assert_eq!(stream.uniform(1).unwrap(), 0);
        assert_eq!(stream.bytes, before);
    }
}

mod placement;
pub use placement::*;
