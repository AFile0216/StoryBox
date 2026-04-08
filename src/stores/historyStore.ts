import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface HistoryRecord {
  id: string;
  nodeId: string;
  imageUrl: string;
  prompt: string;
  model: string;
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
        // deduplicate by node ID + image URL to prevent spam
        if (state.records.some((r) => r.nodeId === record.nodeId && r.imageUrl === record.imageUrl)) {
          return state;
        }
        return { records: [newRecord, ...state.records].slice(0, 100) }; // keep last 100
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
