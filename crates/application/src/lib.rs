mod bots;
pub use bots::*;
mod simulation;
pub use simulation::*;
mod report_sharing;
pub use report_sharing::*;
mod location;
pub use location::*;
mod catalog_view;
mod technical_data;
pub use catalog_view::*;
mod rankings;
pub use rankings::*;
pub mod report_preview;
pub use orbit_engine::{
    AccountId, Actor, BodyId, CommandId, Epoch, PlayerId, UniverseId, WorkerId,
};
pub use report_preview::report_preview;
mod player_profiles;
mod ports;
pub use player_profiles::*;
mod snapshot;
pub use snapshot::*;
mod scheduling;
pub use scheduling::*;
mod execution;
pub use execution::*;
mod session;
pub use ports::*;
pub use session::*;
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("snapshot serialization retry")]
    SnapshotRetry,
    #[error("game rejected")]
    GameRejected(orbit_engine::GameError),
    #[error(transparent)]
    BotDenied(BotDenial),
    #[error("automatic universe name pool exhausted")]
    UniverseNamesExhausted,
    #[error("persisted format or content unsupported by this binary")]
    UnsupportedState,
    #[error("signup closed")]
    SignupClosed,
    #[error("universe full")]
    UniverseFull,
    #[error("invalid cursor")]
    InvalidCursor,
    #[error("unsupported protocol")]
    UnsupportedProtocol,
    #[error("epoch changed")]
    EpochChanged,
    #[error("rate limited")]
    RateLimited,
    #[error("storage unavailable")]
    Unavailable,
    #[error("conflict")]
    Conflict,
    #[error("stale claim")]
    StaleClaim,
    #[error("incompatible schema")]
    IncompatibleSchema,
    #[error("corrupt data")]
    CorruptData,
    #[error("not found")]
    NotFound,
}
#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error(transparent)]
    BotDenied(BotDenial),
    #[error("persisted format or content unsupported by this binary")]
    UnsupportedState,
    #[error("universe full")]
    UniverseFull,
    #[error("invalid cursor")]
    InvalidCursor,
    #[error("epoch changed")]
    EpochChanged,
    #[error("unsupported protocol")]
    UnsupportedProtocol,
    #[error("game rejected")]
    GameRejected(orbit_engine::GameError),
    #[error("rate limited")]
    RateLimited,
    #[error("unauthenticated")]
    Unauthenticated,
    #[error("forbidden")]
    Forbidden,
    #[error("malformed")]
    Malformed,
    #[error("conflict")]
    Conflict,
    #[error("unavailable")]
    Unavailable,
    #[error("invariant failure")]
    InvariantFailure,
    #[error("not found")]
    NotFound,
}
impl From<StoreError> for ServiceError {
    fn from(e: StoreError) -> Self {
        match e {
            StoreError::GameRejected(e) => Self::GameRejected(e),
            StoreError::BotDenied(e) => Self::BotDenied(e),
            StoreError::UniverseNamesExhausted => Self::Unavailable,
            StoreError::SignupClosed => Self::Forbidden,
            StoreError::UniverseFull => Self::UniverseFull,
            StoreError::InvalidCursor => Self::InvalidCursor,
            StoreError::UnsupportedProtocol => Self::UnsupportedProtocol,
            StoreError::EpochChanged => Self::EpochChanged,
            StoreError::RateLimited => Self::RateLimited,
            StoreError::UnsupportedState => Self::UnsupportedState,
            StoreError::SnapshotRetry | StoreError::Unavailable | StoreError::StaleClaim => {
                Self::Unavailable
            }
            StoreError::Conflict => Self::Conflict,
            StoreError::NotFound => Self::NotFound,
            _ => Self::InvariantFailure,
        }
    }
}
mod views;
pub use views::*;
mod game;
pub use game::*;
pub use orbit_engine::{Command, GameError, Hash, InputId, Quote, QuoteRequest};
mod dto;
pub use dto::*;

mod binding;
pub use binding::*;

mod progression;
pub use progression::*;

mod world;
pub use world::*;

pub use orbit_engine::ReportId;

mod bootstrap;
pub use bootstrap::*;

mod rules_update;
pub use rules_update::*;

mod updates;
pub use updates::*;

mod runtime_status;
pub use runtime_status::*;

mod universe_config;
pub use universe_config::*;
mod setup;
pub use setup::UniverseSetup;

mod alliances;
pub use alliances::*;

mod social;
pub use social::*;

mod world_edit;
pub use world_edit::*;
