//! The operator workflow works with persisted files and HTTP, without a database.
use orbit_application::announcements::FeedStore;
use orbit_storage_assets::{AssetConfig, announcements::AnnouncementStorage};
use std::{path::Path, process::Command, sync::Arc};
fn run(directory: &Path, args: &[&str]) -> serde_json::Value {
    let output = Command::new(env!("CARGO_BIN_EXE_orbit"))
        .env_remove("DATABASE_URL")
        .env("ORBIT_ASSET_STORE", "files")
        .env("ORBIT_ASSET_DIRECTORY", directory)
        .args(["announcements"])
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}
#[tokio::test]
async fn operator_can_publish_edit_withdraw_restore_and_serve_without_a_database() {
    let root = std::env::temp_dir().join(format!("orbit-news-cli-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let directory = root.join("assets");
    let file = root.join("news.md");
    let source = "---\nid: research\ntitle: New research\ndate: '2026-11-07T12:00:00Z'\n---\nResearch together.\n";
    std::fs::write(&file, source).unwrap();
    let first = run(&directory, &["publish", file.to_str().unwrap()]);
    assert_eq!(first["count"], 1);
    let listed = run(&directory, &["list"]);
    assert_eq!(listed["announcements"][0]["body"], "Research together.");
    std::fs::write(
        &file,
        source.replace("Research together.", "Corrected copy."),
    )
    .unwrap();
    run(&directory, &["publish", file.to_str().unwrap()]);
    assert_eq!(
        run(&directory, &["list"])["announcements"][0]["body"],
        "Corrected copy."
    );
    run(&directory, &["withdraw", "research"]);
    assert_eq!(
        run(&directory, &["list"])["announcements"],
        serde_json::json!([])
    );
    run(
        &directory,
        &["restore", first["revision"].as_str().unwrap()],
    );
    let storage = AnnouncementStorage::connect(&AssetConfig::Files {
        directory: directory.to_str().unwrap().into(),
    })
    .await
    .unwrap();
    let expected = serde_json::to_value(storage.load().await.unwrap()).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(
            listener,
            orbit_transport_http::announcement_router(Arc::new(storage)),
        )
        .await
        .unwrap();
    });
    let response = reqwest::get(format!("http://{address}/api/announcements"))
        .await
        .unwrap();
    assert!(response.status().is_success());
    assert_eq!(
        response.json::<serde_json::Value>().await.unwrap(),
        expected
    );
    server.abort();
    assert!(server.await.unwrap_err().is_cancelled());
    std::fs::remove_dir_all(root).unwrap();
}
