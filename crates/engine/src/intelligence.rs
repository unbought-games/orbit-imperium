//! Selected reconstructed detector: cap after multiplier, no endpoint draws.
use crate::*;
use num_bigint::BigUint;
use num_traits::{ToPrimitive, Zero};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Detection {
    pub probability_ppm: u32,
    pub detected: bool,
    pub multiplier: Option<u32>,
    pub detection_draw: Option<u32>,
    pub cursor: (u64, u8),
}
pub fn counterespionage_probability(
    arriving: i64,
    defending: i64,
    observer: u32,
    target: u32,
    multiplier: u32,
) -> Result<u32, InvariantError> {
    if arriving <= 0 || defending < 0 || multiplier > 1000000 {
        return Err(InvariantError("invalid detector input".into()));
    }
    if defending == 0 || multiplier == 0 {
        return Ok(0);
    }
    let c = BigUint::from(arriving as u64) * BigUint::from(defending as u64) * 2500u32 * multiplier;
    if c.bits() > 255 {
        return Err(InvariantError(
            "detector intermediate exceeds signed256".into(),
        ));
    }
    let delta = i64::from(target) - i64::from(observer);
    let p = if delta >= 0 {
        let threshold = BigUint::from(1_000_000_000_000u64);
        if c >= threshold || delta as u64 + c.bits() > threshold.bits() {
            return Ok(1000000);
        }
        (c << (delta as usize)) / 1000000u32
    } else {
        let x = c / 1000000u32;
        let shift = (-delta) as u64;
        if shift >= x.bits() {
            BigUint::zero()
        } else {
            x >> (shift as usize)
        }
    };
    Ok(p.min(BigUint::from(1000000u32))
        .to_u32()
        .expect("clamped ppm"))
}
pub fn detect_counterespionage(
    arriving: i64,
    defending: i64,
    observer: u32,
    target: u32,
    rng: &mut RandomStream,
) -> Result<Detection, InvariantError> {
    if arriving <= 0 || defending < 0 {
        return Err(InvariantError("invalid detector manifest".into()));
    }
    if defending == 0 {
        return Ok(Detection {
            probability_ppm: 0,
            detected: false,
            multiplier: None,
            detection_draw: None,
            cursor: rng.cursor(),
        });
    }
    let mut stream = rng.clone();
    let r = stream.uniform_u64(1000001)? as u32;
    let p = counterespionage_probability(arriving, defending, observer, target, r)?;
    let draw = if p == 0 || p == 1000000 {
        None
    } else {
        Some(stream.uniform_u64(1000000)? as u32)
    };
    let detected = p == 1000000 || draw.is_some_and(|u| u < p);
    *rng = stream;
    Ok(Detection {
        probability_ppm: p,
        detected,
        multiplier: Some(r),
        detection_draw: draw,
        cursor: rng.cursor(),
    })
}
pub fn espionage_disclosure_score(
    probes: i64,
    observer: u32,
    target: u32,
) -> Result<i128, InvariantError> {
    if probes <= 0 {
        return Err(InvariantError("no probes at espionage arrival".into()));
    }
    let d = i128::from(observer) - i128::from(target);
    Ok(i128::from(probes) + d.signum() * d * d)
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "visibility", content = "value")]
pub enum Known<T> {
    Unknown,
    Known(T),
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "visibility")]
pub enum IncomingShips {
    Unknown,
    Total {
        total: String,
    },
    Types {
        total: String,
        types: Vec<ShipType>,
    },
    Exact {
        total: String,
        ships: Vec<PublicShipStack>,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicShipStack {
    pub ship_type: ShipType,
    pub count: String,
}
pub fn incoming_ships(
    ships: &[ShipStack],
    viewer_espionage: u32,
) -> Result<IncomingShips, InvariantError> {
    let n = ships
        .iter()
        .try_fold(0i64, |a, s| {
            if s.count > 0 {
                a.checked_add(s.count)
            } else {
                None
            }
        })
        .ok_or_else(|| InvariantError("invalid incoming manifest".into()))?;
    let total = n.to_string();
    Ok(match viewer_espionage {
        0..=1 => IncomingShips::Unknown,
        2..=3 => IncomingShips::Total { total },
        4..=7 => IncomingShips::Types {
            total,
            types: ships.iter().map(|s| s.ship_type).collect(),
        },
        _ => IncomingShips::Exact {
            total,
            ships: ships
                .iter()
                .map(|s| PublicShipStack {
                    ship_type: s.ship_type,
                    count: s.count.to_string(),
                })
                .collect(),
        },
    })
}
