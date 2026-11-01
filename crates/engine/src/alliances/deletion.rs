use super::*;
use crate::{Inactivity, PlayerPolicy, inactivity};
use std::collections::BTreeMap;

impl AllianceState {
    /// Returns true when no eligible leader remains and the alliance must disband.
    pub fn remove_deleted_member(
        &mut self,
        player: PlayerId,
        policies: &BTreeMap<PlayerId, PlayerPolicy>,
        at: i64,
        input: Uuid,
    ) -> Result<bool, AllianceError> {
        if !self.is_member(player) {
            return Ok(false);
        }
        let mut next = self.clone();
        if next.leader == player {
            let mut candidates = Vec::new();
            for member in next.members.iter().filter(|m| m.player != player) {
                let p = policies
                    .get(&member.player)
                    .ok_or_else(|| AllianceError::Conflict("missing succession policy".into()))?;
                if !p.deletion_pending(at) {
                    let activity = inactivity(p.last_presence_at, at).map_err(|_| {
                        AllianceError::Conflict("invalid succession presence".into())
                    })?;
                    candidates.push((
                        activity != Inactivity::Active,
                        member.joined_at,
                        member.player,
                    ));
                }
            }
            candidates.sort();
            let Some((_, _, successor)) = candidates.first() else {
                self.execute(
                    player,
                    &AllianceAction::Disband { alliance: self.id },
                    at,
                    input,
                )?;
                return Ok(true);
            };
            next.leader = *successor;
        }
        next.members.retain(|m| m.player != player);
        next.applications.retain(|a| a.player != player);
        next.revision = next
            .revision
            .checked_add(1)
            .ok_or_else(|| AllianceError::Conflict("revision exhausted".into()))?;
        next.audit.push(StateAudit {
            id: input,
            actor: player,
            action: "EmpireRemoved".into(),
            at,
            target: Some(next.leader.0),
        });
        if next.audit.len() > MAX_AUDIT {
            next.audit.drain(..next.audit.len() - MAX_AUDIT);
        }
        *self = next;
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{DAY_MS, Hash, PlayerLifecycle, VacationState};
    fn fixture() -> (AllianceState, BTreeMap<PlayerId, PlayerPolicy>) {
        let p = PlayerId(Uuid::from_u128(1));
        let mut a = AllianceState::create(
            Uuid::from_u128(100),
            p,
            "Test Alliance".into(),
            "TST".into(),
            0,
            [
                Uuid::from_u128(101),
                Uuid::from_u128(102),
                Uuid::from_u128(103),
            ],
        )
        .unwrap();
        for n in 2..=4 {
            a.members.push(StateMember {
                player: PlayerId(Uuid::from_u128(n)),
                joined_at: 100,
                roles: vec![],
            });
        }
        let policies = a
            .members
            .iter()
            .map(|m| {
                (
                    m.player,
                    PlayerPolicy {
                        player: m.player,
                        last_presence_at: 20 * DAY_MS,
                        vacation: VacationState::default(),
                        lifecycle: PlayerLifecycle::Active,
                        deletion_requested_at: None,
                        policy_hash: Hash("test".into()),
                        revision: 0,
                    },
                )
            })
            .collect();
        (a, policies)
    }
    #[test]
    fn recent_then_tenure_then_uuid_and_vacation_does_not_exclude() {
        let (mut a, mut p) = fixture();
        let leader = a.leader;
        p.get_mut(&PlayerId(Uuid::from_u128(2)))
            .unwrap()
            .last_presence_at = 13 * DAY_MS; // exact seven-day boundary
        p.get_mut(&PlayerId(Uuid::from_u128(3))).unwrap().vacation = VacationState::Legacy(true);
        assert!(
            !a.remove_deleted_member(leader, &p, 20 * DAY_MS, Uuid::from_u128(900))
                .unwrap()
        );
        assert_eq!(a.leader, PlayerId(Uuid::from_u128(3)));
        let stable = a.clone();
        a.remove_deleted_member(leader, &p, 20 * DAY_MS, Uuid::from_u128(900))
            .unwrap();
        assert_eq!(a, stable);
        let (mut a, mut p) = fixture();
        let leader = a.leader;
        for policy in p.values_mut() {
            policy.last_presence_at = 0;
        }
        a.members
            .iter_mut()
            .find(|m| m.player.0.as_u128() == 4)
            .unwrap()
            .joined_at = 50;
        a.remove_deleted_member(leader, &p, 20 * DAY_MS, Uuid::from_u128(900))
            .unwrap();
        assert_eq!(a.leader.0.as_u128(), 4);
    }
    #[test]
    fn missing_facts_fail_without_mutation_and_pending_members_cannot_inherit() {
        let (mut a, mut p) = fixture();
        let leader = a.leader;
        let before = a.clone();
        p.remove(&PlayerId(Uuid::from_u128(4)));
        assert!(
            a.remove_deleted_member(leader, &p, 20 * DAY_MS, Uuid::from_u128(900))
                .is_err()
        );
        assert_eq!(a, before);
        let (mut a, mut p) = fixture();
        let leader = a.leader;
        for policy in p.values_mut() {
            policy.deletion_requested_at = Some(20 * DAY_MS);
        }
        assert!(
            a.remove_deleted_member(leader, &p, 20 * DAY_MS, Uuid::from_u128(900))
                .unwrap()
        );
        assert!(a.members.is_empty());
    }
}
