//! Admission uses the external command identity's wall-clock time. Internal input IDs,
//! entity IDs, execution claims and the logical ordering frontier have no expiry here.
use uuid::{Uuid, Variant, Version};

pub const COMMAND_WINDOW_MS: i64 = 15 * 60 * 1000;
pub const COMMAND_FUTURE_SKEW_MS: i64 = 30 * 1000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CommandIdentity {
    LegacyV4,
    V7 { issued_ms: i64 },
}

#[derive(Clone, Copy, Debug, thiserror::Error, PartialEq, Eq)]
pub enum CommandTimeError {
    #[error("submit a UUIDv7 command identity with an updated client")]
    Unsupported,
    #[error("command identity is ahead of server time")]
    Future,
    #[error("submission window expired; the original outcome is unknown")]
    Expired,
    #[error("no retained receipt for this expired identity")]
    HistoryExpired,
}

impl CommandIdentity {
    pub fn parse(id: Uuid) -> Result<Self, CommandTimeError> {
        if id.get_variant() != Variant::RFC4122 {
            return Err(CommandTimeError::Unsupported);
        }
        match id.get_version() {
            Some(Version::Random) => Ok(Self::LegacyV4),
            Some(Version::SortRand) => {
                let (sec, nanos) = id.get_timestamp().expect("UUIDv7 timestamp").to_unix();
                Ok(Self::V7 {
                    issued_ms: (sec * 1000 + u64::from(nanos / 1_000_000)) as i64,
                })
            }
            _ => Err(CommandTimeError::Unsupported),
        }
    }

    pub fn check(self, now_ms: i64, legacy_until_ms: i64) -> Result<(), CommandTimeError> {
        match self {
            Self::LegacyV4 if now_ms >= legacy_until_ms => Err(CommandTimeError::Unsupported),
            Self::V7 { issued_ms } if now_ms < issued_ms - COMMAND_FUTURE_SKEW_MS => {
                Err(CommandTimeError::Future)
            }
            Self::V7 { issued_ms } if now_ms >= issued_ms + COMMAND_WINDOW_MS => {
                Err(CommandTimeError::Expired)
            }
            _ => Ok(()),
        }
    }
}

/// Generate a command from the same wall clock as a test or native integration fixture.
#[cfg(feature = "test-support")]
pub fn command_id_at(at_ms: i64) -> Uuid {
    assert!((0..1_i64 << 48).contains(&at_ms));
    uuid::Builder::from_unix_timestamp_millis(at_ms as u64, &rand::random()).into_uuid()
}

/// The two roles share all time bits and have distinct entropy suffixes. For a
/// v4 bot's retained envelope keep the original transform and therefore its pair hash.
pub fn paired_presence_id(gameplay: Uuid) -> Uuid {
    let mut bytes = *gameplay.as_bytes();
    if gameplay.get_version() == Some(Version::SortRand) {
        bytes[15] ^= 1;
    } else {
        bytes[0] ^= 0x80;
    }
    Uuid::from_bytes(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acceptance_boundaries_and_domain_separation() {
        let id = Uuid::parse_str("0000000f-4240-7123-8123-123456789abc").unwrap();
        let identity = CommandIdentity::parse(id).unwrap();
        assert_eq!(
            identity,
            CommandIdentity::V7 {
                issued_ms: 1_000_000
            }
        );
        assert_eq!(identity.check(969_999, 0), Err(CommandTimeError::Future));
        assert_eq!(identity.check(970_000, 0), Ok(()));
        assert_eq!(identity.check(1_899_999, 0), Ok(()));
        assert_eq!(identity.check(1_900_000, 0), Err(CommandTimeError::Expired));
        let paired = paired_presence_id(id);
        assert_eq!(paired.to_string(), "0000000f-4240-7123-8123-123456789abd");
        assert_eq!(CommandIdentity::parse(paired), Ok(identity));
        let non_rfc = Uuid::parse_str("0000000f-4240-7123-0123-123456789abc").unwrap();
        for invalid in [Uuid::nil(), non_rfc] {
            assert_eq!(
                CommandIdentity::parse(invalid),
                Err(CommandTimeError::Unsupported)
            );
        }
        assert_eq!(CommandIdentity::LegacyV4.check(999, 1_000), Ok(()));
        assert_eq!(
            CommandIdentity::LegacyV4.check(1_000, 1_000),
            Err(CommandTimeError::Unsupported)
        );
    }
}
