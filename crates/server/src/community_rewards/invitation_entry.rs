use super::*;
use axum::response::{IntoResponse, Response};
use orbit_application::{AccountId, GameStore, PlayerId, UniverseId};
use orbit_transport_http::InvitationCard;

impl Integration {
    pub(super) async fn bind_created(
        &self,
        session: &orbit_application::AuthenticatedSession,
        request: &mut ActionRequest,
    ) -> Result<bool, StatusCode> {
        if request.action["type"] != "create_invitation" {
            return Ok(false);
        }
        let universe: uuid::Uuid = serde_json::from_value(request.action["universe_id"].clone())
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        let kind = request.action["kind"]
            .as_str()
            .filter(|v| matches!(*v, "personal" | "combined" | "alliance_public"))
            .ok_or(StatusCode::BAD_REQUEST)?;
        let alliance = if kind == "personal" {
            None
        } else {
            if request.action["alliance"]["universe_id"] != universe.to_string() {
                return Err(StatusCode::BAD_REQUEST);
            }
            Some(
                serde_json::from_value(request.action["alliance"]["alliance_id"].clone())
                    .map_err(|_| StatusCode::BAD_REQUEST)?,
            )
        };
        let bound = self
            .store
            .reserve_game_invitation(
                session.account,
                &self.issuer,
                &request.request_id,
                UniverseId(universe),
                kind,
                alliance,
            )
            .await
            .map_err(store_status)?;
        if kind != "personal"
            && request.action["alliance"]["epoch_id"] != bound.epoch_id.to_string()
        {
            return Err(StatusCode::CONFLICT);
        }
        request
            .action
            .as_object_mut()
            .ok_or(StatusCode::BAD_REQUEST)?
            .remove("universe_id");
        Ok(true)
    }
    pub(super) async fn owner_destinations(
        &self,
        account: AccountId,
        mut owner: Value,
    ) -> Result<Value, StatusCode> {
        let bound = self
            .store
            .owned_game_invitations(account, &self.issuer)
            .await
            .map_err(store_status)?;
        if let Some(items) = owner["invitations"].as_array_mut() {
            for item in items {
                let code = item["code"].as_str().unwrap_or("");
                item["destination"] = json!(bound.get(code));
            }
        }
        Ok(owner)
    }
    async fn presentation(&self, code: &str) -> Result<Value, StatusCode> {
        if !valid_invitation_code(code) {
            return Err(StatusCode::BAD_REQUEST);
        }
        let bound = self
            .store
            .game_invitation_destination(code, &self.issuer)
            .await
            .map_err(store_status)?;
        let Some(bound) = bound else {
            return Ok(
                json!({"code":code,"status":"unavailable","universe":null,"inviter":null,"alliance":null}),
            );
        };
        let universe = self
            .store
            .game_invitation_universe(&bound)
            .await
            .map_err(store_status)?
            .ok_or(StatusCode::NOT_FOUND)?;
        let inviter = if bound.kind == "alliance_public" {
            Value::Null
        } else {
            orbit_transport_http::invitation_player(
                &self.store,
                Some(&self.observations),
                self.customization.as_ref(),
                UniverseId(bound.universe_id),
                PlayerId(bound.player_id),
            )
            .await
            .map_err(store_status)?
        };
        let alliance = if let Some(id) = bound.alliance_id {
            self.store
                .public_alliance(UniverseId(bound.universe_id), id)
                .await
                .ok()
                .map(|a| json!({"name":a.summary.name,"id":id,"universe_id":bound.universe_id}))
        } else {
            None
        };
        Ok(
            json!({"code":code,"status":"ready","kind":if bound.kind=="combined" && alliance.is_none() {"personal"} else {&bound.kind},"universe":universe,"inviter":inviter,"alliance":alliance}),
        )
    }
    async fn card(&self, value: &Value, render_emblem: bool) -> Result<InvitationCard, StatusCode> {
        let universe =
            serde_json::from_value(value["universe"].clone()).map_err(|_| StatusCode::NOT_FOUND)?;
        Ok(InvitationCard {
            sender: value["inviter"]["name"]
                .as_str()
                .or(value["alliance"]["name"].as_str())
                .unwrap_or("An Orbit alliance")
                .into(),
            empire: value["inviter"]["empire_name"]
                .as_str()
                .or(value["alliance"]["name"].as_str())
                .unwrap_or("Orbit Imperium")
                .into(),
            title: value["inviter"]["title"]["label"]
                .as_str()
                .unwrap_or("Alliance invitation")
                .into(),
            universe,
            emblem: if render_emblem {
                InvitationCard::emblem(
                    value["inviter"].get("insignia"),
                    self.customization.as_ref(),
                )
                .await
                .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
            } else {
                None
            },
        })
    }
}
pub(super) async fn preview(
    State(s): State<Arc<Integration>>,
    Path(code): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    Ok(response(s.presentation(&code).await?))
}
pub(super) async fn page(
    State(s): State<Arc<Integration>>,
    Path(code): Path<String>,
) -> Result<Response, StatusCode> {
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let value = s.presentation(&code).await?;
    let template = tokio::fs::read_to_string(std::path::Path::new(&s.assets).join("index.html"))
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let metadata = if value["status"] == "ready" {
        s.card(&value, false)
            .await?
            .metadata(&format!("{}/invite/{code}", s.origin.trim_end_matches('/')))
    } else {
        "<title>Invitation unavailable · Orbit Imperium</title><meta name=\"robots\" content=\"noindex,follow\">".into()
    };
    let html =
        InvitationCard::page_html(&template, &metadata).ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    Ok((
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        html,
    )
        .into_response())
}
pub(super) async fn image(
    State(s): State<Arc<Integration>>,
    Path(code): Path<String>,
) -> Result<Response, StatusCode> {
    let _permit = s
        .permits
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let value = s.presentation(&code).await?;
    let card = s.card(&value, true).await?;
    let permit = s
        .image_permits
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let assets = s.assets.clone();
    let bytes = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        card.render(&assets)
    })
    .await
    .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
    .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok((
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=60"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        bytes,
    )
        .into_response())
}
