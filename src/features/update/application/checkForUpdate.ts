import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { checkAppVersion } from '@/commands/app';
import { useSettingsStore } from '@/stores/settingsStore';

const VERSION_SUPPRESSION_STORAGE_KEY = 'storyboard:update-check:version-suppressions';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion?: string;
  currentVersion?: string;
  latestUrl?: string;
  error?: 'network' | 'unknown';
}

type VersionSuppressionMode = 'today' | 'forever';

interface VersionSuppressionRecord {
  mode: VersionSuppressionMode;
  dayKey?: string;
}

type VersionSuppressionMap = Record<string, VersionSuppressionRecord>;

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function getLocalDateKey(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readVersionSuppressions(): VersionSuppressionMap {
  try {
    const raw = localStorage.getItem(VERSION_SUPPRESSION_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<VersionSuppressionMap>(
      (acc, [version, value]) => {
        if (!version || typeof value !== 'object' || value === null) {
          return acc;
        }
        const mode = (value as { mode?: unknown }).mode;
        if (mode !== 'today' && mode !== 'forever') {
          return acc;
        }
        const dayKey = (value as { dayKey?: unknown }).dayKey;
        acc[version] = {
          mode,
          dayKey: typeof dayKey === 'string' ? dayKey : undefined,
        };
        return acc;
      },
      {}
    );
  } catch {
    return {};
  }
}

function writeVersionSuppressions(map: VersionSuppressionMap): void {
  try {
    localStorage.setItem(VERSION_SUPPRESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

export function suppressUpdateVersion(version: string, mode: VersionSuppressionMode): void {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return;
  }

  const map = readVersionSuppressions();
  map[normalized] =
    mode === 'today'
      ? {
          mode: 'today',
          dayKey: getLocalDateKey(new Date()),
        }
      : { mode: 'forever' };

  writeVersionSuppressions(map);
}

export function isUpdateVersionSuppressed(version: string): boolean {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return false;
  }

  const map = readVersionSuppressions();
  const record = map[normalized];
  if (!record) {
    return false;
  }

  if (record.mode === 'forever') {
    return true;
  }

  return record.dayKey === getLocalDateKey(new Date());
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    normalizeVersion(value)
      .split('-')[0]
      ?.split('.')
      .map((part) => Number.parseInt(part, 10) || 0) ?? [];

  const leftParts = parse(left);
  const rightParts = parse(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const currentVersion = normalizeVersion(await getVersion());
    if (!currentVersion) {
      return { hasUpdate: false };
    }

    const { versionFeed } = useSettingsStore.getState();

    if (isTauri()) {
      try {
        const result = await checkAppVersion({
          source: versionFeed.source,
          githubRepo: versionFeed.githubRepo,
          customFeedUrl: versionFeed.customFeedUrl,
        });
        return {
          hasUpdate: result.hasUpdate,
          latestVersion: result.latestVersion ?? undefined,
          currentVersion: result.currentVersion ?? currentVersion,
          latestUrl: result.latestUrl ?? undefined,
        };
      } catch {
        return { hasUpdate: false, error: 'network' };
      }
    }

    const response = await fetch(versionFeed.customFeedUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return { hasUpdate: false, error: 'network' };
    }

    const data = (await response.json()) as { version?: string; url?: string };
    const latestVersion = normalizeVersion(data.version ?? '');
    if (!latestVersion) {
      return { hasUpdate: false };
    }

    return {
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      latestVersion,
      currentVersion,
      latestUrl: data.url,
    };
  } catch {
    return { hasUpdate: false, error: 'unknown' };
  }
}
