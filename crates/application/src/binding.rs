use crate::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub account: AccountId,
    pub player: PlayerId,
    pub universe: UniverseId,
    pub epoch: Epoch,
}
#[derive(Clone, Copy, Debug)]
pub struct Principal {
    pub account: AccountId,
    pub player: PlayerId,
    pub universe: UniverseId,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QueryContext {
    pub binding: Binding,
    pub request_id: Uuid,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BindingCandidate {
    pub protocol: i32,
    pub binding: Binding,
    pub request_id: Uuid,
    pub sampled_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandEnvelopeV2 {
    pub protocol: i32,
    pub binding: Binding,
    pub command_id: CommandId,
    pub command: CommandDto,
}
impl CommandEnvelopeV2 {
    pub fn domain(&self) -> Result<CommandEnvelope, ServiceError> {
        if self.protocol != 2 {
            return Err(ServiceError::UnsupportedProtocol);
        }
        let domain: CommandEnvelope = CommandEnvelopeDto {
            protocol: 2,
            epoch: self.binding.epoch,
            command_id: self.command_id,
            command: self.command.clone(),
        }
        .try_into()?;
        if !legacy_command(&domain.command) {
            return Err(ServiceError::Malformed);
        }
        Ok(domain)
    }
    pub fn intent_hash(&self) -> Result<Hash, ServiceError> {
        Ok(orbit_engine::hash(
            &serde_json::json!({"protocol":2,"binding":self.binding,"command_id":self.command_id,"command":orbit_engine::canonical_command(&self.domain()?.command)}),
        ))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundReceipt {
    pub protocol: i32,
    pub binding: Binding,
    pub command_id: CommandId,
    pub admitted_at: i64,
    pub executed_at: Option<i64>,
    #[serde(flatten)]
    pub status: ReceiptStatus,
}
impl BoundReceipt {
    pub fn new(binding: Binding, r: Receipt) -> Self {
        Self {
            protocol: 2,
            binding,
            command_id: r.command_id,
            admitted_at: r.admitted_at,
            executed_at: r.executed_at,
            status: r.status,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundView {
    pub protocol: i32,
    pub binding: Binding,
    pub request_id: Uuid,
    #[serde(flatten)]
    pub view: ViewSnapshot,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundQuote {
    pub protocol: i32,
    pub binding: Binding,
    pub request_id: Uuid,
    pub viewer_revision: String,
    pub sampled_at: i64,
    pub as_of_ms: i64,
    pub request: QuoteRequestDto,
    pub terms: QuoteDto,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuoteQuery {
    pub context: QueryContext,
    pub request: QuoteRequestDto,
}
impl<S: GameStore> GameService<S> {
    pub async fn current_binding(
        &self,
        account: AccountId,
        u: UniverseId,
        request_id: Uuid,
    ) -> Result<BindingCandidate, ServiceError> {
        let (binding, sampled_at) = self.store.current_binding(account, u).await?;
        let protocol = self.store.load_rules(u).await?.protocol();
        Ok(BindingCandidate {
            protocol,
            binding,
            request_id,
            sampled_at,
        })
    }
    pub(crate) fn principal(p: Principal, b: Binding) -> Result<(), ServiceError> {
        // Player and epoch are checked together against CURRENT membership inside the store gate.
        if p.account != b.account || p.universe != b.universe {
            return Err(ServiceError::NotFound);
        }
        Ok(())
    }
    pub async fn bound_view(
        &self,
        p: Principal,
        c: QueryContext,
    ) -> Result<ReadSnapshot<BoundView>, ServiceError> {
        Self::principal(p, c.binding)?;
        let ReadSnapshot { facts, progress } = self.store.bound_view(c.binding).await?;
        Ok(ReadSnapshot {
            progress,
            facts: BoundView {
                protocol: 2,
                binding: c.binding,
                request_id: c.request_id,
                view: Self::project_view(facts)?,
            },
        })
    }
    pub async fn bound_quote(
        &self,
        p: Principal,
        c: QueryContext,
        request: QuoteRequestDto,
    ) -> Result<ReadSnapshot<BoundQuote>, ServiceError> {
        Self::principal(p, c.binding)?;
        let domain: QuoteRequest = request.try_into()?;
        if !legacy_request(&domain) {
            return Err(ServiceError::Malformed);
        }
        let ReadSnapshot {
            facts: (facts, revision),
            progress,
        } = self.store.bound_quote(c.binding, &domain).await?;
        let terms = orbit_engine::quote(
            &facts.state,
            Actor::Player(c.binding.player),
            &domain,
            facts.at,
            &facts.rules,
        )
        .map_err(|e| match e {
            GameError::NotOwned | GameError::NotFound => ServiceError::NotFound,
            e => ServiceError::GameRejected(e),
        })?;
        let request = serde_json::from_value(orbit_engine::canonical_request(&domain))
            .map_err(|_| ServiceError::InvariantFailure)?;
        Ok(ReadSnapshot {
            progress,
            facts: BoundQuote {
                protocol: 2,
                binding: c.binding,
                request_id: c.request_id,
                viewer_revision: revision.to_string(),
                sampled_at: facts.at,
                as_of_ms: facts.at,
                request,
                terms: terms.into(),
            },
        })
    }
    pub async fn bound_submit(
        &self,
        p: Principal,
        envelope: CommandEnvelopeV2,
    ) -> Result<BoundReceipt, ServiceError> {
        Self::principal(p, envelope.binding)?;
        envelope.domain()?;
        Ok(self.store.bound_admit(envelope).await?)
    }
    pub async fn bound_receipt(
        &self,
        p: Principal,
        b: Binding,
        id: CommandId,
    ) -> Result<BoundReceipt, ServiceError> {
        Self::principal(p, b)?;
        Ok(self.store.bound_receipt(b, id).await?)
    }
}

/// Additive query: does not change the frozen R1 overview/command shapes.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundSettings {
    pub protocol: i32,
    pub binding: Binding,
    pub request_id: Uuid,
    pub profile_hash: Hash,
    pub profile_id: String,
    pub speed: i32,
    pub galaxies: u32,
    pub systems_per_galaxy: u32,
    pub positions_per_system: u32,
}
impl<S: GameStore> GameService<S> {
    pub async fn bound_settings(
        &self,
        p: Principal,
        c: QueryContext,
    ) -> Result<BoundSettings, ServiceError> {
        Self::principal(p, c.binding)?;
        // Reuse the coherent authorization/epoch gate rather than a second unchecked rules read.
        let facts = self.store.bound_view(c.binding).await?;
        let profile = facts.rules.artifact.universe.as_ref();
        Ok(BoundSettings {
            protocol: facts.rules.protocol(),
            binding: c.binding,
            request_id: c.request_id,
            profile_hash: facts.rules.hash.clone(),
            profile_id: facts.rules.artifact.id.clone(),
            speed: facts.rules.speed,
            galaxies: profile.map_or(9, |p| p.galaxies),
            systems_per_galaxy: profile.map_or(499, |p| p.systems_per_galaxy),
            positions_per_system: 15,
        })
    }
}

fn legacy_request(q: &QuoteRequest) -> bool {
    match q {
        QuoteRequest::Upgrade { building, .. } => orbit_engine::Building::ALL.contains(building),
        QuoteRequest::Transport { ships, .. } => ships
            .iter()
            .all(|x| x.ship_type == orbit_engine::ShipType::SmallCargo),
        _ => false,
    }
}
fn legacy_command(c: &Command) -> bool {
    match c {
        Command::StartUpgrade { building, .. } => orbit_engine::Building::ALL.contains(building),
        Command::LaunchTransport { ships, .. } => ships
            .iter()
            .all(|x| x.ship_type == orbit_engine::ShipType::SmallCargo),
        Command::CancelConstruction { .. } | Command::RecallFleet { .. } => true,
        _ => false,
    }
}
