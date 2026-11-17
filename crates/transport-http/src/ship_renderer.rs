//! Bounded HTTP adapter. The application owns requests, leases and publication.
use base64::Engine;
use orbit_application::*;
use serde::Deserialize;
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RenderResponse {
    version: u8,
    request_id: Uuid,
    renderer_version: String,
    variants: Vec<Variant>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Variant {
    width: u32,
    height: u32,
    mime_type: String,
    data_base64: String,
}
pub struct HttpShipRenderer {
    client: reqwest::Client,
    url: String,
    token: Option<String>,
}
impl HttpShipRenderer {
    pub fn new(url: String, token: Option<String>) -> Result<Self, String> {
        let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid appearance renderer URL")?;
        if !matches!(parsed.scheme(), "http" | "https")
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
        {
            return Err("Invalid appearance renderer URL".into());
        }
        if token.as_ref().is_some_and(|t| t.len() < 32) {
            return Err("Appearance renderer token must contain at least 32 characters".into());
        }
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "Cannot initialize appearance renderer")?;
        Ok(Self {
            client,
            url: format!("{}/v1/render", url.trim_end_matches('/')),
            token,
        })
    }
    async fn render_http(
        &self,
        job: &ShipRenderJob,
    ) -> Result<Vec<RenderedShipVariant>, ShipRenderError> {
        let mut request = self.client.post(&self.url).json(&job.input);
        if let Some(token) = &self.token {
            request = request.bearer_auth(token);
        }
        let mut response = request
            .send()
            .await
            .map_err(|_| "Renderer unavailable; retry available")?;
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let delay = response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(5)
                .clamp(1, 60);
            return Err(ShipRenderError::Busy {
                retry_after_seconds: delay,
            });
        }
        if !response.status().is_success() {
            return Err("Renderer unavailable; retry available".into());
        }
        const MAX_RESPONSE: usize = 48 * 1024 * 1024;
        if response
            .content_length()
            .is_some_and(|n| n > MAX_RESPONSE as u64)
        {
            return Err("Renderer response exceeded limits".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Incomplete renderer response")?
        {
            if bytes.len() + chunk.len() > MAX_RESPONSE {
                return Err("Renderer response exceeded limits".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let id = job.id;
        tokio::task::spawn_blocking(move || decode(id, &bytes))
            .await
            .map_err(|_| ShipRenderError::Unavailable("Image validation unavailable".into()))?
            .map_err(Into::into)
    }
}
impl ShipRenderer for HttpShipRenderer {
    fn render<'a>(
        &'a self,
        job: &'a ShipRenderJob,
    ) -> ShipRenderFuture<'a, Vec<RenderedShipVariant>> {
        Box::pin(self.render_http(job))
    }
    fn cancel(&self, id: Uuid) -> ShipRenderFuture<'_, ()> {
        Box::pin(async move {
            let mut call = self
                .client
                .delete(format!("{}/{id}", self.url))
                .timeout(std::time::Duration::from_secs(3));
            if let Some(token) = &self.token {
                call = call.bearer_auth(token);
            }
            call.send()
                .await
                .map_err(|_| "Renderer cancellation unavailable")?;
            Ok(())
        })
    }
}
fn decode(id: Uuid, bytes: &[u8]) -> Result<Vec<RenderedShipVariant>, String> {
    let response: RenderResponse =
        serde_json::from_slice(bytes).map_err(|_| "Invalid renderer response")?;
    if response.version != 1
        || response.request_id != id
        || response.renderer_version.is_empty()
        || response.renderer_version.len() > 100
        || response.variants.is_empty()
        || response.variants.len() > 8
    {
        return Err("Invalid renderer response".into());
    }
    let mut seen = std::collections::BTreeSet::new();
    let mut result = Vec::new();
    let mut ratio: Option<(i64, i64)> = None;
    for v in response.variants {
        if v.width == 0
            || v.height == 0
            || v.width > 4096
            || v.height > 4096
            || !seen.insert((v.width, v.height, v.mime_type.clone()))
            || v.data_base64.len() > 12 * 1024 * 1024
        {
            return Err("Invalid render variant".into());
        }
        // All variants describe one image, allowing one-pixel rounding at small sizes.
        if let Some((width, height)) = ratio {
            if (i64::from(v.width) * height - i64::from(v.height) * width).abs() > width.max(height)
            {
                return Err("Inconsistent render aspect ratios".into());
            }
        } else {
            ratio = Some((i64::from(v.width), i64::from(v.height)));
        }
        let format = match v.mime_type.as_str() {
            "image/png" => image::ImageFormat::Png,
            "image/webp" => image::ImageFormat::WebP,
            _ => return Err("Invalid render format".into()),
        };
        let pixels = base64::engine::general_purpose::STANDARD
            .decode(&v.data_base64)
            .map_err(|_| "Invalid rendered pixels")?;
        if pixels.len() > 8 * 1024 * 1024 {
            return Err("Rendered image exceeded limits".into());
        }
        let mut reader = image::ImageReader::with_format(std::io::Cursor::new(&pixels), format);
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(4096);
        limits.max_image_height = Some(4096);
        limits.max_alloc = Some(128 * 1024 * 1024);
        reader.limits(limits);
        let image = reader.decode().map_err(|_| "Invalid rendered image")?;
        if image.width() != v.width || image.height() != v.height || !image.color().has_alpha() {
            return Err("Invalid rendered dimensions or alpha".into());
        }
        result.push(RenderedShipVariant {
            width: v.width,
            height: v.height,
            mime_type: v.mime_type,
            bytes: pixels,
        });
    }
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn png(width: u32, height: u32) -> String {
        let image = image::RgbaImage::new(width, height);
        let mut data = std::io::Cursor::new(Vec::new());
        image.write_to(&mut data, image::ImageFormat::Png).unwrap();
        base64::engine::general_purpose::STANDARD.encode(data.into_inner())
    }
    #[test]
    fn render_validation_accepts_generic_aspect_ratios_and_rejects_forged_metadata() {
        let id = Uuid::new_v4();
        let value = serde_json::json!({"version":1,"request_id":id,"renderer_version":"test","variants":[{"width":200,"height":200,"mime_type":"image/png","data_base64":png(200,200)}]});
        assert_eq!(decode(id, value.to_string().as_bytes()).unwrap().len(), 1);
        assert!(decode(Uuid::new_v4(), value.to_string().as_bytes()).is_err());
        let mut forged = value.clone();
        forged["variants"][0]["width"] = serde_json::json!(99999);
        assert!(decode(id, forged.to_string().as_bytes()).is_err());
        forged["variants"][0]["width"] = serde_json::json!(201);
        assert!(decode(id, forged.to_string().as_bytes()).is_err());
        assert!(HttpShipRenderer::new("https://user:secret@example.test".into(), None).is_err());
        assert!(HttpShipRenderer::new("file:///tmp/renderer".into(), None).is_err());
    }
    #[tokio::test]
    async fn renderer_contention_is_retryable_and_retry_after_is_bounded() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            axum::serve(
                listener,
                axum::Router::new().route(
                    "/v1/render",
                    axum::routing::post(|| async {
                        (
                            axum::http::StatusCode::TOO_MANY_REQUESTS,
                            [("retry-after", "9999")],
                        )
                    }),
                ),
            )
            .await
            .unwrap();
        });
        let uuid = Uuid::new_v4();
        let job = ShipRenderJob {
            id: uuid,
            lease: uuid,
            account: AccountId(uuid),
            binding: Binding {
                account: AccountId(uuid),
                player: PlayerId(uuid),
                universe: UniverseId(uuid),
                epoch: Epoch(uuid),
            },
            input: serde_json::json!({}),
        };
        assert!(matches!(
            HttpShipRenderer::new(url, None).unwrap().render(&job).await,
            Err(ShipRenderError::Busy {
                retry_after_seconds: 60
            })
        ));
        task.abort();
        let _ = task.await;
    }
}
