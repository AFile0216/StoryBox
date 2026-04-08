import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface HistoryRecord {
  id: string;
  nodeId: string;
  type?: 'image' | 'video' | 'text';
  imageUrl?: string;
  mediaUrl?: string;
  prompt: string;
  model: string;
  outputText?: string;
  createdAt: number;
  filePath?: string;
}

interface HistoryStore {
  records: HistoryRecord[];
  addRecord: (record: Omit<HistoryRecord, 'id' | 'createdAt'>) => void;
  removeRecord: (id: string) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set) => ({
      records: [],
      addRecord: (record) => set((state) => {
        const newRecord: HistoryRecord = {
          ...record,
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
        };
        const dedupeKey =
          record.mediaUrl
          || record.imageUrl
          || record.outputText
          || record.prompt
          || '';
        if (state.records.some((r) => {
          const candidate =
            r.mediaUrl
            || r.imageUrl
            || r.outputText
            || r.prompt
            || '';
          return r.nodeId === record.nodeId && candidate === dedupeKey;
        })) {
          return state;
        }
        return { records: [newRecord, ...state.records].slice(0, 200) };
      }),
      removeRecord: (id) => set((state) => ({
        records: state.records.filter((r) => r.id !== id),
      })),
      clearHistory: () => set({ records: [] }),
    }),
    {
      name: 'storybox-history',
    }
  )
);
