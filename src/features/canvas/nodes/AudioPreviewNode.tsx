import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { open } from '@tauri-apps/plugin-dialog';
import { Headphones, Music4 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TYPES, type AudioPreviewNodeData } from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import {
  resolveAdaptiveHandleStyle,
  resolveResponsiveNodeClasses,
} from '@/features/canvas/ui/nodeMetrics';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
import { useCanvasStore } from '@/stores/canvasStore';

type AudioPreviewNodeProps = NodeProps & {
  id: string;
  data: AudioPreviewNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 300;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 900;

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '--:--';
  }
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const AudioPreviewNode = memo(({ id, data, selected, width, height }: AudioPreviewNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.audioPreview, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const uiDensity = useMemo(
    () => resolveResponsiveNodeClasses(resolvedWidth, resolvedHeight),
    [resolvedHeight, resolvedWidth]
  );
  const infoGridClass = resolvedWidth < 560 ? 'grid-cols-1' : 'grid-cols-2';
  const targetHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left'),
    [resolvedHeight, resolvedWidth]
  );
  const sourceHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right'),
    [resolvedHeight, resolvedWidth]
  );
  const audioSrc = useMemo(
    () => (data.filePath ? resolveLocalAssetUrl(data.filePath) : null),
    [data.filePath]
  );

  const handlePickAudio = async () => {
    const selectedPath = await open({
      multiple: false,
      filters: [
        {
          name: 'Audio',
          extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
        },
      ],
    });
    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }
    const normalizedPath = selectedPath.trim();
    const fileName = normalizedPath.split(/[/\\]/u).pop() ?? normalizedPath;
    updateNodeData(id, {
      filePath: normalizedPath,
      sourceFileName: fileName,
      durationSec: null,
    });
  };

  return (
    <div
      className={`tapnow-node-card group relative flex h-full flex-col overflow-visible p-2 transition-colors duration-150 ${
        selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'
      }`}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Music4 className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <div className={`mt-6 flex min-h-0 flex-1 flex-col ${uiDensity.stackGap}`}>
        <div className="flex items-center justify-between gap-2">
          <div className={`tapnow-node-pill px-2 py-1 uppercase tracking-[0.12em] ${uiDensity.metaText}`}>
            {t('node.audio.title', { defaultValue: 'Audio' })}
          </div>
          <button
            type="button"
            className={`tapnow-node-button px-2 py-1 ${uiDensity.metaText}`}
            onClick={(event) => {
              event.stopPropagation();
              void handlePickAudio();
            }}
          >
            {data.filePath
              ? t('node.media.changeFile', { defaultValue: 'Change File' })
              : t('node.media.selectFile', { defaultValue: 'Select File' })}
          </button>
        </div>

        <div className="tapnow-node-surface flex min-h-0 flex-1 items-center p-4">
          {audioSrc ? (
            <audio
              src={audioSrc}
              controls
              className="w-full"
              onLoadedMetadata={(event) => {
                const durationSec = Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : null;
                updateNodeData(id, { durationSec });
              }}
            />
          ) : (
            <div className="flex h-[88px] w-full flex-col items-center justify-center gap-2 text-text-muted">
              <Headphones className="h-8 w-8 opacity-60" />
              <span className="text-sm">
                {t('node.audio.empty', { defaultValue: 'Select a local audio file to preview.' })}
              </span>
            </div>
          )}
        </div>

        <div className={`grid ${uiDensity.sectionGap} ${infoGridClass}`}>
          <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {t('node.video.file', { defaultValue: 'File' })}
            </div>
            <div className="mt-1 truncate text-sm text-text-dark">
              {data.sourceFileName || t('node.media.notSelected', { defaultValue: 'Not selected' })}
            </div>
          </div>
          <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {t('node.audio.duration', { defaultValue: 'Duration' })}
            </div>
            <div className="mt-1 text-sm text-text-dark">{formatSeconds(data.durationSec)}</div>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className="!border-surface-dark !bg-accent"
        style={targetHandleStyle}
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!border-surface-dark !bg-accent"
        style={sourceHandleStyle}
      />

      <NodeResizeHandle
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        maxWidth={MAX_WIDTH}
        maxHeight={MAX_HEIGHT}
      />
    </div>
  );
});

AudioPreviewNode.displayName = 'AudioPreviewNode';
