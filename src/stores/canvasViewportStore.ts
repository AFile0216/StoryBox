import type { Viewport } from '@xyflow/react';
import { create } from 'zustand';

interface CanvasViewportState {
  currentViewport: Viewport;
  canvasViewportSize: { width: number; height: number };
  setViewportState: (viewport: Viewport) => void;
  setCanvasViewportSize: (size: { width: number; height: number }) => void;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export const useCanvasViewportStore = create<CanvasViewportState>((set) => ({
  currentViewport: DEFAULT_VIEWPORT,
  canvasViewportSize: { width: 0, height: 0 },

  setViewportState: (viewport) => {
    set({ currentViewport: viewport });
  },

  setCanvasViewportSize: (size) => {
    set({ canvasViewportSize: size });
  },
}));
