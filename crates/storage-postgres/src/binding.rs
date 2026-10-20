use crate::{
    ordering::{Tx, now},
    *,
};
use orbit_application::*;
use sqlx::Row;
pub(crate) async fn current_read(
    tx: &mut Tx<'_>,
    account: AccountId,
    u: UniverseId,
) -> Result<Binding, StoreError> {
    let universe = crate::snapshots::universe(tx, u).await?;
    from_universe(tx, account, u, universe).await
}
async fn from_universe(
    tx: &mut Tx<'_>,
    account: AccountId,
    u: UniverseId,
    universe: sqlx::postgres::PgRow,
) -> Result<Binding, StoreError> {
    let player: uuid::Uuid = sqlx::query_scalar(
        "SELECT player FROM universe_memberships WHERE universe=$1 AND account=$2",
    )
    .bind(u.0)
    .bind(account.0)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(StoreError::NotFound)?;
    Ok(Binding {
        account,
        player: PlayerId(player),
        universe: u,
        epoch: Epoch(universe.try_get("epoch").map_err(db_error)?),
    })
}
pub(crate) async fn check_read(tx: &mut Tx<'_>, binding: Binding) -> Result<(), StoreError> {
    let actual = current_read(tx, binding.account, binding.universe).await?;
    validate(actual, binding)
}
fn validate(actual: Binding, binding: Binding) -> Result<(), StoreError> {
    if actual.epoch != binding.epoch {
        return Err(StoreError::EpochChanged);
    }
    if actual != binding {
        return Err(StoreError::NotFound);
    }
    Ok(())
}
impl PgStore {
    pub(crate) async fn discover(
        &self,
        account: AccountId,
        u: UniverseId,
    ) -> Result<(Binding, i64), StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let b = current_read(&mut tx, account, u).await?;
        let at = now(&mut tx).await?;
        tx.commit().await.map_err(db_error)?;
        Ok((b, at))
    }
    pub(crate) async fn receipt_v2(
        &self,
        b: Binding,
        id: CommandId,
    ) -> Result<BoundReceipt, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        check_read(&mut tx, b).await?;
        let v=sqlx::query_scalar("SELECT receipt FROM commands WHERE universe=$1 AND epoch=$2 AND actor=$3 AND command_id=$4").bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(id.0).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        let receipt = crate::ordering::decode(v)?;
        let protocol = crate::facts::rules(&mut tx, b.universe).await?.protocol();
        tx.commit().await.map_err(db_error)?;
        let mut r = BoundReceipt::new(b, receipt);
        r.protocol = protocol;
        Ok(r)
    }
}
