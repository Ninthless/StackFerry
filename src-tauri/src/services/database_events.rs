use std::sync::Arc;

use crate::infrastructure::events::{self, DatabaseChangeNotifier};

struct AutoSyncDatabaseChangeNotifier;

impl DatabaseChangeNotifier for AutoSyncDatabaseChangeNotifier {
    fn notify_changed(&self, table: &str) {
        crate::services::webdav_auto_sync::notify_db_changed(table);
        crate::services::s3_auto_sync::notify_db_changed(table);
    }
}

pub(crate) fn install_auto_sync_database_notifier() {
    let _ = events::install_database_change_notifier(Arc::new(AutoSyncDatabaseChangeNotifier));
}
