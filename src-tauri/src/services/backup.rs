use std::collections::HashSet;
use std::path::Path;

use crate::database::Database;
use crate::error::AppError;
use crate::infrastructure::persistence::{AgentInstance, BackupEntry};
use crate::services::credential_cleanup::CredentialCleanupService;

pub(crate) struct BackupService;

impl BackupService {
    fn reconcile_restored_credentials(
        db: &Database,
        before_instances: &[AgentInstance],
    ) -> Result<(), AppError> {
        let after_ids = CredentialCleanupService::snapshot_instances(db)?
            .into_iter()
            .map(|instance| instance.id)
            .collect::<HashSet<_>>();
        CredentialCleanupService::schedule_orphan_cleanup(db, before_instances, &after_ids)?;
        crate::credentials::CredentialIsolationService::resume_pending_resource_operations(db)
    }

    pub(crate) fn import_sql(db: &Database, source_path: &Path) -> Result<String, AppError> {
        let before_instances = CredentialCleanupService::snapshot_instances(db)?;
        let backup_id = db.import_sql(source_path)?;
        Self::reconcile_restored_credentials(db, &before_instances)?;
        Ok(backup_id)
    }

    pub(crate) fn import_sql_string_for_sync(db: &Database, sql: &str) -> Result<String, AppError> {
        let before_instances = CredentialCleanupService::snapshot_instances(db)?;
        let backup_id = db.import_sql_string_for_sync(sql)?;
        Self::reconcile_restored_credentials(db, &before_instances)?;
        Ok(backup_id)
    }

    pub(crate) fn restore(db: &Database, filename: &str) -> Result<String, AppError> {
        let before_instances = CredentialCleanupService::snapshot_instances(db)?;
        let safety_id = db.restore_from_backup(filename)?;
        Self::reconcile_restored_credentials(db, &before_instances)?;
        Ok(safety_id)
    }

    pub(crate) fn list() -> Result<Vec<BackupEntry>, AppError> {
        Database::list_backups()
    }

    pub(crate) fn rename(old_filename: &str, new_name: &str) -> Result<String, AppError> {
        Database::rename_backup(old_filename, new_name)
    }

    pub(crate) fn delete(filename: &str) -> Result<(), AppError> {
        Database::delete_backup(filename)
    }
}
