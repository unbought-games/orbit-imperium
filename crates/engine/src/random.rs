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
    fn block_bytes(&self) -> [u8; 32] {
        let mut pre = [0; 14];
        pre[..6].copy_from_slice(b"block\0");
        pre[6..].copy_from_slice(&self.block.to_be_bytes());
        mac(&self.key, &pre)
    }
    pub fn read_byte(&mut self) -> Result<u8, InvariantError> {
        if self.offset >= 32 {
            return Err(InvariantError("invalid RNG cursor".into()));
        }
        let value = self.block_bytes()[usize::from(self.offset)];
        self.advance_byte()?;
        Ok(value)
    }
    fn advance_byte(&mut self) -> Result<(), InvariantError> {
        if self.offset == 31 {
            self.block = self
                .block
                .checked_add(1)
                .ok_or_else(|| InvariantError("RNG exhausted".into()))?;
            self.offset = 0;
        } else {
            self.offset += 1;
        }
        Ok(())
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

/// A battle consumes millions of small draws. Keep one HMAC block on the stack
/// for the duration of resolution. The stream cursor still counts consumed bytes.
pub(crate) struct BattleDraws<'a> {
    stream: &'a mut RandomStream,
    loaded: Option<u64>,
    bytes: [u8; 32],
}

impl<'a> BattleDraws<'a> {
    pub fn new(stream: &'a mut RandomStream) -> Self {
        Self {
            stream,
            loaded: None,
            bytes: [0; 32],
        }
    }

    pub fn uniform_u64(&mut self, n: u64) -> Result<u64, InvariantError> {
        if n == 0 {
            return Err(InvariantError("invalid RNG bound".into()));
        }
        if n == 1 {
            return Ok(0);
        }
        let count = (u64::BITS - (n - 1).leading_zeros()).div_ceil(8);
        let range = 1u128 << (count * 8);
        let limit = range - range % u128::from(n);
        loop {
            let mut value = 0u64;
            for _ in 0..count {
                if self.loaded != Some(self.stream.block) {
                    self.bytes = self.stream.block_bytes();
                    self.loaded = Some(self.stream.block);
                }
                let byte = self
                    .bytes
                    .get(usize::from(self.stream.offset))
                    .ok_or_else(|| InvariantError("invalid RNG cursor".into()))?;
                value = (value << 8) | u64::from(*byte);
                self.stream.advance_byte()?;
            }
            if u128::from(value) < limit {
                return Ok(value % n);
            }
        }
    }

    pub fn bernoulli(&mut self, a: u128, b: u128) -> Result<bool, InvariantError> {
        if let Ok(n) = u64::try_from(b)
            && a > 0
            && a < b
        {
            return Ok(u128::from(self.uniform_u64(n)?) < a);
        }
        self.stream.bernoulli(&BigUint::from(a), &BigUint::from(b))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn battle_draws_preserve_rejections_wide_probabilities_and_restored_cursors() {
        let id = uuid::Uuid::nil();
        let mut reference =
            RandomStream::new(&[42; 32], UniverseId(id), Epoch(id), InputId(id), "battle").unwrap();
        reference.restore_cursor(123, 31).unwrap();
        let mut stream = reference.clone();
        let mut fast = BattleDraws::new(&mut stream);
        for _ in 0..32 {
            for bound in [1, 2, 128, 129, 256, 257, 1250, 32769, u64::MAX] {
                assert_eq!(fast.uniform_u64(bound), reference.uniform_u64(bound));
                assert_eq!(fast.stream.cursor(), reference.cursor());
            }
            let denominator = 1u128 << 80;
            assert_eq!(
                fast.bernoulli(17, denominator),
                reference.bernoulli(&17u32.into(), &denominator.into())
            );
            assert_eq!(fast.stream.cursor(), reference.cursor());
        }
    }
}
