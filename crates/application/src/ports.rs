use crate::*;
pub trait IdentityStore: Send + Sync {
    fn universe_summaries(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<UniverseSummary>, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn save_oidc_login(
        &self,
        _t: unbought_auth::LoginTransaction,
    ) -> impl std::future::Future<Output = Result<(), StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn consume_oidc_login(
        &self,
        _issuer: &str,
        _client: &str,
        _state: &str,
        _browser: &str,
        _now: i64,
    ) -> impl std::future::Future<
        Output = Result<Option<unbought_auth::LoginTransaction>, StoreError>,
    > + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn complete_oidc_login(
        &self,
        _tokens: unbought_auth::Tokens,
        _digest: &str,
        _csrf: &str,
        _previous: Option<String>,
    ) -> impl std::future::Future<Output = Result<AuthenticatedSession, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn revalidate_oidc(
        &self,
        _digest: &str,
        _rp: &unbought_auth::RelyingParty,
    ) -> impl std::future::Future<Output = Result<unbought_auth::Identity, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn revoke_oidc(
        &self,
        _issuer: &str,
        _client: &str,
        _event: unbought_auth::Logout,
    ) -> impl std::future::Future<Output = Result<(), StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn enroll_oidc(
        &self,
        _account: AccountId,
        _policy: SignupPolicy,
    ) -> impl std::future::Future<Output = Result<(), StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }

    /// Persisted universe policy. None is reserved for explicitly configured
    /// legacy stores and fixture adapters; production storage fails if absent.
    fn universe_policy(
        &self,
        _universe: UniverseId,
    ) -> impl std::future::Future<Output = Result<Option<UniversePolicy>, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn register(
        &self,
        registration: Registration,
    ) -> impl std::future::Future<Output = Result<AuthenticatedSession, StoreError>> + Send;
    fn find_credentials(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<Option<Credentials>, StoreError>> + Send;
    fn create_session(
        &self,
        account: AccountId,
        digest: &str,
        csrf: &str,
        previous: Option<String>,
    ) -> impl std::future::Future<Output = Result<AuthenticatedSession, StoreError>> + Send;
    fn lookup_session(
        &self,
        digest: &str,
    ) -> impl std::future::Future<Output = Result<Option<AuthenticatedSession>, StoreError>> + Send;
    /// Called only by the CSRF-protected foreground activity endpoint.
    fn renew_session(
        &self,
        _digest: &str,
        _rp: Option<&unbought_auth::RelyingParty>,
    ) -> impl std::future::Future<Output = Result<i64, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn revoke_session(
        &self,
        digest: &str,
    ) -> impl std::future::Future<Output = Result<(), StoreError>> + Send;
}
pub trait GameStore: Send + Sync {
    /// Public usernames only, for IDs already exposed by an authorized projection.
    fn public_player_names(
        &self,
        _binding: Binding,
        _players: Vec<PlayerId>,
    ) -> impl std::future::Future<Output = Result<PublicPlayerNames, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }

    fn bound_world_query(
        &self,
        binding: Binding,
        _query: WorldQueryKind,
    ) -> impl std::future::Future<Output = Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError>> + Send
    {
        self.bound_world(binding)
    }
    fn bound_presence4(
        &self,
        _e: CommandEnvelopeV4,
    ) -> impl std::future::Future<Output = Result<BoundReceipt, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn bound_admit4(
        &self,
        _pair: ForegroundAction,
    ) -> impl std::future::Future<Output = Result<BoundReceipt, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn bound_world(
        &self,
        _binding: Binding,
    ) -> impl std::future::Future<Output = Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError>> + Send
    {
        async { Err(StoreError::Unavailable) }
    }
    fn world_reports(
        &self,
        _q: ReportsQuery4,
    ) -> impl std::future::Future<Output = Result<ReadSnapshot<(ReportsPage4, i64)>, StoreError>> + Send
    {
        async { Err(StoreError::Unavailable) }
    }
    fn world_report(
        &self,
        _b: Binding,
        _id: orbit_engine::ReportId,
    ) -> impl std::future::Future<
        Output = Result<ReadSnapshot<(ReportDetail4, i64, i64)>, StoreError>,
    > + Send {
        async { Err(StoreError::Unavailable) }
    }

    fn bound_admit3(
        &self,
        _e: CommandEnvelopeV3,
    ) -> impl std::future::Future<Output = Result<BoundReceipt, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn current_binding(
        &self,
        _account: AccountId,
        _u: UniverseId,
    ) -> impl std::future::Future<Output = Result<(Binding, i64), StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn bound_view(
        &self,
        _binding: Binding,
    ) -> impl std::future::Future<Output = Result<ReadSnapshot<ViewerSnapshot>, StoreError>> + Send
    {
        async { Err(StoreError::Unavailable) }
    }
    fn bound_quote(
        &self,
        _binding: Binding,
        _request: &QuoteRequest,
    ) -> impl std::future::Future<Output = Result<ReadSnapshot<(QuoteSnapshot, i64)>, StoreError>> + Send
    {
        async { Err(StoreError::Unavailable) }
    }
    fn bound_admit(
        &self,
        _envelope: CommandEnvelopeV2,
    ) -> impl std::future::Future<Output = Result<BoundReceipt, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }
    fn bound_receipt(
        &self,
        _binding: Binding,
        _id: CommandId,
    ) -> impl std::future::Future<Output = Result<BoundReceipt, StoreError>> + Send {
        async { Err(StoreError::Unavailable) }
    }

    fn admit(
        &self,
        actor: Actor,
        universe: UniverseId,
        envelope: CommandEnvelope,
    ) -> impl std::future::Future<Output = Result<Receipt, StoreError>> + Send;
    fn receipt(
        &self,
        actor: Actor,
        universe: UniverseId,
        id: CommandId,
    ) -> impl std::future::Future<Output = Result<Receipt, StoreError>> + Send;
    fn claim_next(
        &self,
        universe: UniverseId,
        worker: WorkerId,
    ) -> impl std::future::Future<Output = Result<Option<Claim>, StoreError>> + Send;
    fn load_claim(
        &self,
        claim: &Claim,
    ) -> impl std::future::Future<Output = Result<ClaimSnapshot, StoreError>> + Send;
    fn renew_claim(
        &self,
        claim: &Claim,
    ) -> impl std::future::Future<Output = Result<Claim, StoreError>> + Send;
    fn commit_claim(
        &self,
        claim: &Claim,
        result: orbit_engine::TransitionResult,
    ) -> impl std::future::Future<Output = Result<CommitOutcome, StoreError>> + Send;
    fn fail_claim(
        &self,
        claim: &Claim,
        error: &orbit_engine::InvariantError,
    ) -> impl std::future::Future<Output = Result<(), StoreError>> + Send;
    fn load_quote(
        &self,
        actor: Actor,
        universe: UniverseId,
        request: &QuoteRequest,
    ) -> impl std::future::Future<Output = Result<QuoteSnapshot, StoreError>> + Send;
    fn load_rules(
        &self,
        universe: UniverseId,
    ) -> impl std::future::Future<Output = Result<orbit_engine::Ruleset, StoreError>> + Send;

    fn ready(&self) -> impl std::future::Future<Output = Result<(), StoreError>> + Send;
    fn load_view(
        &self,
        actor: Actor,
        universe: UniverseId,
    ) -> impl std::future::Future<Output = Result<ViewerSnapshot, StoreError>> + Send;
}
