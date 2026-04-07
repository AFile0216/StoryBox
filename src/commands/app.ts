import { invokeTauri } from '@/lib/tauri';
import type {
  AppVersionCheckResult,
  BootstrapAppResult,
  PersistedAppSettings,
  ProviderHealthCheckResult,
  ProviderKind,
  VersionFeedSource,
} from '@/types/app';

export async function bootstrapApp(): Promise<BootstrapAppResult> {
  return await invokeTauri<BootstrapAppResult>('bootstrap_app');
}

export async function loadAppSettings(): Promise<PersistedAppSettings | null> {
  return await invokeTauri<PersistedAppSettings | null>('load_app_settings');
}

export async function saveAppSettings(settings: PersistedAppSettings): Promise<void> {
  await invokeTauri('save_app_settings', { settings });
}

export async function checkProviderHealth(
  providerKind: ProviderKind,
  baseUrl: string
): Promise<ProviderHealthCheckResult> {
  return await invokeTauri<ProviderHealthCheckResult>('check_provider_health', {
    providerKind,
    baseUrl,
  });
}

export async function checkAppVersion(options: {
  source: VersionFeedSource;
  githubRepo?: string;
  customFeedUrl?: string;
}): Promise<AppVersionCheckResult> {
  return await invokeTauri<AppVersionCheckResult>('check_app_version', options);
}
