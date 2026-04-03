import { invoke, isTauri } from '@tauri-apps/api/core';

export function ensureTauri(command: string): void {
  if (!isTauri()) {
    throw new Error(`Command "${command}" requires a Tauri runtime.`);
  }
}

export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  ensureTauri(command);
  return await invoke<T>(command, args);
}
