//! Authored empire identity and catalog access, independent of simulation.
use crate::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CosmeticRequirement {
    Free,
    Supporter,
    Earned,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmpireTitle {
    pub id: String,
    pub label: String,
    pub address: String,
    pub access: CosmeticRequirement,
}

pub fn free_titles() -> Vec<EmpireTitle> {
    [
        "Commander",
        "Captain",
        "Admiral",
        "Marshal",
        "Governor",
        "Chancellor",
        "Consul",
        "Director",
        "Overseer",
        "Steward",
        "Navigator",
        "Explorer",
    ]
    .into_iter()
    .map(|label| EmpireTitle {
        id: label.to_lowercase(),
        label: label.into(),
        address: label.into(),
        access: CosmeticRequirement::Free,
    })
    .collect()
}

pub fn valid_identity_text(text: &str, max: usize) -> bool {
    text.chars().count() <= max
        && !text.chars().any(|c| {
            c.is_control() || matches!(c, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmpireIdentity {
    pub name: String,
    pub tagline: String,
    pub title_id: String,
}
impl Default for EmpireIdentity {
    fn default() -> Self {
        Self {
            name: String::new(),
            tagline: String::new(),
            title_id: "commander".into(),
        }
    }
}
impl EmpireIdentity {
    pub fn valid(&self) -> bool {
        valid_identity_text(&self.name, 60)
            && valid_identity_text(&self.tagline, 160)
            && valid_symbol_id(&self.title_id)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TitleAccess {
    Available,
    SupporterRequired,
    EarnedRequired,
    Unavailable,
    NotInstalled,
}

pub fn title_access(
    catalog: &InsigniaCatalog,
    id: &str,
    policy: CosmeticPolicy,
    grants: &[String],
    evidence: SupporterEvidence,
    now: i64,
) -> TitleAccess {
    let Some(title) = catalog.title(id) else {
        return TitleAccess::NotInstalled;
    };
    if title.access == CosmeticRequirement::Free
        || policy == CosmeticPolicy::All
        || grants.iter().any(|g| g == id)
    {
        return TitleAccess::Available;
    }
    match title.access {
        CosmeticRequirement::Free => TitleAccess::Available,
        CosmeticRequirement::Earned => TitleAccess::EarnedRequired,
        CosmeticRequirement::Supporter if policy == CosmeticPolicy::Unrestricted => {
            TitleAccess::Available
        }
        CosmeticRequirement::Supporter if !evidence.known || evidence.expires_at <= now => {
            TitleAccess::Unavailable
        }
        CosmeticRequirement::Supporter if evidence.active => TitleAccess::Available,
        CosmeticRequirement::Supporter => TitleAccess::SupporterRequired,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TitleDisplay {
    pub id: String,
    pub label: String,
    pub address: String,
    /// Only membership-backed selections expire. Permanent choices do not.
    pub expires_at: Option<i64>,
}
impl Default for TitleDisplay {
    fn default() -> Self {
        Self {
            id: "commander".into(),
            label: "Commander".into(),
            address: "Commander".into(),
            expires_at: None,
        }
    }
}
pub fn effective_title(
    catalog: &InsigniaCatalog,
    id: &str,
    policy: CosmeticPolicy,
    grants: &[String],
    evidence: SupporterEvidence,
    now: i64,
) -> TitleDisplay {
    if title_access(catalog, id, policy, grants, evidence, now) != TitleAccess::Available {
        return TitleDisplay::default();
    }
    let title = catalog.title(id).expect("installed title");
    TitleDisplay {
        id: id.into(),
        label: title.label.clone(),
        address: title.address.clone(),
        expires_at: (title.access == CosmeticRequirement::Supporter
            && policy == CosmeticPolicy::Supporter
            && !grants.iter().any(|g| g == id))
        .then_some(evidence.expires_at),
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TitleChoice {
    pub title: EmpireTitle,
    pub availability: TitleAccess,
}
#[derive(Clone, Debug, Default)]
pub struct EmpireIdentityRecord {
    pub identity: EmpireIdentity,
    pub grants: Vec<String>,
}

pub struct IdentityAccess<'a> {
    pub catalog: &'a InsigniaCatalog,
    pub policy: CosmeticPolicy,
    pub evidence: SupporterEvidence,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn catalog() -> InsigniaCatalog {
        InsigniaCatalog::with_manifest(InsigniaManifest {
            version: 2,
            insignias: vec![],
            titles: [
                ("test-patron", CosmeticRequirement::Supporter),
                ("test-medalist", CosmeticRequirement::Earned),
            ]
            .into_iter()
            .map(|(id, access)| EmpireTitle {
                id: id.into(),
                label: "Fixture title".into(),
                address: "Fixture".into(),
                access,
            })
            .collect(),
        })
        .unwrap()
    }
    #[test]
    fn title_access_separates_membership_awards_and_installation() {
        let c = catalog();
        let fresh = SupporterEvidence {
            known: true,
            active: true,
            expires_at: 200,
        };
        for policy in [
            CosmeticPolicy::Supporter,
            CosmeticPolicy::Unrestricted,
            CosmeticPolicy::All,
        ] {
            assert_eq!(
                title_access(&c, "consul", policy, &[], SupporterEvidence::default(), 100),
                TitleAccess::Available
            );
            assert_eq!(
                title_access(&c, "missing", policy, &["missing".into()], fresh, 100),
                TitleAccess::NotInstalled
            );
        }
        assert_eq!(
            title_access(
                &c,
                "test-patron",
                CosmeticPolicy::Supporter,
                &[],
                fresh,
                100
            ),
            TitleAccess::Available
        );
        assert_eq!(
            title_access(
                &c,
                "test-patron",
                CosmeticPolicy::Supporter,
                &[],
                fresh,
                200
            ),
            TitleAccess::Unavailable
        );
        assert_eq!(
            title_access(
                &c,
                "test-patron",
                CosmeticPolicy::Supporter,
                &[],
                SupporterEvidence {
                    active: false,
                    ..fresh
                },
                100
            ),
            TitleAccess::SupporterRequired
        );
        for policy in [CosmeticPolicy::Supporter, CosmeticPolicy::Unrestricted] {
            assert_eq!(
                title_access(&c, "test-medalist", policy, &[], fresh, 100),
                TitleAccess::EarnedRequired
            );
        }
        assert_eq!(
            title_access(&c, "test-medalist", CosmeticPolicy::All, &[], fresh, 100),
            TitleAccess::Available
        );
        for id in ["test-patron", "test-medalist"] {
            let grants = vec![id.into()];
            assert_eq!(
                title_access(
                    &c,
                    id,
                    CosmeticPolicy::Supporter,
                    &grants,
                    SupporterEvidence::default(),
                    999
                ),
                TitleAccess::Available
            );
            assert_eq!(
                effective_title(&c, id, CosmeticPolicy::Supporter, &grants, fresh, 999).expires_at,
                None
            );
        }
        assert_eq!(
            effective_title(
                &c,
                "test-patron",
                CosmeticPolicy::Supporter,
                &[],
                fresh,
                100
            )
            .expires_at,
            Some(200)
        );
        assert_eq!(
            effective_title(
                &c,
                "test-patron",
                CosmeticPolicy::Supporter,
                &[],
                fresh,
                200
            )
            .id,
            "commander"
        );
    }
    #[test]
    fn title_catalog_rejects_invalid_metadata_and_reserved_ids() {
        for (id, label, address) in [
            ("consul", "Sample", "Sample"),
            ("../escape", "Sample", "Sample"),
            ("sample", "", "Sample"),
            ("sample", "Sample", "\n"),
        ] {
            assert!(
                InsigniaCatalog::with_manifest(InsigniaManifest {
                    version: 2,
                    insignias: vec![],
                    titles: vec![EmpireTitle {
                        id: id.into(),
                        label: label.into(),
                        address: address.into(),
                        access: CosmeticRequirement::Free
                    }]
                })
                .is_err()
            );
        }
        let title = catalog().titles()[12].clone();
        assert!(
            InsigniaCatalog::with_manifest(InsigniaManifest {
                version: 2,
                insignias: vec![],
                titles: vec![title.clone(), title.clone()]
            })
            .is_err()
        );
        assert!(
            InsigniaCatalog::with_manifest(InsigniaManifest {
                version: 1,
                insignias: vec![],
                titles: vec![title]
            })
            .is_err()
        );
    }
    #[test]
    fn authored_identity_limits_unicode_and_control_characters() {
        let mut i = EmpireIdentity {
            name: "星".repeat(60),
            tagline: "é".repeat(160),
            ..EmpireIdentity::default()
        };
        assert!(i.valid());
        i.name.push('x');
        assert!(!i.valid());
        for value in ["line\nbreak", "\u{202e}hidden", "\u{007f}"] {
            i.name = value.into();
            assert!(!i.valid());
        }
        i.name = "<Roman> & Empire".into();
        assert!(i.valid());
        i.title_id = "../title".into();
        assert!(!i.valid());
    }
}
