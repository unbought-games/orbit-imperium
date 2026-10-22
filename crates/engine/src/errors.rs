use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
pub enum GameError {
    #[error("PositionOccupied")]
    PositionOccupied,
    #[error("NoHarvestTarget")]
    NoHarvestTarget,
    #[error("PolicyUnavailable")]
    PolicyUnavailable,
    #[error("ActorVacation")]
    ActorVacation,
    #[error("ActorDraining")]
    ActorDraining,
    #[error("TargetVacation")]
    TargetVacation,
    #[error("BeginnerProtected")]
    BeginnerProtected,
    #[error("PresenceUnavailable")]
    PresenceUnavailable,

    #[error("SettingsChanged")]
    SettingsChanged,
    #[error("PrerequisiteMissing")]
    PrerequisiteMissing,
    #[error("ResearchActive")]
    ResearchActive,
    #[error("LabLocked")]
    LabLocked,
    #[error("YardLocked")]
    YardLocked,
    #[error("CapacityReserved")]
    CapacityReserved,
    #[error("QueueCapacity")]
    QueueCapacity,
    #[error("EnergyRequired")]
    EnergyRequired,
    #[error("BodyKindNotAllowed")]
    BodyKindNotAllowed,
    #[error("NotDemolishable")]
    NotDemolishable,
    #[error("ModeRestricted")]
    ModeRestricted,

    #[error("numeric range")]
    NumericRange,
    #[error("unavailable content")]
    UnavailableContent,
    #[error("not owned")]
    NotOwned,
    #[error("not found")]
    NotFound,
    #[error("insufficient resources")]
    InsufficientResources,
    #[error("active construction")]
    ActiveConstruction,
    #[error("no free field")]
    NoFreeField,
    #[error("quote changed")]
    QuoteChanged,
    #[error("operation not active")]
    OperationNotActive,
    #[error("invalid input")]
    InvalidInput,
    #[error("insufficient ships")]
    InsufficientShips,
    #[error("fleet slot occupied")]
    NoFleetSlot,
    #[error("cargo capacity exceeded")]
    CargoCapacity,
    #[error("fleet not outbound")]
    NotOutbound,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[error("{0}")]
pub struct InvariantError(pub String);
impl From<GameError> for InvariantError {
    fn from(e: GameError) -> Self {
        Self(e.to_string())
    }
}
