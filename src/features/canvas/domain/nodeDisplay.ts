import i18next from 'i18next';

import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
  type CanvasNodeType,
  type ExportImageNodeResultKind,
} from './canvasNodes';

const DEFAULT_NODE_DISPLAY_KEY: Record<CanvasNodeType, string> = {
  [CANVAS_NODE_TYPES.upload]: 'node.display.upload',
  [CANVAS_NODE_TYPES.imageEdit]: 'node.display.imageEdit',
  [CANVAS_NODE_TYPES.exportImage]: 'node.display.exportImage',
  [CANVAS_NODE_TYPES.textAnnotation]: 'node.display.textAnnotation',
  [CANVAS_NODE_TYPES.video]: 'node.display.video',
  [CANVAS_NODE_TYPES.videoPreview]: 'node.display.videoPreview',
  [CANVAS_NODE_TYPES.videoEditor]: 'node.display.videoEditor',
  [CANVAS_NODE_TYPES.audio]: 'node.display.audio',
  [CANVAS_NODE_TYPES.audioPreview]: 'node.display.audioPreview',
  [CANVAS_NODE_TYPES.videoStoryboard]: 'node.display.videoStoryboard',
  [CANVAS_NODE_TYPES.group]: 'node.display.group',
  [CANVAS_NODE_TYPES.storyboardSplit]: 'node.display.storyboardSplit',
  [CANVAS_NODE_TYPES.storyboardGen]: 'node.display.storyboardGen',
  [CANVAS_NODE_TYPES.chat]: 'node.display.chat',
};

const DEFAULT_NODE_DISPLAY_FALLBACK: Record<CanvasNodeType, string> = {
  [CANVAS_NODE_TYPES.upload]: 'Upload Image',
  [CANVAS_NODE_TYPES.imageEdit]: 'AI Image',
  [CANVAS_NODE_TYPES.exportImage]: 'Result Image',
  [CANVAS_NODE_TYPES.textAnnotation]: 'Text Node',
  [CANVAS_NODE_TYPES.video]: 'Video Node',
  [CANVAS_NODE_TYPES.videoPreview]: 'Video Preview',
  [CANVAS_NODE_TYPES.videoEditor]: 'Video Editor',
  [CANVAS_NODE_TYPES.audio]: 'Audio Node',
  [CANVAS_NODE_TYPES.audioPreview]: 'Audio Preview',
  [CANVAS_NODE_TYPES.videoStoryboard]: 'Video Storyboard',
  [CANVAS_NODE_TYPES.group]: 'Group',
  [CANVAS_NODE_TYPES.storyboardSplit]: 'Storyboard',
  [CANVAS_NODE_TYPES.storyboardGen]: 'Storyboard Generation',
  [CANVAS_NODE_TYPES.chat]: 'AI Chat',
};

const EXPORT_RESULT_DISPLAY_KEY: Record<ExportImageNodeResultKind, string> = {
  generic: 'node.display.exportImage',
  storyboardGenOutput: 'node.display.storyboardGenOutput',
  storyboardSplitExport: 'node.display.storyboardSplitExport',
  storyboardFrameEdit: 'node.display.storyboardFrameEdit',
};

const EXPORT_RESULT_DISPLAY_FALLBACK: Record<ExportImageNodeResultKind, string> = {
  generic: 'Result Image',
  storyboardGenOutput: 'Storyboard Output',
  storyboardSplitExport: 'Storyboard Export',
  storyboardFrameEdit: 'Storyboard Frame',
};

export const DEFAULT_NODE_DISPLAY_NAME: Record<CanvasNodeType, string> = DEFAULT_NODE_DISPLAY_FALLBACK;
export const EXPORT_RESULT_DISPLAY_NAME: Record<ExportImageNodeResultKind, string> = EXPORT_RESULT_DISPLAY_FALLBACK;

function translateLabel(key: string, fallback: string): string {
  return i18next.t(key, { defaultValue: fallback });
}

function resolveExportResultKind(data: Partial<CanvasNodeData>): ExportImageNodeResultKind {
  return (data as { resultKind?: ExportImageNodeResultKind }).resultKind ?? 'generic';
}

function resolveFallbackDefault(type: CanvasNodeType, data: Partial<CanvasNodeData>): string {
  if (type === CANVAS_NODE_TYPES.exportImage) {
    const resultKind = resolveExportResultKind(data);
    return EXPORT_RESULT_DISPLAY_FALLBACK[resultKind];
  }
  return DEFAULT_NODE_DISPLAY_FALLBACK[type];
}

export function getDefaultNodeDisplayName(
  type: CanvasNodeType,
  data: Partial<CanvasNodeData>
): string {
  if (type === CANVAS_NODE_TYPES.exportImage) {
    const resultKind = resolveExportResultKind(data);
    return translateLabel(
      EXPORT_RESULT_DISPLAY_KEY[resultKind],
      EXPORT_RESULT_DISPLAY_FALLBACK[resultKind]
    );
  }

  return translateLabel(DEFAULT_NODE_DISPLAY_KEY[type], DEFAULT_NODE_DISPLAY_FALLBACK[type]);
}

function resolveRawNodeTitle(type: CanvasNodeType, data: Partial<CanvasNodeData>): string {
  const customTitle = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  if (customTitle) {
    return customTitle;
  }

  if (type === CANVAS_NODE_TYPES.group) {
    const legacyLabel =
      typeof (data as { label?: string }).label === 'string'
        ? (data as { label?: string }).label?.trim()
        : '';
    if (legacyLabel) {
      return legacyLabel;
    }
  }

  return '';
}

export function resolveNodeDisplayName(
  type: CanvasNodeType,
  data: Partial<CanvasNodeData>
): string {
  const defaultDisplayName = getDefaultNodeDisplayName(type, data);
  const rawTitle = resolveRawNodeTitle(type, data);
  if (!rawTitle) {
    return defaultDisplayName;
  }

  const fallbackDisplayName = resolveFallbackDefault(type, data);
  if (rawTitle === fallbackDisplayName || rawTitle === defaultDisplayName) {
    return defaultDisplayName;
  }

  return rawTitle;
}

export function isNodeUsingDefaultDisplayName(
  type: CanvasNodeType,
  data: Partial<CanvasNodeData>
): boolean {
  const rawTitle = resolveRawNodeTitle(type, data);
  if (!rawTitle) {
    return true;
  }

  const localizedDefault = getDefaultNodeDisplayName(type, data);
  const fallbackDefault = resolveFallbackDefault(type, data);
  return rawTitle === localizedDefault || rawTitle === fallbackDefault;
}
