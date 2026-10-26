//! Public discovery files and route-scoped metadata use the configured browser
//! origin, never Host/Forwarded headers or the official service's hardcoded URL.
const HEAD: &str = include_str!("../assets/home-head.html");

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub(super) fn head(origin: &str) -> String {
    let json = serde_json::to_string(origin).expect("string serialization");
    HEAD.replace(
        "__ORBIT_ORIGIN_JSON__",
        &json[1..json.len() - 1].replace('<', "\\u003c"),
    )
    .replace("__ORBIT_ORIGIN__", &escape(origin))
}

pub(super) fn decorate(html: String, origin: &str) -> String {
    html.replace("<title>Orbit Imperium</title>", &head(origin))
}

pub(super) fn discovery(path: &str, origin: &str) -> Option<(&'static str, String)> {
    match path {
        "/robots.txt" => Some((
            "text/plain; charset=utf-8",
            format!("User-agent: *\nAllow: /\n\nSitemap: {origin}/sitemap.xml\n"),
        )),
        "/sitemap.xml" => Some((
            "application/xml; charset=utf-8",
            format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"><url><loc>{}/</loc></url></urlset>\n",
                escape(origin)
            ),
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn metadata_uses_the_self_hosted_origin_and_valid_structured_data() {
        let output = head("https://community.example:8443");
        assert!(output.contains("rel=\"canonical\" href=\"https://community.example:8443/\""));
        assert!(!output.contains("orbitimperium.com"));
        assert!(!output.contains("__ORBIT_ORIGIN"));
        let json = output
            .split("type=\"application/ld+json\">")
            .nth(1)
            .unwrap()
            .split("</script>")
            .next()
            .unwrap();
        let graph: serde_json::Value = serde_json::from_str(json).unwrap();
        assert_eq!(graph["@graph"][1]["url"], "https://community.example:8443/");
        assert_eq!(graph["@graph"][1]["@type"], "VideoGame");
        assert!(graph["@graph"][1].get("aggregateRating").is_none());
    }
    #[test]
    fn metadata_never_injects_markup_from_origin() {
        let output = head("https://example.test/\"><script>&");
        assert!(!output.contains("<script>&"));
        let json = output
            .split("type=\"application/ld+json\">")
            .nth(1)
            .unwrap()
            .split("</script>")
            .next()
            .unwrap();
        assert!(serde_json::from_str::<serde_json::Value>(json).is_ok());
    }
}
