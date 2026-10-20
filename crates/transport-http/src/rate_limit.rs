use std::{
    collections::BTreeMap,
    net::IpAddr,
    time::{Duration, Instant},
};
#[derive(Clone, Copy)]
struct Window {
    started: Instant,
    count: u32,
}
pub(crate) struct LoginBudget {
    sources: BTreeMap<IpAddr, Window>,
    accounts: BTreeMap<String, Window>,
    global: Window,
}
impl LoginBudget {
    pub fn new() -> Self {
        Self {
            sources: BTreeMap::new(),
            accounts: BTreeMap::new(),
            global: Window {
                started: Instant::now(),
                count: 0,
            },
        }
    }
    pub fn admit(
        &mut self,
        source: IpAddr,
        account: &str,
        limit: u32,
        now: Instant,
    ) -> Result<(), u64> {
        const WINDOW: Duration = Duration::from_secs(60);
        const MAX_KEYS: usize = 4096;
        self.sources
            .retain(|_, v| now.duration_since(v.started) < WINDOW);
        self.accounts
            .retain(|_, v| now.duration_since(v.started) < WINDOW);
        if now.duration_since(self.global.started) >= WINDOW {
            self.global = Window {
                started: now,
                count: 0,
            }
        }
        let retry = |window: &Window| 60 - now.duration_since(window.started).as_secs().min(59);
        if let Some(window) = self.sources.get(&source)
            && window.count >= limit
        {
            return Err(retry(window));
        }
        if let Some(window) = self.accounts.get(account)
            && window.count >= limit
        {
            return Err(retry(window));
        }
        if self.global.count >= limit.saturating_mul(10) {
            return Err(retry(&self.global));
        }
        if (!self.sources.contains_key(&source) && self.sources.len() >= MAX_KEYS)
            || (!self.accounts.contains_key(account) && self.accounts.len() >= MAX_KEYS)
        {
            return Err(1);
        }
        self.sources
            .entry(source)
            .or_insert(Window {
                started: now,
                count: 0,
            })
            .count += 1;
        self.accounts
            .entry(account.to_owned())
            .or_insert(Window {
                started: now,
                count: 0,
            })
            .count += 1;
        self.global.count += 1;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn account_budget_and_source_budget_are_independent_and_expire() {
        let mut budget = LoginBudget::new();
        let now = Instant::now();
        let a = "203.0.113.1".parse().unwrap();
        let b = "203.0.113.2".parse().unwrap();
        assert!(budget.admit(a, "alpha", 1, now).is_ok());
        assert!(budget.admit(b, "alpha", 1, now).is_err());
        assert!(budget.admit(a, "beta", 1, now).is_err());
        assert!(budget.admit(b, "beta", 1, now).is_ok());
        assert!(
            budget
                .admit(a, "alpha", 1, now + Duration::from_secs(60))
                .is_ok()
        );
    }
}
