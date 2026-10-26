use crate::*;
pub use orbit_engine::alliances::{AllianceAction, AlliancePermission, AllianceRecruitment};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceIdentity {
    pub id: Uuid,
    pub universe: UniverseId,
    pub tag: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceScore {
    pub rank: u64,
    pub points: String,
    pub average_points: String,
    pub previous_rank: Option<u64>,
    pub baseline_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceSummary {
    pub id: Uuid,
    pub universe: UniverseId,
    pub tag: String,
    pub name: String,
    pub member_count: u64,
    pub recruitment: AllianceRecruitment,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ranking: Option<AllianceScore>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceRole {
    pub id: Uuid,
    pub name: String,
    pub permissions: Vec<AlliancePermission>,
    pub grantable_permissions: Vec<AlliancePermission>,
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceMember {
    pub player: PlayerId,
    pub username: String,
    pub joined_at: i64,
    pub roles: Vec<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceApplication {
    pub id: Uuid,
    pub alliance: Uuid,
    pub alliance_tag: String,
    pub player: PlayerId,
    pub username: String,
    pub text: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AlliancePost {
    pub id: Uuid,
    pub author: PlayerId,
    pub author_name: String,
    pub title: String,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceAudit {
    pub id: Uuid,
    pub actor: PlayerId,
    pub actor_name: String,
    pub action: String,
    pub at: i64,
    pub target: Option<Uuid>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceDetail {
    pub summary: AllianceSummary,
    pub public_text: String,
    pub revision: u64,
    pub leader: PlayerId,
    pub permissions: Vec<AlliancePermission>,
    pub grantable_permissions: Vec<AlliancePermission>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roles: Option<Vec<AllianceRole>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub members: Option<Vec<AllianceMember>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub applications: Option<Vec<AllianceApplication>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub posts: Option<Vec<AlliancePost>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_post_before: Option<Option<Uuid>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audit: Option<Vec<AllianceAudit>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicAlliance {
    pub summary: AllianceSummary,
    pub public_text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum AllianceQuery {
    Directory {
        search: String,
        offset: u64,
    },
    Mine,
    Detail {
        alliance: Uuid,
        post_before: Option<Uuid>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceQueryRequest {
    pub context: QueryContext,
    pub query: AllianceQuery,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceView {
    pub binding: Binding,
    pub request_id: Uuid,
    pub sampled_at: i64,
    pub directory: Vec<AllianceSummary>,
    pub directory_count: u64,
    pub alliance: Option<AllianceDetail>,
    pub applications: Vec<AllianceApplication>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceCommandRequest {
    pub context: QueryContext,
    pub command_id: Uuid,
    pub expected_revision: Option<u64>,
    pub action: AllianceAction,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceCommandResult {
    pub command_id: Uuid,
    pub alliance: Option<Uuid>,
    pub revision: Option<u64>,
}

impl<S: GameStore> GameService<S> {
    pub async fn alliance_query(
        &self,
        p: Principal,
        q: AllianceQueryRequest,
    ) -> Result<AllianceView, ServiceError> {
        Self::principal(p, q.context.binding)?;
        self.store.alliance_query(q).await.map_err(Into::into)
    }
    pub async fn alliance_command(
        &self,
        p: Principal,
        q: AllianceCommandRequest,
    ) -> Result<AllianceCommandResult, ServiceError> {
        Self::principal(p, q.context.binding)?;
        self.store.alliance_command(q).await.map_err(Into::into)
    }
    pub async fn public_alliance(
        &self,
        universe: UniverseId,
        alliance: Uuid,
    ) -> Result<PublicAlliance, ServiceError> {
        self.store
            .public_alliance(universe, alliance)
            .await
            .map_err(Into::into)
    }
}

mod projection;
pub use projection::*;
