use crate::*;
use orbit_application::*;
use sqlx::Row;

fn binding(row: &sqlx::postgres::PgRow) -> Result<GameInvitationBinding, StoreError> {
    Ok(GameInvitationBinding {
        kind: row.try_get("kind").map_err(db_error)?,
        alliance_id: row.try_get("alliance").map_err(db_error)?,
        universe_id: row.try_get("universe").map_err(db_error)?,
        epoch_id: row.try_get("epoch").map_err(db_error)?,
        player_id: row.try_get("player").map_err(db_error)?,
    })
}
impl PgStore {
    pub async fn reserve_game_invitation(
        &self,
        account: AccountId,
        issuer: &str,
        operation: &str,
        universe: UniverseId,
        kind: &str,
        alliance: Option<uuid::Uuid>,
    ) -> Result<GameInvitationBinding, StoreError> {
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        let row=sqlx::query("SELECT u.id AS universe,u.epoch,m.player,$4::text AS kind,$5::uuid AS alliance FROM universe_memberships m JOIN universes u ON u.id=m.universe WHERE m.account=$1 AND m.universe=$2 AND EXISTS(SELECT 1 FROM oidc_identity i WHERE i.account=m.account AND i.issuer=$3) AND NOT EXISTS(SELECT 1 FROM bot_participation b WHERE b.account=m.account) FOR SHARE OF u,m")
            .bind(account.0).bind(universe.0).bind(issuer).bind(kind).bind(alliance).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?;
        let requested = binding(&row)?;
        sqlx::query("INSERT INTO game_invitations(issuer,account,operation_id,universe,epoch,player,kind,alliance) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING")
            .bind(issuer).bind(account.0).bind(operation).bind(requested.universe_id).bind(requested.epoch_id).bind(requested.player_id).bind(kind).bind(alliance).execute(&mut *tx).await.map_err(db_error)?;
        let row=sqlx::query("SELECT universe,epoch,player,kind,alliance FROM game_invitations WHERE issuer=$1 AND account=$2 AND operation_id=$3")
            .bind(issuer).bind(account.0).bind(operation).fetch_one(&mut *tx).await.map_err(db_error)?;
        let stored = binding(&row)?;
        if requested != stored {
            return Err(StoreError::Conflict);
        }
        tx.commit().await.map_err(db_error)?;
        Ok(stored)
    }
    pub async fn finish_game_invitation(
        &self,
        account: AccountId,
        issuer: &str,
        operation: &str,
        code: &str,
    ) -> Result<(), StoreError> {
        let result=sqlx::query("UPDATE game_invitations SET code=$4 WHERE issuer=$1 AND account=$2 AND operation_id=$3 AND (code IS NULL OR code=$4)")
            .bind(issuer).bind(account.0).bind(operation).bind(code).execute(self.admission_pool()?).await.map_err(db_error)?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    pub async fn owned_game_invitations(
        &self,
        account: AccountId,
        issuer: &str,
    ) -> Result<std::collections::BTreeMap<String, GameInvitationBinding>, StoreError> {
        let rows=sqlx::query("SELECT i.code,i.universe,i.epoch,i.player,i.kind,i.alliance FROM game_invitations i JOIN universes u ON u.id=i.universe AND u.epoch=i.epoch WHERE i.account=$1 AND i.issuer=$2 AND i.code IS NOT NULL")
            .bind(account.0).bind(issuer).fetch_all(self.read_pool()?).await.map_err(db_error)?;
        rows.iter()
            .map(|row| Ok((row.try_get("code").map_err(db_error)?, binding(row)?)))
            .collect()
    }
    pub async fn game_invitation_destination(
        &self,
        code: &str,
        issuer: &str,
    ) -> Result<Option<GameInvitationBinding>, StoreError> {
        let row=sqlx::query("SELECT i.universe,i.epoch,i.player,i.kind,i.alliance FROM game_invitations i JOIN universes u ON u.id=i.universe AND u.epoch=i.epoch WHERE i.code=$1 AND i.issuer=$2 AND ((i.kind='alliance_public' AND EXISTS(SELECT 1 FROM alliances a WHERE a.id=i.alliance AND a.universe=i.universe AND a.epoch=i.epoch AND a.invitation IS NOT NULL)) OR (i.kind<>'alliance_public' AND EXISTS(SELECT 1 FROM universe_memberships m WHERE m.universe=i.universe AND m.account=i.account AND m.player=i.player)))")
            .bind(code).bind(issuer).fetch_optional(self.read_pool()?).await.map_err(db_error)?;
        row.as_ref().map(binding).transpose()
    }
    pub async fn game_invitation_universe(
        &self,
        bound: &GameInvitationBinding,
    ) -> Result<Option<InvitationUniverse>, StoreError> {
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let row=sqlx::query("SELECT u.name,u.speed,r.profile,(SELECT count(*) FROM universe_memberships m WHERE m.universe=u.id) AS players,COALESCE((SELECT COALESCE(a.art_slot,b.position) FROM bodies b LEFT JOIN body_appearances a ON a.body=b.id WHERE b.owner=$3 AND b.universe=u.id AND b.kind='Planet' ORDER BY b.galaxy,b.system,b.position LIMIT 1),4) AS art_slot FROM universes u JOIN rulesets r ON r.hash=u.profile_hash WHERE u.id=$1 AND u.epoch=$2")
            .bind(bound.universe_id).bind(bound.epoch_id).bind(if bound.kind=="alliance_public" {uuid::Uuid::nil()} else {bound.player_id}).fetch_optional(&mut *tx).await.map_err(db_error)?;
        let Some(row) = row else { return Ok(None) };
        let rules = crate::facts::decode_rules(row.try_get("profile").map_err(db_error)?)?;
        let Some(topology) = rules.artifact.universe.as_ref() else {
            return Ok(None);
        };
        let policy = self
            .read_policy(&mut tx, UniverseId(bound.universe_id), false)
            .await?
            .ok_or(StoreError::NotFound)?
            .policy;
        let view = InvitationUniverse {
            id: bound.universe_id,
            epoch_id: bound.epoch_id,
            name: row.try_get("name").map_err(db_error)?,
            speed: row.try_get::<i32, _>("speed").map_err(db_error)? as u32,
            galaxies: topology.galaxies,
            systems_per_galaxy: topology.systems_per_galaxy,
            players: row.try_get::<i64, _>("players").map_err(db_error)? as u32,
            max_players: policy.max_players,
            signup_enabled: policy.signup_enabled,
            art_slot: row.try_get::<i32, _>("art_slot").map_err(db_error)? as u32,
        };
        tx.commit().await.map_err(db_error)?;
        Ok(Some(view))
    }
}

impl PgStore {
    pub async fn game_invitation_sponsor(
        &self,
        bound: &GameInvitationBinding,
    ) -> Result<Option<uuid::Uuid>, StoreError> {
        let Some(id) = bound.alliance_id else {
            return Ok(None);
        };
        let mut tx = crate::snapshots::begin(self, self.read_pool()?).await?;
        let state = match crate::alliances::persistence::load(
            &mut tx,
            UniverseId(bound.universe_id),
            Epoch(bound.epoch_id),
            id,
        )
        .await
        {
            Ok(state) => state,
            Err(StoreError::NotFound) => return Ok(None),
            Err(error) => return Err(error),
        };
        let eligible = if bound.kind == "alliance_public" {
            state.invitation.is_some()
        } else {
            state
                .permissions(PlayerId(bound.player_id))
                .contains(&orbit_engine::alliances::AlliancePermission::ManageRecruitment)
        };
        tx.commit().await.map_err(db_error)?;
        Ok(eligible.then_some(id))
    }
}
