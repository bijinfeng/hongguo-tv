//! Real QuickJS/native class calls, using the public engine and host channel without a test UI.
use super::*;
use nsh_engine::{Bundle, Engine, EngineConfig, HostChannel, MountSink};
use std::sync::mpsc;

/// Explicit fixture assembly registered only in this Rust test module.
#[module]
struct BridgeFixture;
#[module]
impl BridgeFixture {
    /// Open core services against the test's own loopback upstream.
    pub async fn open(origin: String) -> Result<NativeSession, String> {
        let dir = data_dir().ok_or("test data directory missing")?;
        let task = background(async move {
            let services = Services {
                catalog: CatalogClient::for_loopback_tests(&origin).map_err(catalog_error)?,
                library: LibraryStore::open(dir.join("guest.sqlite3"))
                    .await
                    .map_err(library_error)?,
                playback: PlaybackService::with_services(
                    PlaybackClient::for_loopback_tests(&origin).map_err(playback_error)?,
                    MediaStore::for_loopback_tests(&dir, &origin).map_err(playback_error)?,
                ),
            };
            Session::with_services(services).await
        });
        let _cancel = AbortOnDrop(task.abort_handle());
        Ok(NativeSession {
            session: task
                .await
                .map_err(|_| "test worker stopped")?
                .map_err(|e| e.body.to_string())?,
        })
    }
    /// Observe the core's real lease boundary through an exported class argument.
    pub fn has_media(session: Instance<NativeSession>, path: String) -> bool {
        session.with(|session| {
            token(&path).is_some_and(|token| session.session.services.playback.lease(token).is_ok())
        })
    }
}

struct Sink(mpsc::Sender<Result<Value, String>>);
impl MountSink for Sink {
    fn submit(&self, _batch: nsh_core::MountBatch) {}
    fn report_error(&self, message: &str) {
        let _ = self.0.send(Err(message.to_owned()));
    }
}
fn run(scenario: &str, origin: &str, dir: Option<PathBuf>) -> Value {
    let (tx, rx) = mpsc::channel();
    let host = HostChannel::new();
    host.set_params(serde_json::Map::from_iter([
        ("scenario".into(), json!(scenario)),
        ("origin".into(), json!(origin)),
    ]));
    let answer = tx.clone();
    host.handle("result", move |call| {
        let _ = answer.send(Ok(call.data().clone()));
    });
    let mut registry = Registry::ui_set("hongguo-test/native");
    register(&mut registry);
    registry.module::<BridgeFixture>();
    let bundle = Bundle::source(include_str!("mixed_fixture.js").into())
        .with_app_id(Some("dev.hongguo.native-test"))
        .with_capabilities_json(Some(r#"{"host":["result"]}"#))
        .unwrap();
    let _engine = Engine::start(
        EngineConfig {
            data_dir: dir,
            ui_sets: vec![registry],
            runtime: Some(Handle::current()),
            host,
            ..EngineConfig::new(bundle)
        },
        || nsh_core::ApproxTextEngine,
        Sink(tx),
    )
    .unwrap();
    let result = rx
        .recv_timeout(Duration::from_secs(10))
        .expect("mixed call must settle")
        .expect("mixed engine must not throw");
    assert_eq!(result["ok"], true, "{result}");
    result
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_mixed_open_and_durable_library_use_host_directory() {
    let dir = temp_dir();
    run("library", "", Some(dir.clone()));
    let db = dir.join("dev.hongguo.native-test/guest.sqlite3");
    assert!(db.exists());
    let library = LibraryStore::open(db)
        .await
        .unwrap()
        .snapshot()
        .await
        .unwrap();
    assert_eq!(library.entries[0].position, Some(12.5));
    std::fs::remove_dir_all(dir).unwrap();
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_mixed_open_failure_preserves_original_database() {
    run("no-directory", "", None);
    let dir = temp_dir();
    let app_dir = dir.join("dev.hongguo.native-test");
    std::fs::create_dir_all(&app_dir).unwrap();
    std::fs::write(app_dir.join("guest.sqlite3"), b"original invalid database").unwrap();
    run("bad-database", "", Some(dir.clone()));
    assert_eq!(
        std::fs::read(app_dir.join("guest.sqlite3")).unwrap(),
        b"original invalid database"
    );
    std::fs::remove_dir_all(dir).unwrap();
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_mixed_pending_cancel_call_dispose_and_session_dispose_settle() {
    let fixture = Fixture::new(true).await;
    let dir = temp_dir();
    run("pending", &fixture.origin, Some(dir.clone()));
    std::fs::remove_dir_all(dir).unwrap();
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn real_mixed_ready_dispose_releases_and_accept_preserves_media() {
    let fixture = Fixture::new(false).await;
    let dir = temp_dir();
    run("media", &fixture.origin, Some(dir.clone()));
    std::fs::remove_dir_all(dir).unwrap();
}
