mod projection;
use crate::*;
use orbit_engine::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandEnvelopeV4 {
    pub protocol: i32,
    pub binding: Binding,
    pub command_id: CommandId,
    pub command: CommandDto3,
}
impl CommandEnvelopeV4 {
    pub fn domain(&self) -> Result<Command, ServiceError> {
        if self.protocol != 4 {
            return Err(ServiceError::UnsupportedProtocol);
        }
        match &self.command {
            CommandDto3::Progression(Command::World { action }) => Ok(Command::World {
                action: action.clone(),
            }),
            _ => Ok(CommandEnvelopeV3 {
                protocol: 3,
                binding: self.binding,
                command_id: self.command_id,
                command: self.command.clone(),
            }
            .domain()?
            .command),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ForegroundAction {
    pub presence: CommandEnvelopeV4,
    pub gameplay: CommandEnvelopeV4,
}
impl ForegroundAction {
    pub fn validate(&self) -> Result<(Command, Command), ServiceError> {
        if self.presence.binding != self.gameplay.binding
            || self.presence.command_id == self.gameplay.command_id
        {
            return Err(ServiceError::Malformed);
        }
        let p = self.presence.domain()?;
        let g = self.gameplay.domain()?;
        if !matches!(&p,Command::World{action:WorldAction::RecordForegroundPresence{cause:PresenceCause::GameplayGesture,paired_command_id:Some(id),..}} if *id==self.gameplay.command_id)
            || matches!(
                g,
                Command::World {
                    action: WorldAction::RecordForegroundPresence { .. }
                } | Command::LaunchTransport { .. }
                    | Command::RecallFleet { .. }
            )
        {
            return Err(ServiceError::Malformed);
        }
        Ok((p, g))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundWorld<T> {
    pub protocol: i32,
    pub binding: Binding,
    pub request_id: uuid::Uuid,
    pub viewer_revision: String,
    pub sampled_at: i64,
    pub as_of_ms: i64,
    pub data: T,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OwnMission {
    pub id: FleetId,
    pub intent: FleetIntent,
    pub origin: Coordinates,
    pub destination: Coordinates,
    pub leg: MissionLeg,
    pub ships: Vec<PublicShipStack>,
    pub cargo: ResourceDto,
    pub due_at: i64,
    pub launched_at: i64,
    pub duration_ms: i64,
    pub paid_fuel: String,
    pub can_recall: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IncomingMission {
    pub sender: PlayerId,
    pub origin: Coordinates,
    pub target: BodyId,
    pub mission: Mission,
    pub arrival_at: i64,
    pub ships: IncomingShips,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MissionView {
    pub fleets: Vec<OwnMission>,
    pub incoming: Vec<IncomingMission>,
    pub score_value_micro: String,
    pub fleet_slots: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundView4 {
    #[serde(flatten)]
    pub progression: BoundView3,
    pub missions: MissionView,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorldQuery {
    pub context: QueryContext,
    #[serde(flatten)]
    pub query: WorldQueryKind,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum WorldQueryKind {
    Galaxy { galaxy: u32, system: u32 },
    ResolveDestination { selection: DestinationSelection },
    FleetQuote { intent: FleetIntent },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReportHeader4 {
    pub id: ReportId,
    pub kind: String,
    pub observed_at: i64,
    pub read: bool,
    pub hidden: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReportDetail4 {
    pub header: ReportHeader4,
    pub payload: serde_json::Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReportsPage4 {
    pub items: Vec<ReportHeader4>,
    pub next_cursor: Option<String>,
    pub has_more: bool,
    pub as_of_ms: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportsQuery4 {
    pub context: QueryContext,
    pub cursor: Option<String>,
    pub kind: Option<String>,
    pub limit: u32,
    pub include_hidden: bool,
}
impl<S: GameStore> GameService<S> {
    pub async fn world_presence(
        &self,
        p: Principal,
        e: CommandEnvelopeV4,
    ) -> Result<BoundReceipt, ServiceError> {
        Self::principal(p, e.binding)?;
        if !matches!(
            e.domain()?,
            Command::World {
                action: WorldAction::RecordForegroundPresence {
                    paired_command_id: None,
                    ..
                }
            }
        ) {
            return Err(ServiceError::Malformed);
        }
        Ok(self.store.bound_presence4(e).await?)
    }

    pub async fn world_submit(
        &self,
        p: Principal,
        pair: ForegroundAction,
    ) -> Result<BoundReceipt, ServiceError> {
        Self::principal(p, pair.gameplay.binding)?;
        pair.validate()?;
        Ok(self.store.bound_admit4(pair).await?)
    }
    pub async fn world_query(
        &self,
        p: Principal,
        q: WorldQuery,
    ) -> Result<ReadSnapshot<BoundWorld<serde_json::Value>>, ServiceError> {
        Self::principal(p, q.context.binding)?;
        let ReadSnapshot {
            facts: (facts, rev),
            progress,
        } = self
            .store
            .bound_world_query(q.context.binding, q.query.clone())
            .await?;
        let data = match q.query {
            WorldQueryKind::Galaxy { galaxy, system } => serde_json::to_value(
                galaxy_system(
                    &facts.state,
                    p.player,
                    galaxy,
                    system,
                    facts.at,
                    &facts.rules,
                )
                .map_err(ServiceError::GameRejected)?,
            ),
            WorldQueryKind::ResolveDestination { selection } => serde_json::to_value(
                resolve_destination(&facts.state, selection, &facts.rules)
                    .map_err(ServiceError::GameRejected)?,
            ),
            WorldQueryKind::FleetQuote { intent } => serde_json::to_value(
                quote_fleet(&facts.state, p.player, &intent, facts.at, &facts.rules)
                    .map_err(ServiceError::GameRejected)?,
            ),
        }
        .map_err(|_| ServiceError::InvariantFailure)?;
        Ok(ReadSnapshot {
            progress,
            facts: BoundWorld {
                protocol: 4,
                binding: q.context.binding,
                request_id: q.context.request_id,
                viewer_revision: rev.to_string(),
                sampled_at: facts.at,
                as_of_ms: facts.at,
                data,
            },
        })
    }
    pub async fn world_view(
        &self,
        p: Principal,
        c: QueryContext,
    ) -> Result<ReadSnapshot<BoundView4>, ServiceError> {
        Self::principal(p, c.binding)?;
        let snapshot = self.store.bound_view(c.binding).await?;
        snapshot.try_map(|snapshot| projection::world_projection(&snapshot, p.player, c))
    }
    pub async fn reports4(
        &self,
        p: Principal,
        q: ReportsQuery4,
    ) -> Result<ReadSnapshot<BoundWorld<ReportsPage4>>, ServiceError> {
        Self::principal(p, q.context.binding)?;
        if !(1..=100).contains(&q.limit) {
            return Err(ServiceError::Malformed);
        }
        let ReadSnapshot {
            facts: (page, rev),
            progress,
        } = self.store.world_reports(q.clone()).await?;
        Ok(ReadSnapshot {
            progress,
            facts: BoundWorld {
                protocol: 4,
                binding: q.context.binding,
                request_id: q.context.request_id,
                viewer_revision: rev.to_string(),
                sampled_at: page.as_of_ms,
                as_of_ms: page.as_of_ms,
                data: page,
            },
        })
    }
    pub async fn report4(
        &self,
        p: Principal,
        c: QueryContext,
        id: ReportId,
    ) -> Result<ReadSnapshot<BoundWorld<ReportDetail4>>, ServiceError> {
        Self::principal(p, c.binding)?;
        let ReadSnapshot {
            facts: (detail, at, rev),
            progress,
        } = self.store.world_report(c.binding, id).await?;
        Ok(ReadSnapshot {
            progress,
            facts: BoundWorld {
                protocol: 4,
                binding: c.binding,
                request_id: c.request_id,
                viewer_revision: rev.to_string(),
                sampled_at: at,
                as_of_ms: at,
                data: detail,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn galaxy_query_decodes_flat_tag() {
        let binding = Binding {
            account: AccountId::default(),
            player: PlayerId::default(),
            universe: UniverseId::default(),
            epoch: Epoch::default(),
        };
        let value = serde_json::json!({"context":{"binding":binding,"request_id":uuid::Uuid::nil()},"type":"Galaxy","galaxy":1,"system":1});
        let parsed = serde_json::from_value::<WorldQuery>(value);
        assert!(parsed.is_ok(), "{parsed:?}");
        let extra = serde_json::json!({"context":{"binding":binding,"request_id":uuid::Uuid::nil()},"type":"Galaxy","galaxy":1,"system":1,"private":true});
        assert!(serde_json::from_value::<WorldQuery>(extra).is_err());
    }
}
