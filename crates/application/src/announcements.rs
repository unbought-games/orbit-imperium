//! Operator-authored news, independent of game state and official hosting.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, future::Future, pin::Pin};

pub const MAX_FEED_BYTES: usize = 1_048_576;
pub const MAX_BODY_BYTES: usize = 16_384;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Announcement {
    pub id: String,
    pub title: String,
    pub date: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<AnnouncementImage>,
    pub body: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AnnouncementImage {
    pub src: String,
    pub alt: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Feed {
    pub schema: u32,
    pub announcements: Vec<Announcement>,
}
impl Default for Feed {
    fn default() -> Self {
        Self {
            schema: 1,
            announcements: vec![],
        }
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct Snapshot {
    pub revision: Option<String>,
    #[serde(flatten)]
    pub feed: Feed,
}
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid announcement: {0}")]
    Invalid(&'static str),
    #[error("announcement storage unavailable")]
    Unavailable,
    #[error("announcement feed changed; inspect the current feed and retry")]
    Conflict,
}
pub type FeedFuture<'a> = Pin<Box<dyn Future<Output = Result<Snapshot, Error>> + Send + 'a>>;
pub trait FeedStore: Send + Sync {
    fn load(&self) -> FeedFuture<'_>;
}

pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}
pub fn valid_url(url: &str) -> bool {
    if url.is_empty()
        || url.len() > 2048
        || url
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || c == '\\')
    {
        return false;
    }
    (url.starts_with('/') && !url.starts_with("//"))
        || (url.starts_with("https://")
            && url::Url::parse(url).is_ok_and(|parsed| {
                parsed.scheme() == "https"
                    && parsed.host_str().is_some()
                    && parsed.username().is_empty()
                    && parsed.password().is_none()
            }))
}
impl Announcement {
    pub fn validate(&self) -> Result<(), Error> {
        if !valid_id(&self.id) {
            return Err(Error::Invalid(
                "id must be lowercase words separated by hyphens",
            ));
        }
        if self.title.trim().is_empty()
            || self.title.len() > 200
            || self.title.chars().any(char::is_control)
        {
            return Err(Error::Invalid(
                "title must contain 1–200 bytes without control characters",
            ));
        }
        let date = chrono::DateTime::parse_from_rfc3339(&self.date)
            .map_err(|_| Error::Invalid("date must be RFC 3339 with a timezone"))?;
        if date.timestamp_millis() < 0 {
            return Err(Error::Invalid("date must be after the Unix epoch"));
        }
        if let Some(until) = &self.until {
            let until = chrono::DateTime::parse_from_rfc3339(until)
                .map_err(|_| Error::Invalid("until must be RFC 3339 with a timezone"))?;
            if until <= date {
                return Err(Error::Invalid("until must be after date"));
            }
        }
        if self.body.trim().is_empty() || self.body.len() > MAX_BODY_BYTES {
            return Err(Error::Invalid("body must contain 1–16384 bytes"));
        }
        if self.href.as_deref().is_some_and(|url| !valid_url(url))
            || self
                .image
                .as_ref()
                .is_some_and(|image| !valid_url(&image.src) || image.alt.len() > 500)
        {
            return Err(Error::Invalid(
                "links and images require a root-relative or HTTPS URL, and image alt text at most 500 bytes",
            ));
        }
        Ok(())
    }
}
impl Feed {
    pub fn validate(&self) -> Result<(), Error> {
        if self.schema != 1 || self.announcements.len() > 64 {
            return Err(Error::Invalid(
                "feed requires schema 1 and at most 64 announcements",
            ));
        }
        let mut ids = BTreeSet::new();
        for item in &self.announcements {
            item.validate()?;
            if !ids.insert(&item.id) {
                return Err(Error::Invalid("duplicate announcement ID"));
            }
        }
        Ok(())
    }
    pub fn publish(&mut self, item: Announcement) -> Result<(), Error> {
        item.validate()?;
        self.announcements.retain(|old| old.id != item.id);
        self.announcements.push(item);
        self.announcements.sort_by(|a, b| a.id.cmp(&b.id));
        self.validate()
    }
    pub fn withdraw(&mut self, id: &str) -> Result<(), Error> {
        if !valid_id(id) {
            return Err(Error::Invalid("invalid announcement ID"));
        }
        self.announcements.retain(|old| old.id != id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item() -> Announcement {
        Announcement {
            id: "research-network".into(),
            title: "New research".into(),
            date: "2026-11-07T12:00:00Z".into(),
            until: None,
            href: None,
            image: None,
            body: "A useful update.".into(),
        }
    }
    #[test]
    fn publication_replaces_stable_ids_and_withdrawal_is_idempotent() {
        let mut feed = Feed::default();
        feed.publish(item()).unwrap();
        let mut edited = item();
        edited.body = "Corrected copy".into();
        feed.publish(edited.clone()).unwrap();
        assert_eq!(feed.announcements, vec![edited]);
        feed.withdraw("research-network").unwrap();
        feed.withdraw("research-network").unwrap();
        assert!(feed.announcements.is_empty());
    }
    #[test]
    fn invalid_dates_duplicate_ids_and_unsafe_metadata_are_rejected() {
        let mut a = item();
        a.until = Some(a.date.clone());
        assert!(a.validate().is_err());
        a.until = None;
        a.date = "tomorrow".into();
        assert!(a.validate().is_err());
        let mut feed = Feed {
            schema: 1,
            announcements: vec![item(), item()],
        };
        assert!(feed.validate().is_err());
        feed.announcements.pop();
        feed.schema = 2;
        assert!(feed.validate().is_err());
        for url in [
            "javascript:alert(1)",
            "//evil.test",
            "/\\evil.test",
            "https://",
            "https://user@host",
            "https://[invalid",
            "/a\nb",
        ] {
            assert!(!valid_url(url), "{url}");
        }
        for url in ["/updates/news.html", "https://example.test/news"] {
            assert!(valid_url(url));
        }
    }
}
