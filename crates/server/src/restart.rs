//! Restart pacing after serving has stopped, never retrying an uncertain guard.
use std::time::Duration;

pub fn delay(entropy: u128) -> Duration {
    Duration::from_millis(5_000 + (entropy % 10_001) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The floor bounds DB reconnect storms even when a container runtime resets
    // its exponential backoff; jitter separates simultaneous API/worker exits.
    #[test]
    fn restart_delay_has_a_floor_jitter_and_cap() {
        let values: Vec<_> = (0..=10_000).map(delay).collect();
        assert_eq!(values[0], Duration::from_secs(5));
        assert_eq!(values[10_000], Duration::from_secs(15));
        assert!(values.windows(2).all(|pair| pair[0] < pair[1]));
        assert!((Duration::from_secs(5)..=Duration::from_secs(15)).contains(&delay(u128::MAX)));
    }
}
