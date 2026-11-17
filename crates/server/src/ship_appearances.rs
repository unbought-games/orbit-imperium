//! One bounded renderer per API process, with durable cross-process lease fencing.
use orbit_application::*;
use orbit_storage_postgres::PgStore;
use orbit_transport_http::{
    AccountProfiles, Customization, HttpShipRenderer, ship_render_environment,
};
use tokio::sync::watch;
use uuid::Uuid;

pub fn configured_renderer() -> Result<Option<Box<dyn ShipRenderer>>, String> {
    std::env::var("ORBIT_APPEARANCE_RENDER_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(|url| {
            HttpShipRenderer::new(url, std::env::var("ORBIT_APPEARANCE_RENDER_TOKEN").ok())
                .map(|r| Box::new(r) as Box<dyn ShipRenderer>)
        })
        .transpose()
}
pub async fn run(
    store: PgStore,
    customization: Customization,
    profiles: Option<AccountProfiles>,
    renderer: Option<Box<dyn ShipRenderer>>,
    mut drain: watch::Receiver<bool>,
) {
    let mut cursor = None;
    loop {
        if *drain.borrow() {
            break;
        }
        // Refresh snapshots from live empire choices and access evidence. No browser
        // resave is needed after emblem edits, removal, expiry or catalog fallback.
        match store.ship_appearance_bindings(cursor).await {
            Ok(bindings) => {
                if bindings.is_empty() {
                    cursor = None;
                }
                for b in bindings {
                    cursor = Some((b.universe.0, b.account.0));
                    if let Ok((environment, _)) =
                        ship_render_environment(&store, b, &customization, profiles.as_ref()).await
                    {
                        let _ = store
                            .change_ship_appearance(
                                b,
                                Uuid::new_v4(),
                                ShipAppearanceAction::Load,
                                environment,
                            )
                            .await;
                    }
                }
            }
            Err(_) => eprintln!("ship appearance refresh unavailable"),
        }
        match store.claim_ship_render().await {
            Ok(Some(job)) => {
                let result = match &renderer {
                    Some(renderer) => {
                        publish(
                            &store,
                            &customization,
                            profiles.as_ref(),
                            renderer.as_ref(),
                            &job,
                        )
                        .await
                    }
                    None => Err("Renderer is not configured; retry available".into()),
                };
                let finished = match result {
                    Err(ShipRenderError::Busy {
                        retry_after_seconds,
                    }) => store.defer_ship_render(&job, retry_after_seconds).await,
                    Err(ShipRenderError::Unavailable(message)) => {
                        store.finish_ship_render(&job, Err(message)).await
                    }
                    Ok(output) => store.finish_ship_render(&job, Ok(output)).await,
                };
                if finished.is_err() {
                    eprintln!("ship appearance completion unavailable; lease will recover");
                }
            }
            Ok(None) => {}
            Err(_) => eprintln!("ship appearance claim unavailable"),
        }
        tokio::select! {
            _=drain.changed()=>{},
            _=tokio::time::sleep(std::time::Duration::from_secs(2))=>{},
        }
    }
}
async fn publish(
    store: &PgStore,
    c: &Customization,
    profiles: Option<&AccountProfiles>,
    renderer: &dyn ShipRenderer,
    job: &ShipRenderJob,
) -> Result<(Uuid, Vec<ShipStoredVariant>), ShipRenderError> {
    let result = {
        let render = renderer.render(job);
        tokio::pin!(render);
        loop {
            tokio::select! {
                output=&mut render=>break Some(output),
                _=tokio::time::sleep(std::time::Duration::from_secs(1))=>{
                    if !store.ship_render_wanted(job).await.map_err(|_|"Render status unavailable")? {break None;}
                }
            }
        }
    };
    let Some(result) = result else {
        let _ = renderer.cancel(job.id).await;
        return Err("Render canceled or superseded".into());
    };
    let variants = result?;
    let (environment, _) = ship_render_environment(store, job.binding, c, profiles)
        .await
        .map_err(|_| "Appearance access unavailable")?;
    let publication_valid_until = environment.valid_until;
    store
        .change_ship_appearance(
            job.binding,
            Uuid::new_v4(),
            ShipAppearanceAction::Load,
            environment,
        )
        .await
        .map_err(|_| "Appearance changed; retry available")?;
    if !store
        .prepare_ship_render(job, publication_valid_until)
        .await
        .map_err(|_| "Render storage unavailable")?
    {
        return Err("Render superseded".into());
    }
    let artifact = Uuid::new_v4();
    let mut stored = Vec::new();
    for (i, variant) in variants.into_iter().enumerate() {
        let stored_variant = ShipStoredVariant {
            width: variant.width,
            height: variant.height,
            mime_type: variant.mime_type,
            key: format!("ship-appearances/{}/{artifact}/{i}", job.account.0),
        };
        c.assets
            .create_immutable(&stored_variant.key, variant.bytes, 8 * 1024 * 1024)
            .await
            .map_err(|_| "Image storage unavailable; retry available")?;
        stored.push(stored_variant);
    }
    Ok((artifact, stored))
}
