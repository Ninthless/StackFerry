use crate::services::pi_extension::{
    self, PiExtensionScope, PiInventory, PiPackageInstallResult, PiPackageSearchResult,
};

#[tauri::command]
pub async fn get_pi_extension_inventory(
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    pi_extension::get_inventory(project_dir)
}

#[tauri::command]
pub async fn search_pi_packages(
    query: String,
    offset: Option<u32>,
    limit: Option<u32>,
    project_dir: Option<String>,
) -> Result<PiPackageSearchResult, String> {
    pi_extension::search_packages(query, offset, limit, project_dir).await
}

#[tauri::command]
pub async fn register_pi_local_extension(
    path: String,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    tokio::task::spawn_blocking(move || {
        pi_extension::register_local_extension(path, scope, project_dir)
    })
    .await
    .map_err(|error| format!("Pi extension register task failed: {error}"))?
}

#[tauri::command]
pub async fn unregister_pi_local_extension(
    resource_key: String,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    tokio::task::spawn_blocking(move || {
        pi_extension::unregister_local_extension(resource_key, scope, project_dir)
    })
    .await
    .map_err(|error| format!("Pi extension unregister task failed: {error}"))?
}

#[tauri::command]
pub async fn install_pi_package(
    source: String,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiPackageInstallResult, String> {
    pi_extension::install_package(source, scope, project_dir).await
}

#[tauri::command]
pub async fn remove_pi_package(
    resource_key: String,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    pi_extension::remove_package(resource_key, scope, project_dir).await
}

#[tauri::command]
pub async fn set_pi_extension_enabled(
    resource_key: String,
    enabled: bool,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    tokio::task::spawn_blocking(move || {
        pi_extension::set_extension_enabled(resource_key, enabled, scope, project_dir)
    })
    .await
    .map_err(|error| format!("Pi extension toggle task failed: {error}"))?
}

#[tauri::command]
pub async fn set_pi_project_trust(
    project_dir: String,
    trusted: bool,
) -> Result<PiInventory, String> {
    tokio::task::spawn_blocking(move || pi_extension::set_project_trust(project_dir, trusted))
        .await
        .map_err(|error| format!("Pi project trust task failed: {error}"))?
}
