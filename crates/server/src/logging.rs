//! Process-local formatting and asynchronous stderr delivery. Docker owns rotation.
use std::sync::OnceLock;
use tracing::level_filters::LevelFilter;
use tracing_appender::non_blocking::{ErrorCounter, NonBlockingBuilder, WorkerGuard};
use tracing_subscriber::{filter::Targets, layer::SubscriberExt};

static DROPPED: OnceLock<ErrorCounter> = OnceLock::new();

pub fn level(value: Option<&str>) -> Result<LevelFilter, &'static str> {
    match value.unwrap_or("info").to_ascii_lowercase().as_str() {
        "error" => Ok(LevelFilter::ERROR),
        "warn" => Ok(LevelFilter::WARN),
        "info" => Ok(LevelFilter::INFO),
        "debug" => Ok(LevelFilter::DEBUG),
        _ => Err("ORBIT_LOG_LEVEL must be error, warn, info or debug"),
    }
}

fn subscriber<W>(level: LevelFilter, writer: W) -> impl tracing::Subscriber + Send + Sync
where
    W: for<'writer> tracing_subscriber::fmt::MakeWriter<'writer> + Send + Sync + 'static,
{
    tracing_subscriber::registry()
        .with(Targets::new().with_target("orbit", level))
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .flatten_event(true)
                .with_current_span(false)
                .with_span_list(false)
                .with_target(false)
                .with_writer(writer),
        )
}

pub fn init() -> Result<WorkerGuard, Box<dyn std::error::Error>> {
    let level = level(std::env::var("ORBIT_LOG_LEVEL").ok().as_deref())?;
    let (writer, guard) = NonBlockingBuilder::default()
        .buffered_lines_limit(8192)
        .lossy(true)
        .finish(std::io::stderr());
    let _ = DROPPED.set(writer.error_counter());
    tracing::subscriber::set_global_default(subscriber(level, writer))?;
    Ok(guard)
}

pub fn dropped_lines() -> usize {
    DROPPED.get().map_or(0, ErrorCounter::dropped_lines)
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_application::{ServiceError, StepOutcome, diagnostics};
    use orbit_engine::*;
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    #[derive(Clone, Default)]
    struct Buffer(Arc<Mutex<Vec<u8>>>);
    impl Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for Buffer {
        type Writer = Self;
        fn make_writer(&'a self) -> Self {
            self.clone()
        }
    }
    fn capture(level: LevelFilter, work: impl FnOnce()) -> Vec<serde_json::Value> {
        let buffer = Buffer::default();
        tracing::subscriber::with_default(subscriber(level, buffer.clone()), work);
        let data = buffer.0.lock().unwrap();
        String::from_utf8_lossy(&data)
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect()
    }
    fn input() -> OrderedInput {
        OrderedInput {
            schema_version: 4,
            id: InputId(uuid::Uuid::from_u128(1)),
            universe: UniverseId(uuid::Uuid::from_u128(2)),
            epoch: Epoch(uuid::Uuid::from_u128(3)),
            actor: Actor::Scheduler,
            at: 1234,
            phase: 1,
            sequence: 10,
            protocol: 4,
            profile_hash: Hash("private-rng-material".into()),
            payload: Input::Command(Command::World {
                action: WorldAction::RenamePlanet {
                    body: BodyId(uuid::Uuid::from_u128(4)),
                    name: "private-message-cookie-credential".into(),
                },
            }),
        }
    }
    #[test]
    fn four_thresholds_default_and_no_trace_or_filter_language() {
        assert_eq!(level(None).unwrap(), LevelFilter::INFO);
        for invalid in ["trace", "off", "orbit=debug", "", "secret-value"] {
            assert!(level(Some(invalid)).is_err());
        }
        for (setting, expected) in [("error", 1), ("warn", 2), ("info", 3), ("debug", 4)] {
            let records = capture(level(Some(setting)).unwrap(), || {
                orbit_application::orbit_log!(ERROR, event = "error_probe");
                orbit_application::orbit_log!(WARN, event = "warn_probe");
                orbit_application::orbit_log!(INFO, event = "info_probe");
                orbit_application::orbit_log!(DEBUG, event = "debug_probe");
                tracing::trace!(target: "orbit", "never");
                tracing::error!(target: "third_party", "cookie=must-not-appear");
            });
            assert_eq!(records.len(), expected);
            assert!(
                records
                    .iter()
                    .all(|r| r["release"].is_string() && r["timestamp"].is_string())
            );
        }
    }
    #[test]
    fn release_identity_never_echoes_arbitrary_environment_text() {
        let digest = "a".repeat(64);
        assert_eq!(
            diagnostics::release_identity(&format!(
                "user:private-password@registry/image@sha256:{digest}"
            )),
            Some(format!("sha256:{digest}"))
        );
        for value in [
            "postgres://user:password@host",
            "cookie=secret",
            "sha256:private",
            "",
        ] {
            assert_eq!(diagnostics::release_identity(value), None);
        }
    }

    #[test]
    fn disabled_debug_does_not_construct_or_format_values() {
        let calls = std::cell::Cell::new(0);
        let records = capture(LevelFilter::INFO, || {
            orbit_application::orbit_log!(DEBUG, event = "lazy", value = %{
                calls.set(calls.get() + 1); String::from("must not be built")
            });
        });
        assert!(records.is_empty());
        assert_eq!(calls.get(), 0);
    }
    #[test]
    fn correlated_records_exclude_payload_and_free_text_at_every_level() {
        for level in [
            LevelFilter::ERROR,
            LevelFilter::WARN,
            LevelFilter::INFO,
            LevelFilter::DEBUG,
        ] {
            let i = input();
            let records = capture(level, || {
                diagnostics::admitted(
                    i.universe,
                    CommandId(uuid::Uuid::from_u128(5)),
                    i.id,
                    diagnostics::action(&i.payload),
                );
                diagnostics::engine_decision(
                    &i,
                    &TransitionResult::InvalidState(InvariantError(
                        "private-message-cookie-credential".into(),
                    )),
                );
                diagnostics::resolution(
                    &i,
                    &Ok(StepOutcome::Blocked {
                        input_id: i.id,
                        reason: "private-rng-material".into(),
                    }),
                );
                diagnostics::resolution(&i, &Err(ServiceError::Unavailable));
                diagnostics::commit_result(
                    &i,
                    &Ok(orbit_application::CommitOutcome::Committed {
                        input_id: i.id,
                        receipt: Some(orbit_application::Receipt {
                            command_id: CommandId(uuid::Uuid::from_u128(5)),
                            epoch: i.epoch,
                            admitted_at: 1,
                            executed_at: Some(2),
                            status: orbit_application::ReceiptStatus::Rejected {
                                code: GameError::NotOwned,
                            },
                        }),
                    }),
                );
            });
            let text = serde_json::to_string(&records).unwrap();
            for forbidden in [
                "private-message",
                "credential",
                "cookie",
                "private-rng",
                "profile_hash",
                "reason",
            ] {
                assert!(!text.contains(forbidden), "leaked {forbidden}");
            }
            let failed = records
                .iter()
                .find(|r| r["event"] == "game_transition_failed")
                .unwrap();
            assert_eq!(failed["commit_outcome"], "unknown");
            assert_eq!(failed["input_id"], i.id.to_string());
            if level >= LevelFilter::INFO {
                let admitted = records
                    .iter()
                    .find(|r| r["event"] == "command_admitted")
                    .unwrap();
                assert_eq!(admitted["command_id"], uuid::Uuid::from_u128(5).to_string());
                assert_eq!(admitted["commit_outcome"], "acknowledged");
            }
        }
    }
    #[test]
    fn gameplay_rejections_are_debug_decisions_not_application_errors() {
        let i = input();
        let records = capture(LevelFilter::DEBUG, || {
            diagnostics::engine_decision(&i, &TransitionResult::Rejected(GameError::NotOwned));
            diagnostics::commit_result(
                &i,
                &Ok(orbit_application::CommitOutcome::Committed {
                    input_id: i.id,
                    receipt: Some(orbit_application::Receipt {
                        command_id: CommandId(uuid::Uuid::from_u128(5)),
                        epoch: i.epoch,
                        admitted_at: 1,
                        executed_at: Some(2),
                        status: orbit_application::ReceiptStatus::Rejected {
                            code: GameError::NotOwned,
                        },
                    }),
                }),
            );
        });
        assert_eq!(records.len(), 2);
        assert_eq!(records[0]["level"], "DEBUG");
        assert_eq!(records[0]["outcome"], "rejected");
        assert_eq!(records[0]["commit_outcome"], "not_attempted");
        assert_eq!(records[1]["level"], "INFO");
        assert_eq!(records[1]["outcome"], "rejected");
    }
    #[test]
    fn metrics_are_recorded_at_every_threshold() {
        use orbit_application::{RuntimeEvent, RuntimeObserver, RuntimeStage};
        for threshold in [
            LevelFilter::ERROR,
            LevelFilter::WARN,
            LevelFilter::INFO,
            LevelFilter::DEBUG,
        ] {
            let metrics = crate::metrics::RuntimeMetrics::new();
            capture(threshold, || {
                metrics.event(RuntimeEvent::StorageRetry);
                metrics.duration(RuntimeStage::Engine, std::time::Duration::from_millis(5));
            });
            let text = metrics.render();
            assert!(text.contains("orbit_runtime_seconds_count{stage=\"engine\"} 1"));
            assert!(text.contains("orbit_log_dropped_lines_total"));
        }
    }
    #[test]
    fn representative_info_and_debug_volume() {
        // One minute at one gameplay command/second, paired presence and six
        // browser reads per command. A sizing fixture, not a traffic forecast.
        for threshold in [LevelFilter::INFO, LevelFilter::DEBUG] {
            let i = input();
            let records = capture(threshold, || {
                for _ in 0..60 {
                    diagnostics::admitted(
                        i.universe,
                        CommandId(uuid::Uuid::from_u128(5)),
                        i.id,
                        "rename_planet",
                    );
                    diagnostics::engine_decision(
                        &i,
                        &TransitionResult::Rejected(GameError::NotOwned),
                    );
                    diagnostics::commit_result(
                        &i,
                        &Ok(orbit_application::CommitOutcome::Committed {
                            input_id: i.id,
                            receipt: None,
                        }),
                    );
                    let mut presence = i.clone();
                    presence.payload = Input::Command(Command::World {
                        action: WorldAction::RecordForegroundPresence {
                            body: None,
                            cause: PresenceCause::GameplayGesture,
                            paired_command_id: None,
                        },
                    });
                    diagnostics::admitted(
                        i.universe,
                        CommandId(uuid::Uuid::from_u128(6)),
                        presence.id,
                        "presence",
                    );
                    diagnostics::engine_decision(
                        &presence,
                        &TransitionResult::Rejected(GameError::NotOwned),
                    );
                    diagnostics::commit_result(
                        &presence,
                        &Ok(orbit_application::CommitOutcome::Committed {
                            input_id: presence.id,
                            receipt: None,
                        }),
                    );
                    for _ in 0..7 {
                        orbit_application::orbit_log!(
                            DEBUG,
                            event = "http_request_completed",
                            stage = "http",
                            route = "/api/v4/universes/{id}/overview",
                            method = "POST",
                            action = "unknown",
                            status = 200u16,
                            outcome = "success",
                            duration_ms = 5u64
                        );
                    }
                }
            });
            let bytes: usize = records
                .iter()
                .map(|r| serde_json::to_vec(r).unwrap().len() + 1)
                .sum();
            println!(
                "LOG_VOLUME level={threshold} events={} json_bytes_per_minute={bytes}",
                records.len()
            );
            assert!(!records.is_empty());
        }
    }

    #[test]
    fn full_async_buffer_drops_instead_of_blocking_the_caller() {
        struct BlockedWriter(
            std::sync::mpsc::SyncSender<()>,
            std::sync::mpsc::Receiver<()>,
        );
        impl Write for BlockedWriter {
            fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
                let _ = self.0.try_send(());
                let _ = self.1.recv();
                Ok(bytes.len())
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        let (entered_tx, entered_rx) = std::sync::mpsc::sync_channel(1);
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let (mut writer, guard) = NonBlockingBuilder::default()
            .buffered_lines_limit(1)
            .lossy(true)
            .finish(BlockedWriter(entered_tx, release_rx));
        writer.write_all(b"first\n").unwrap();
        entered_rx.recv().unwrap();
        for _ in 0..100 {
            writer.write_all(b"while blocked\n").unwrap();
        }
        assert!(writer.error_counter().dropped_lines() >= 99);
        drop(release_tx);
        drop(writer);
        drop(guard);
    }
}
