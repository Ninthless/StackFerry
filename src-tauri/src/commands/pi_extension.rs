use crate::services::pi_extension::{
    self, PiInventory, PiPackageInstallResult, PiPackageSearchResult,
};

#[tauri::command]
pub async fn get_pi_extension_inventory() -> Result<PiInventory, String> {
    Ok(pi_extension::get_inventory())
}

#[tauri::command]
pub async fn search_pi_packages(
    query: String,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<PiPackageSearchResult, String> {
    pi_extension::search_packages(query, offset, limit).await
}

#[tauri::command]
pub async fn register_pi_local_extension(path: String) -> Result<PiInventory, String> {
    tokio::task::spawn_blocking(move || pi_extension::register_local_extension(path))
        .await
        .map_err(|error| format!("Pi extension register task failed: {error}"))?
}

#[tauri::command]
pub async fn unregister_pi_local_extension(path: String) -> Result<PiInventory, String> {
    tokio::task::spawn_blocking(move || pi_extension::unregister_local_extension(path))
        .await
        .map_err(|error| format!("Pi extension unregister task failed: {error}"))?
}

#[tauri::command]
pub async fn install_pi_package(source: String) -> Result<PiPackageInstallResult, String> {
    pi_extension::install_package(source).await
}

#[tauri::command]
pub async fn remove_pi_package(source: String) -> Result<PiInventory, String> {
    pi_extension::remove_package(source).await
}

#[tauri::command]
pub async fn set_pi_extension_enabled(id: String, enabled: bool) -> Result<PiInventory, String> {
    tokio::task::spawn_blocking(move || pi_extension::set_extension_enabled(id, enabled))
        .await
        .map_err(|error| format!("Pi extension toggle task failed: {error}"))?
}
