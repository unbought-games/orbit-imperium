//! One LISTEN session per API process; one coalescing watch per active recipient.
use crate::*;
use orbit_application::{AccountId, Binding, Epoch, PlayerId, UniverseId, UpdateWatcher};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::watch;

type Key = (UniverseId, Epoch, PlayerId);
#[derive(Default)]
struct Subscribers {
    players: BTreeMap<Key, (AccountId, watch::Sender<u64>)>,
    accounts: BTreeMap<AccountId, BTreeSet<Key>>,
}
#[derive(Default)]
pub(crate) struct UpdateHub {
    subscribers: Mutex<Subscribers>,
}
struct Watcher {
    key: Key,
    hub: Arc<UpdateHub>,
    receiver: watch::Receiver<u64>,
}
impl UpdateWatcher for Watcher {
    fn changed(&mut self) -> std::pin::Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async {
            let _ = self.receiver.changed().await;
        })
    }
}
impl Drop for Watcher {
    fn drop(&mut self) {
        let mut s = self.hub.subscribers.lock().expect("update subscribers");
        if let Some((account, sender)) = s.players.get(&self.key)
            && sender.receiver_count() == 1
        {
            let account = *account;
            s.players.remove(&self.key);
            if let Some(keys) = s.accounts.get_mut(&account) {
                keys.remove(&self.key);
                if keys.is_empty() {
                    s.accounts.remove(&account);
                }
            }
        }
    }
}
impl UpdateHub {
    pub(crate) fn subscribe(self: &Arc<Self>, b: Binding) -> Box<dyn UpdateWatcher> {
        let key = (b.universe, b.epoch, b.player);
        let mut s = self.subscribers.lock().expect("update subscribers");
        let receiver = s
            .players
            .entry(key)
            .or_insert_with(|| (b.account, watch::channel(0).0))
            .1
            .subscribe();
        s.accounts.entry(b.account).or_default().insert(key);
        Box::new(Watcher {
            key,
            hub: self.clone(),
            receiver,
        })
    }
    fn wake_all(&self) {
        let s = self.subscribers.lock().expect("update subscribers");
        for (_, sender) in s.players.values() {
            sender.send_modify(|n| *n = n.wrapping_add(1));
        }
    }
    fn publish(&self, text: &str) {
        if text.len() > 160 {
            return;
        }
        let s = self.subscribers.lock().expect("update subscribers");
        if let Some(account) = text
            .strip_prefix("account:")
            .and_then(|value| value.parse::<uuid::Uuid>().ok())
        {
            if let Some(keys) = s.accounts.get(&AccountId(account)) {
                for key in keys {
                    if let Some((_, sender)) = s.players.get(key) {
                        sender.send_modify(|n| *n = n.wrapping_add(1));
                    }
                }
            }
            return;
        }
        let parts: Vec<_> = text.split('.').collect();
        if parts.len() != 3 {
            return;
        }
        let (Ok(universe), Ok(epoch)) = (
            parts[0].parse::<uuid::Uuid>(),
            parts[1].parse::<uuid::Uuid>(),
        ) else {
            return;
        };
        let universe = UniverseId(universe);
        let epoch = Epoch(epoch);
        if parts[2] == "*" {
            for ((u, e, _), (_, sender)) in &s.players {
                if *u == universe && *e == epoch {
                    sender.send_modify(|n| *n = n.wrapping_add(1));
                }
            }
        } else if let Ok(player) = parts[2].parse::<uuid::Uuid>()
            && let Some((_, sender)) = s.players.get(&(universe, epoch, PlayerId(player)))
        {
            sender.send_modify(|n| *n = n.wrapping_add(1));
        }
    }
}
impl PgStore {
    pub async fn listen_updates(&self, mut drain: watch::Receiver<bool>) {
        let mut backoff = 100;
        while !*drain.borrow() {
            let connected = async {
                let mut listener = sqlx::postgres::PgListener::connect_with(&self.pool).await?;
                listener.listen("orbit_game_updates").await?;
                Ok::<_, sqlx::Error>(listener)
            };
            let connection = tokio::select! {result=connected=>result,_=drain.changed()=>return};
            if let Ok(mut listener) = connection {
                backoff = 100;
                self.update_hub.wake_all();
                loop {
                    let received = tokio::select! {result=listener.try_recv()=>result,_=drain.changed()=>return};
                    match received {
                        Ok(Some(notification)) => self.update_hub.publish(notification.payload()),
                        Ok(None) => self.update_hub.wake_all(),
                        Err(_) => break,
                    }
                }
            }
            eprintln!("update listener disconnected; durable replay will recover delivery");
            self.update_hub.wake_all();
            tokio::select! {_=tokio::time::sleep(Duration::from_millis(backoff))=>{},_=drain.changed()=>return}
            backoff = (backoff * 2).min(5000);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn binding(n: u128) -> Binding {
        Binding {
            account: uuid::Uuid::from_u128(n).into(),
            player: uuid::Uuid::from_u128(n + 10).into(),
            universe: uuid::Uuid::from_u128(100).into(),
            epoch: uuid::Uuid::from_u128(101).into(),
        }
    }
    #[tokio::test]
    async fn coalesced_wakes_are_recipient_bound_and_drop_removes_subscriptions() {
        let hub = Arc::new(UpdateHub::default());
        let a = binding(1);
        let b = binding(2);
        let mut first = hub.subscribe(a);
        let second = hub.subscribe(a);
        let other = hub.subscribe(b);
        hub.publish(&format!("{}.{}.{}", a.universe, a.epoch, a.player));
        first.changed().await;
        {
            let s = hub.subscribers.lock().unwrap();
            assert_eq!(*s.players[&(b.universe, b.epoch, b.player)].1.borrow(), 0);
        }
        hub.publish(&format!("account:{}", a.account));
        first.changed().await;
        drop(first);
        assert_eq!(hub.subscribers.lock().unwrap().players.len(), 2);
        drop(second);
        drop(other);
        assert!(hub.subscribers.lock().unwrap().players.is_empty());
    }
}
