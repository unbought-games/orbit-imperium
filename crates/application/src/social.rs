use crate::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum SocialAction {
    Send { player: PlayerId, body: String },
    Read { player: PlayerId, message: Uuid },
    Hide { player: PlayerId, message: Uuid },
    Circular { alliance: Uuid, body: String },
    ReadCircular { circular: Uuid },
    HideCircular { circular: Uuid },
    RequestFriend { player: PlayerId },
    AcceptFriend { player: PlayerId, request: Uuid },
    RemoveFriend { player: PlayerId, request: Uuid },
    Block { player: PlayerId },
    Unblock { player: PlayerId },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum SocialQuery {
    Conversations {
        cursor: Option<Uuid>,
        limit: u32,
    },
    Messages {
        player: PlayerId,
        before: Option<Uuid>,
        after: Option<Uuid>,
        limit: u32,
    },
    Circulars {
        cursor: Option<Uuid>,
        limit: u32,
    },
    Contacts {
        kind: ContactKind,
        cursor: Option<Uuid>,
        limit: u32,
    },
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum ContactKind {
    Friends,
    Requests,
    Blocks,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SocialQueryRequest {
    pub context: QueryContext,
    pub query: SocialQuery,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SocialCommandRequest {
    pub context: QueryContext,
    pub command_id: Uuid,
    pub action: SocialAction,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SocialCommandResult {
    pub command_id: Uuid,
    pub message: Option<Uuid>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SocialMessage {
    pub id: Uuid,
    pub sequence: String,
    pub sender: PlayerId,
    pub body: String,
    pub sent_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SocialContact {
    pub player: PlayerId,
    pub username: String,
    pub blocked: bool,
    pub request: Option<Uuid>,
    pub requested_by: Option<PlayerId>,
    pub accepted: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SocialConversation {
    pub contact: SocialContact,
    pub latest: SocialMessage,
    pub unread: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SocialCircular {
    pub id: Uuid,
    pub alliance: Uuid,
    pub alliance_name: String,
    pub alliance_tag: String,
    pub sender: PlayerId,
    pub sender_name: String,
    pub body: String,
    pub sent_at: i64,
    pub read: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SocialView {
    pub binding: Binding,
    pub request_id: Uuid,
    pub conversations: Vec<SocialConversation>,
    pub messages: Vec<SocialMessage>,
    pub circulars: Vec<SocialCircular>,
    pub contacts: Vec<SocialContact>,
    pub contact: Option<SocialContact>,
    pub next_cursor: Option<Uuid>,
}
/// Validate before the transaction. Render Markdown only on the client; never store HTML.
pub fn valid_social_body(body: &str) -> bool {
    !body.trim().is_empty()
        && body.len() <= 16000
        && body.chars().count() <= 4000
        && !body.chars().any(|c| {
            (c.is_control() && c != '\n' && c != '\t' && c != '\r')
                || matches!(c, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
}
impl<S: GameStore> GameService<S> {
    pub async fn social_query(
        &self,
        p: Principal,
        q: SocialQueryRequest,
    ) -> Result<SocialView, ServiceError> {
        Self::principal(p, q.context.binding)?;
        self.store.bot_observe(q.context.binding).await?;
        self.store.social_query(q).await.map_err(Into::into)
    }
    pub async fn social_command(
        &self,
        p: Principal,
        q: SocialCommandRequest,
    ) -> Result<SocialCommandResult, ServiceError> {
        Self::principal(p, q.context.binding)?;
        self.store.social_command(q).await.map_err(Into::into)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn markdown_bounds() {
        assert!(valid_social_body("**Hello**\n> world"));
        assert!(valid_social_body(&"🌌".repeat(4000)));
        for body in [
            " \n".to_string(),
            "x".repeat(4001),
            "hello\0".into(),
            "hi\u{202e}".into(),
        ] {
            assert!(!valid_social_body(&body));
        }
    }
}
