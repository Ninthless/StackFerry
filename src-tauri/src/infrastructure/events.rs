use std::sync::{Arc, OnceLock};

pub trait DatabaseChangeNotifier: Send + Sync {
    fn notify_changed(&self, table: &str);
}

static DATABASE_CHANGE_NOTIFIER: OnceLock<Arc<dyn DatabaseChangeNotifier>> = OnceLock::new();

pub fn install_database_change_notifier(
    notifier: Arc<dyn DatabaseChangeNotifier>,
) -> Result<(), Arc<dyn DatabaseChangeNotifier>> {
    DATABASE_CHANGE_NOTIFIER.set(notifier)
}

pub fn notify_database_changed(table: &str) {
    if let Some(notifier) = DATABASE_CHANGE_NOTIFIER.get() {
        notifier.notify_changed(table);
    }
}
