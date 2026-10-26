use super::*;
use axum::{
    extract::Query,
    response::sse::{Event, KeepAlive, Sse},
};
use std::{convert::Infallible, time::Duration};
use tokio::sync::{mpsc, watch};
use tokio_stream::wrappers::ReceiverStream;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct StreamQuery {
    epoch: Epoch,
}
async fn draining(drain: &mut Option<watch::Receiver<bool>>) {
    let Some(drain) = drain else {
        return std::future::pending().await;
    };
    while !*drain.borrow() {
        if drain.changed().await.is_err() {
            break;
        }
    }
}
pub(super) async fn stream<S: GameStore + IdentityStore + UpdateStore + Send + Sync + 'static>(
    State(s): State<Arc<HttpState<S>>>,
    headers: HeaderMap,
    Path(id): Path<uuid::Uuid>,
    query: Result<Query<StreamQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Response, Problem> {
    if headers.contains_key(header::ORIGIN) {
        origin(&s, &headers)?;
    }
    if headers
        .get("sec-fetch-site")
        .is_some_and(|value| value != "same-origin" && value != "none")
    {
        return Err(ServiceError::Forbidden.into());
    }
    let session = authenticate(&s, &headers, false).await?;
    let Query(query) = query.map_err(|_| ServiceError::Malformed)?;
    let principal = bound_api::principal(&session, UniverseId(id))?;
    let binding = Binding {
        account: principal.account,
        player: principal.player,
        universe: principal.universe,
        epoch: query.epoch,
    };
    s.updates
        .bot_observe(binding)
        .await
        .map_err(ServiceError::from)?;
    let after = headers
        .get("last-event-id")
        .map(|v| {
            v.to_str()
                .map(str::to_owned)
                .map_err(|_| ServiceError::Malformed)
        })
        .transpose()?;
    let watcher = s
        .updates
        .watch_updates(binding)
        .map_err(ServiceError::from)?;
    let initial = s
        .updates
        .read_updates(binding, after.as_deref(), 64)
        .await
        .map_err(ServiceError::from)?;
    let (sender, receiver) = mpsc::channel::<Result<Event, Infallible>>(16);
    tokio::spawn(deliver(
        s, headers, binding, after, initial, watcher, sender,
    ));
    Ok((
        [
            (header::CACHE_CONTROL, "no-store"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        Sse::new(ReceiverStream::new(receiver)).keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("keepalive"),
        ),
    )
        .into_response())
}
async fn deliver<S: GameStore + IdentityStore + UpdateStore + Send + Sync + 'static>(
    s: Arc<HttpState<S>>,
    headers: HeaderMap,
    binding: Binding,
    mut cursor: Option<String>,
    mut page: UpdatePage,
    mut watcher: Box<dyn UpdateWatcher>,
    sender: mpsc::Sender<Result<Event, Infallible>>,
) {
    let mut drain = s.drain.clone();
    loop {
        // Revalidate before publishing every fetched batch, including the first.
        let Ok(session) = authenticate(&s, &headers, false).await else {
            return;
        };
        if !bound_api::principal(&session, binding.universe)
            .is_ok_and(|p| p.account == binding.account && p.player == binding.player)
        {
            return;
        }
        let Ok(current) = s
            .game
            .current_binding(session.account, binding.universe, uuid::Uuid::new_v4())
            .await
        else {
            return;
        };
        if current.binding != binding {
            return;
        }
        if s.updates.bot_observe(binding).await.is_err() {
            return;
        }
        for update in page.items {
            if s.updates.bot_observe(binding).await.is_err() {
                return;
            }
            let Ok(mut event) = Event::default().event("game-update").json_data(&update) else {
                return;
            };
            if let Some(id) = &update.cursor {
                event = event.id(id);
            }
            tokio::select! {
                biased;
                _=draining(&mut drain)=>return,
                result=sender.send(Ok(event))=>if result.is_err(){return;},
            }
            cursor = update.cursor.or(cursor);
        }
        if !page.has_more {
            tokio::select! {
                _=draining(&mut drain)=>return,
                _=sender.closed()=>return,
                _=watcher.changed()=>{},
                _=tokio::time::sleep(Duration::from_secs(1))=>{},
            }
        }
        page = match s.updates.read_updates(binding, cursor.as_deref(), 64).await {
            Ok(page) => page,
            Err(_) => return,
        };
    }
}
