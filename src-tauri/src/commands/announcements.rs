use crate::services::announcements::{AnnouncementFeed, AnnouncementService};

#[tauri::command]
pub async fn get_announcements(language: String) -> Result<AnnouncementFeed, String> {
    AnnouncementService::get_feed(&language, false).await
}

#[tauri::command]
pub async fn refresh_announcements(language: String) -> Result<AnnouncementFeed, String> {
    AnnouncementService::get_feed(&language, true).await
}

#[tauri::command]
pub async fn mark_announcement_read(id: String) -> Result<(), String> {
    AnnouncementService::mark_read(&id).await
}

#[tauri::command]
pub async fn mark_all_announcements_read() -> Result<(), String> {
    AnnouncementService::mark_all_read().await
}

#[tauri::command]
pub async fn dismiss_announcement(id: String) -> Result<(), String> {
    AnnouncementService::dismiss(&id).await
}

#[tauri::command]
pub async fn acknowledge_announcement(id: String) -> Result<(), String> {
    AnnouncementService::acknowledge(&id).await
}
