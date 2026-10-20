use crate::{Binding, BoundReceipt, StoreError};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum StreamEvent {
    Outcome { receipt: BoundReceipt },
    Invalidate { minimum_viewer_revision: String },
    Reset,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GameUpdate {
    pub binding: Binding,
    pub cursor: Option<String>,
    pub event: StreamEvent,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdatePage {
    pub items: Vec<GameUpdate>,
    pub has_more: bool,
}
pub trait UpdateStore: Send + Sync {
    fn watch_updates(&self, binding: Binding) -> Result<Box<dyn UpdateWatcher>, StoreError>;
    fn read_updates(
        &self,
        binding: Binding,
        after: Option<&str>,
        limit: u32,
    ) -> impl Future<Output = Result<UpdatePage, StoreError>> + Send;
}

/// Notifications only prompt a durable replay. The transport holds no database
/// connection while waiting, and the application port has no Tokio dependency.
pub trait UpdateWatcher: Send {
    fn changed(&mut self) -> std::pin::Pin<Box<dyn Future<Output = ()> + Send + '_>>;
}
