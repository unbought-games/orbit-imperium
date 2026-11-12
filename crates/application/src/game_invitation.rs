use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Issuance fact, not a copy of mutable universe/player presentation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameInvitationBinding {
    pub kind: String,
    pub alliance_id: Option<Uuid>,
    pub universe_id: Uuid,
    pub epoch_id: Uuid,
    pub player_id: Uuid,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InvitationUniverse {
    pub id: Uuid,
    pub epoch_id: Uuid,
    pub name: String,
    pub speed: u32,
    pub galaxies: u32,
    pub systems_per_galaxy: u32,
    pub players: u32,
    pub max_players: Option<u32>,
    pub signup_enabled: bool,
    pub art_slot: u32,
}
impl InvitationUniverse {
    pub fn admission(&self) -> &'static str {
        if !self.signup_enabled {
            "closed"
        } else if self.max_players.is_some_and(|max| self.players >= max) {
            "full"
        } else {
            "open"
        }
    }
}
