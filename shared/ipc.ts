export const IpcChannel = {
  listProviders: 'providers:list',
  listPresets: 'providers:presets',
  addProvider: 'providers:add',
  updateProvider: 'providers:update',
  deleteProvider: 'providers:delete',
  enableProvider: 'providers:enable',
  getStatus: 'app:status',
  changed: 'providers:changed',
} as const
