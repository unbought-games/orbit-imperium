use super::*;
use std::collections::BTreeMap;
impl PgStore {
    pub async fn inspect_world(
        &self,
        u: UniverseId,
        user: Option<&str>,
        planet: Option<&str>,
    ) -> Result<Value> {
        let mut tx = crate::snapshots::begin(self, &self.pool).await?;
        let rules = crate::facts::rules(&mut tx, u).await?;
        let epoch = Epoch(
            sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
                .bind(u.0)
                .fetch_one(&mut *tx)
                .await?,
        );
        let state = crate::world::load(
            &mut tx,
            u,
            epoch,
            &rules,
            &Input::Command(Command::RecallFleet {
                fleet: FleetId::default(),
            }),
            None,
        )
        .await?;
        let names:Vec<(Uuid,String)>=sqlx::query_as("SELECT m.player,a.name FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1").bind(u.0).fetch_all(&mut *tx).await?;
        let names: BTreeMap<_, _> = names.into_iter().map(|(p, n)| (PlayerId(p), n)).collect();
        let owner = if let Some(n) = user {
            Some(players::resolve(&mut tx, u, n).await?)
        } else {
            None
        };
        let coord = planet.map(coordinates).transpose()?;
        let bodies=state.bodies.values().filter(|b|owner.is_none_or(|p|b.owner==p)&&coord.is_none_or(|c|b.coordinates==c)).map(|b|json!({"planet":coordinate_label(b.coordinates),"name":b.name,"user":names.get(&b.owner),"fields":b.fields,"resources":b.checkpoint.amounts.values().map(|n|n/SCALE),"buildings":b.levels,"ships":state.inventories.iter().filter(|x|x.body==b.id).map(|x|json!({"item":x.item,"count":x.count})).collect::<Vec<_>>()})).collect::<Vec<_>>();
        Ok(
            json!({"universe":u,"planets":bodies,"players":state.research.values().filter(|r|owner.is_none_or(|p|r.owner==p)).map(|r|json!({"user":names.get(&r.owner),"research":r.levels,"policy":state.world.as_ref().and_then(|w|w.records.policies.get(&r.owner))})).collect::<Vec<_>>(),"catalog":rules.artifact.catalog,"queues":{"buildings":state.constructions,"research":state.research_operations,"manufacturing":state.manufacturing_batches}}),
        )
    }
}
