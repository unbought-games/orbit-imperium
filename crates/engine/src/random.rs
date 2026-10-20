//! Private, explicit, restorable oi-hmac-sha256-stream-v1 byte protocol.
use crate::*;
use hmac::{Hmac, Mac};
use num_bigint::BigUint;
use num_traits::{One, ToPrimitive, Zero};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
fn mac(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut h = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts all key lengths");
    h.update(data);
    h.finalize().into_bytes().into()
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RandomStream {
    key: [u8; 32],
    block: u64,
    offset: u8,
}
impl RandomStream {
    pub fn new(
        secret: &[u8; 32],
        universe: UniverseId,
        epoch: Epoch,
        input: InputId,
        domain: &str,
    ) -> Result<Self, InvariantError> {
        if !matches!(
            domain,
            "battle"
                | "recovery"
                | "espionage"
                | "homeworld"
                | "colony"
                | "moon-create"
                | "moon-destroy"
                | "missile-target"
                | "expedition"
        ) {
            return Err(InvariantError("unregistered RNG domain".into()));
        }
        let mut pre = b"OI-RNG-v1\0".to_vec();
        pre.extend(universe.0.as_bytes());
        pre.extend(epoch.0.as_bytes());
        pre.extend(input.0.as_bytes());
        pre.extend((domain.len() as u16).to_be_bytes());
        pre.extend(domain.as_bytes());
        Ok(Self {
            key: mac(secret, &pre),
            block: 0,
            offset: 0,
        })
    }
    pub fn cursor(&self) -> (u64, u8) {
        (self.block, self.offset)
    }
    pub fn restore_cursor(&mut self, block: u64, offset: u8) -> Result<(), InvariantError> {
        if offset >= 32 {
            return Err(InvariantError("invalid RNG cursor".into()));
        }
        self.block = block;
        self.offset = offset;
        Ok(())
    }
    pub fn read_byte(&mut self) -> Result<u8, InvariantError> {
        if self.offset >= 32 {
            return Err(InvariantError("invalid RNG cursor".into()));
        }
        let mut pre = b"block\0".to_vec();
        pre.extend(self.block.to_be_bytes());
        let value = mac(&self.key, &pre)[usize::from(self.offset)];
        if self.offset == 31 {
            self.block = self
                .block
                .checked_add(1)
                .ok_or_else(|| InvariantError("RNG exhausted".into()))?;
            self.offset = 0;
        } else {
            self.offset += 1;
        }
        Ok(value)
    }
    pub fn uniform(&mut self, n: &BigUint) -> Result<BigUint, InvariantError> {
        if n.is_zero() || n.bits() > 256 {
            return Err(InvariantError("invalid RNG bound".into()));
        }
        if n.is_one() {
            return Ok(BigUint::zero());
        }
        let k = ((n - BigUint::one()).bits().div_ceil(8)) as usize;
        let range = BigUint::one() << (8 * k);
        let limit = &range / n * n;
        loop {
            let bytes = (0..k)
                .map(|_| self.read_byte())
                .collect::<Result<Vec<_>, _>>()?;
            let x = BigUint::from_bytes_be(&bytes);
            if x < limit {
                return Ok(x % n);
            }
        }
    }
    pub fn uniform_u64(&mut self, n: u64) -> Result<u64, InvariantError> {
        self.uniform(&BigUint::from(n))?
            .to_u64()
            .ok_or_else(|| InvariantError("RNG conversion".into()))
    }
    pub fn bernoulli(&mut self, a: &BigUint, b: &BigUint) -> Result<bool, InvariantError> {
        if b.is_zero() || a > b || b.bits() > 256 {
            return Err(InvariantError("invalid probability".into()));
        }
        if a.is_zero() {
            Ok(false)
        } else if a == b {
            Ok(true)
        } else {
            Ok(self.uniform(b)? < *a)
        }
    }
}
