use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

macro_rules! ids {
    ($($name:ident),+) => {$ (
        #[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub Uuid);
        impl From<Uuid> for $name { fn from(id: Uuid) -> Self { Self(id) } }
        impl std::fmt::Display for $name { fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { self.0.fmt(f) } }
    )+};
}
ids!(
    UniverseId,
    AccountId,
    PlayerId,
    BodyId,
    OperationId,
    FleetId,
    InputId,
    CommandId,
    Epoch,
    WorkerId,
    ReportId
);

pub type Timestamp = i64;
pub type DurationMs = i64;
pub const SCALE: i64 = 1_000_000;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Hash(pub String);
pub fn hash<T: Serialize>(value: &T) -> Hash {
    // Serialize via Value so object keys are sorted at every level.
    let value = serde_json::to_value(value).expect("domain serialization is infallible");
    Hash(hex::encode(Sha256::digest(
        serde_json::to_vec(&value).expect("JSON value"),
    )))
}
pub fn derived_id(input: InputId, kind: &str) -> Uuid {
    let digest = Sha256::digest(format!("{}:{kind}", input.0).as_bytes());
    let mut bytes = [0; 16];
    bytes.copy_from_slice(&digest[..16]);
    Uuid::from_bytes(bytes)
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Actor {
    Player(PlayerId),
    Scheduler,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Resources {
    pub metal: i64,
    pub crystal: i64,
    pub deuterium: i64,
}
impl Resources {
    pub fn all(value: i64) -> Self {
        Self {
            metal: value,
            crystal: value,
            deuterium: value,
        }
    }
    pub fn values(self) -> [i64; 3] {
        [self.metal, self.crystal, self.deuterium]
    }
    pub fn from_values(v: [i64; 3]) -> Self {
        Self {
            metal: v[0],
            crystal: v[1],
            deuterium: v[2],
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Building {
    MetalMine,
    CrystalMine,
    DeuteriumSynthesizer,
    SolarPlant,
    MetalStorage,
    CrystalStorage,
    DeuteriumTank,
    RoboticsFactory,
    ResearchLab,
    Shipyard,
    FusionReactor,
    NaniteFactory,
    Terraformer,
    MissileSilo,
    AllianceDepot,
    LunarBase,
    SensorPhalanx,
    JumpGate,
}
impl Building {
    pub const MVP: [Self; 10] = [
        Self::MetalMine,
        Self::CrystalMine,
        Self::DeuteriumSynthesizer,
        Self::SolarPlant,
        Self::MetalStorage,
        Self::CrystalStorage,
        Self::DeuteriumTank,
        Self::RoboticsFactory,
        Self::ResearchLab,
        Self::Shipyard,
    ];
    pub const ALL: [Self; 4] = [
        Self::MetalMine,
        Self::CrystalMine,
        Self::DeuteriumSynthesizer,
        Self::SolarPlant,
    ];
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ShipType {
    SmallCargo,
    LightFighter,
    Recycler,
    EspionageProbe,
    LargeCargo,
    HeavyFighter,
    Cruiser,
    Battleship,
    Battlecruiser,
    Bomber,
    Destroyer,
    Dreadnought,
    ColonyShip,
    SolarSatellite,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShipStack {
    pub owner: PlayerId,
    pub ship_type: ShipType,
    pub count: i64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum BodyKind {
    Planet,
    Moon,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Coordinates {
    pub galaxy: u32,
    pub system: u32,
    pub position: u32,
}
