use crate::{db_error, ordering::Tx};
use orbit_application::*;
use sqlx::Row;
use uuid::Uuid;

pub(crate) async fn load(
    tx: &mut Tx<'_>,
    alliance: Uuid,
) -> Result<AlliancePresentation, StoreError> {
    let mut p = AlliancePresentation::default();
    if let Some(row) = sqlx::query("SELECT schema_version,identity,hall,active_template FROM alliance_presentation WHERE alliance=$1")
        .bind(alliance).fetch_optional(&mut **tx).await.map_err(db_error)? {
        p.schema_version = u16::try_from(row.try_get::<i32,_>("schema_version").map_err(db_error)?).map_err(|_|StoreError::CorruptData)?;
        p.identity = row.try_get::<sqlx::types::Json<_>,_>("identity").map_err(db_error)?.0;
        p.hall = row.try_get::<sqlx::types::Json<_>,_>("hall").map_err(db_error)?.0;
        p.active_template = row.try_get("active_template").map_err(db_error)?;
    }
    for row in sqlx::query("SELECT template_id,schema_version,content FROM alliance_template_documents WHERE alliance=$1")
        .bind(alliance).fetch_all(&mut **tx).await.map_err(db_error)? {
        p.templates.insert(row.try_get("template_id").map_err(db_error)?, AllianceTemplateDocument {
            schema_version: u16::try_from(row.try_get::<i32,_>("schema_version").map_err(db_error)?).map_err(|_|StoreError::CorruptData)?,
            content: row.try_get::<sqlx::types::Json<_>,_>("content").map_err(db_error)?.0,
        });
    }
    Ok(p)
}

pub(crate) async fn save(
    tx: &mut Tx<'_>,
    alliance: Uuid,
    p: &AlliancePresentation,
) -> Result<(), StoreError> {
    sqlx::query("INSERT INTO alliance_presentation(alliance,schema_version,identity,hall,active_template) VALUES($1,$2,$3,$4,$5) ON CONFLICT(alliance) DO UPDATE SET schema_version=excluded.schema_version,identity=excluded.identity,hall=excluded.hall,active_template=excluded.active_template")
        .bind(alliance).bind(i32::from(p.schema_version)).bind(sqlx::types::Json(&p.identity)).bind(sqlx::types::Json(&p.hall)).bind(&p.active_template)
        .execute(&mut **tx).await.map_err(db_error)?;
    for (id, doc) in &p.templates {
        sqlx::query("INSERT INTO alliance_template_documents(alliance,template_id,schema_version,content) VALUES($1,$2,$3,$4) ON CONFLICT(alliance,template_id) DO UPDATE SET schema_version=excluded.schema_version,content=excluded.content")
            .bind(alliance).bind(id).bind(i32::from(doc.schema_version)).bind(sqlx::types::Json(&doc.content)).execute(&mut **tx).await.map_err(db_error)?;
    }
    Ok(())
}

/// Called only for edits under the social lock shared with attachment/deletion.
pub(crate) async fn validate_media(
    tx: &mut Tx<'_>,
    alliance: Uuid,
    p: &AlliancePresentation,
) -> Result<(), StoreError> {
    for id in p.all_media_ids() {
        let ready: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM alliance_media WHERE alliance=$1 AND id=$2 AND state='ready')")
            .bind(alliance).bind(id).fetch_one(&mut **tx).await.map_err(db_error)?;
        if !ready {
            return Err(StoreError::Conflict);
        }
    }
    Ok(())
}

pub(crate) async fn public(
    tx: &mut Tx<'_>,
    alliance: Uuid,
) -> Result<PublicAlliancePresentation, StoreError> {
    let Some(row)=sqlx::query("SELECT p.schema_version,p.identity,p.active_template,t.schema_version AS template_version,t.content FROM alliance_presentation p LEFT JOIN alliance_template_documents t ON t.alliance=p.alliance AND t.template_id=p.active_template WHERE p.alliance=$1").bind(alliance).fetch_optional(&mut **tx).await.map_err(db_error)? else{return Ok((&AlliancePresentation::default()).into())};
    if row.try_get::<i32, _>("schema_version").map_err(db_error)? != 1 {
        return Ok((&AlliancePresentation::default()).into());
    }
    let active: String = row.try_get("active_template").map_err(db_error)?;
    let supported = known_template(&active)
        && row
            .try_get::<Option<i32>, _>("template_version")
            .map_err(db_error)?
            .is_none_or(|v| v == 1);
    Ok(PublicAlliancePresentation {
        schema_version: 1,
        identity: row
            .try_get::<sqlx::types::Json<_>, _>("identity")
            .map_err(db_error)?
            .0,
        template_id: if supported { active } else { "flagship".into() },
        document: AllianceTemplateDocument {
            schema_version: 1,
            content: if supported {
                row.try_get::<Option<sqlx::types::Json<serde_json::Value>>, _>("content")
                    .map_err(db_error)?
                    .map(|j| j.0)
                    .unwrap_or_else(|| serde_json::json!({}))
            } else {
                serde_json::json!({})
            },
        },
    })
}

pub(crate) async fn identities(
    tx: &mut Tx<'_>,
    summaries: &mut [AllianceSummary],
) -> Result<(), StoreError> {
    let ids: Vec<_> = summaries.iter().map(|s| s.id).collect();
    for row in
        sqlx::query("SELECT alliance,identity FROM alliance_presentation WHERE alliance=ANY($1) AND schema_version=1")
            .bind(ids)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?
    {
        let id: Uuid = row.try_get("alliance").map_err(db_error)?;
        if let Some(s) = summaries.iter_mut().find(|s| s.id == id) {
            s.visual_identity = Some(
                row.try_get::<sqlx::types::Json<_>, _>("identity")
                    .map_err(db_error)?
                    .0,
            );
        }
    }
    Ok(())
}
