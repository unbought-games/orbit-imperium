//! Media ownership lives in PostgreSQL; bytes live behind the configured asset port.
use crate::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const ALLIANCE_MEDIA_MAX_BYTES: u64 = 20 * 1024 * 1024;
pub const ALLIANCE_MEDIA_MAX_TOTAL: u64 = 200 * 1024 * 1024;
pub const ALLIANCE_MEDIA_MAX_COUNT: usize = 50;

#[derive(Clone, Copy, Debug)]
pub struct AllianceMediaLimits {
    pub file_bytes: u64,
    pub total_bytes: u64,
    pub count: usize,
    pub uploads_enabled: bool,
}
impl Default for AllianceMediaLimits {
    fn default() -> Self {
        Self {
            file_bytes: ALLIANCE_MEDIA_MAX_BYTES,
            total_bytes: ALLIANCE_MEDIA_MAX_TOTAL,
            count: ALLIANCE_MEDIA_MAX_COUNT,
            uploads_enabled: true,
        }
    }
}
impl AllianceMediaLimits {
    pub fn parse(get: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let number = |key: &str, default: u64, max: u64| -> Result<u64, String> {
            let n = get(key)
                .map(|s| s.parse::<u64>())
                .transpose()
                .map_err(|_| format!("{key} must be an integer"))?
                .unwrap_or(default);
            if n == 0 || n > max {
                Err(format!("{key} must be between 1 and {max}"))
            } else {
                Ok(n)
            }
        };
        let uploads_enabled = match get("ORBIT_ALLIANCE_UPLOADS").as_deref() {
            None | Some("1") => true,
            Some("0") => false,
            _ => return Err("ORBIT_ALLIANCE_UPLOADS must be 0 or 1".into()),
        };
        let result = Self {
            file_bytes: number(
                "ORBIT_ALLIANCE_FILE_BYTES",
                ALLIANCE_MEDIA_MAX_BYTES,
                ALLIANCE_MEDIA_MAX_BYTES,
            )?,
            total_bytes: number(
                "ORBIT_ALLIANCE_STORAGE_BYTES",
                ALLIANCE_MEDIA_MAX_TOTAL,
                10 * 1024 * 1024 * 1024,
            )?,
            count: number(
                "ORBIT_ALLIANCE_IMAGE_COUNT",
                ALLIANCE_MEDIA_MAX_COUNT as u64,
                1000,
            )? as usize,
            uploads_enabled,
        };
        if result.total_bytes < result.file_bytes {
            return Err("Alliance storage budget must fit one image".into());
        }
        Ok(result)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MediaReceipt {
    pub sha256: String,
    pub content_type: String,
    pub bytes: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AllianceMedia {
    pub id: Uuid,
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub alliance: Uuid,
    pub filename: String,
    pub state: String,
    pub declared_bytes: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub receipt: Option<MediaReceipt>,
}
impl AllianceMedia {
    pub fn key(&self) -> String {
        format!(
            "alliance-media/v1/{}/{}/{}/{}/original",
            self.universe, self.epoch, self.alliance, self.id
        )
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum AllianceMediaAction {
    List,
    Begin {
        media_id: Uuid,
        filename: String,
        bytes: u64,
    },
    Delete {
        media_id: Uuid,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceMediaRequest {
    pub context: QueryContext,
    pub alliance: Uuid,
    pub action: AllianceMediaAction,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AllianceMediaLibrary {
    pub media: Vec<AllianceMedia>,
    pub max_file_bytes: u64,
    pub max_total_bytes: u64,
    pub max_count: usize,
}
/// Internal operations. Finalize is never deserialized from browser JSON.
pub enum MediaOperation {
    Configured {
        limits: AllianceMediaLimits,
        action: Box<MediaOperation>,
    },
    User(AllianceMediaAction),
    Authorize {
        media_id: Uuid,
    },
    Prepare {
        media_id: Uuid,
        receipt: MediaReceipt,
    },
    Finalize {
        media_id: Uuid,
        receipt: MediaReceipt,
    },
}
impl<S: GameStore> GameService<S> {
    pub async fn alliance_media(
        &self,
        principal: Principal,
        binding: Binding,
        alliance: Uuid,
        action: MediaOperation,
        limits: AllianceMediaLimits,
    ) -> Result<AllianceMediaLibrary, ServiceError> {
        Self::principal(principal, binding)?;
        self.store
            .alliance_media(
                binding,
                alliance,
                MediaOperation::Configured {
                    limits,
                    action: Box::new(action),
                },
            )
            .await
            .map_err(Into::into)
    }
    pub async fn alliance_media_read(
        &self,
        universe: UniverseId,
        id: Uuid,
        account: Option<AccountId>,
    ) -> Result<AllianceMedia, ServiceError> {
        self.store
            .alliance_media_read(universe, id, account)
            .await
            .map_err(Into::into)
    }
}
