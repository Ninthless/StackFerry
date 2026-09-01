import { invoke } from "@tauri-apps/api/core";

export interface SkillsMigrationResult {
  count: number;
  error?: string;
}

export const migrationsApi = {
  getConfigMigrationResult(): Promise<boolean> {
    return invoke("get_migration_result");
  },

  getSkillsMigrationResult(): Promise<SkillsMigrationResult | null> {
    return invoke("get_skills_migration_result");
  },
};
