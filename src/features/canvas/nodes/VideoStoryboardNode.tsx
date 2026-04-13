import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clapperboard, PenLine, Video } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

import { StoryboardEditorModal } from '@/features/canvas/ui/StoryboardEditorModal';

import {
  CANVAS_NODE_TYPES,
  type CanvasNodeType,
  type StoryboardGenNodeData,
  type VideoStoryboardNodeData,
  type VideoStoryboardSegment,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { NodeMaterialStrip } from '@/features/canvas/ui/NodeMaterialStrip';
import {
  resolveAdaptiveHandleStyle,
  resolveResponsiveNodeClasses,
} from '@/features/canvas/ui/nodeMetrics';
import { resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
import { useCanvasStore } from '@/stores/canvasStore';

type VideoStoryboardNodeProps = NodeProps & {
  id: string;
  data: VideoStoryboardNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 560;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 420;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '--:--';
  }
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatSecondsLabel(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '0.0s';
  }
  return `${Math.max(0, value).toFixed(1)}s`;
}

function formatSegmentRange(startSec: number, endSec: number): string {
  return `${formatSecondsLabel(startSec)}-${formatSecondsLabel(endSec)}`;
}

function sortSegments(segments: VideoStoryboardSegment[]): VideoStoryboardSegment[] {
  return [...segments]
    .sort((left, right) => {
      if (left.startSec !== right.startSec) {
        return left.startSec - right.startSec;
      }
      return left.order - right.order;
    })
    .map((segment, index) => ({
      ...segment,
      order: index,
    }));
}

function resolveStoryboardGrid(count: number): { rows: number; cols: number } {
  if (count <= 1) {
    return { rows: 1, cols: 1 };
  }

  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { rows, cols };
}

function buildStoryboardFrames(segments: VideoStoryboardSegment[], total: number) {
  const ordered = sortSegments(segments);
  return Array.from({ length: total }, (_, index) => {
    const segment = ordered[index];
    const timePrefix = segment
      ? `[${formatSegmentRange(segment.startSec, segment.endSec)}]\n`
      : '';
    const detailLines = segment
      ? [
          segment.visualDesc ? `画面: ${segment.visualDesc}` : '',
          segment.dialogue ? `对白: ${segment.dialogue}` : '',
          segment.notes ? `备注: ${segment.notes}` : '',
          segment.keyframeReference ? `关键帧提取: ${segment.keyframeReference}` : '',
        ].filter(Boolean)
      : [];
    const description = segment
      ? `${timePrefix}${detailLines.join('\n') || segment.text || ''}`.trim()
      : '';
    return {
      id: `storyboard-frame-${index + 1}`,
      description,
      referenceIndex: null,
    };
  });
}

export const VideoStoryboardNode = memo(({
  id,
  data,
  selected,
  width,
  height,
}: VideoStoryboardNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const findNodePosition = useCanvasStore((state) => state.findNodePosition);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playheadSec, setPlayheadSec] = useState(data.currentTimeSec ?? 0);
  const [editorOpen, setEditorOpen] = useState(false);
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.videoStoryboard, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const targetHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left'),
    [resolvedHeight, resolvedWidth]
  );
  const sourceHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right'),
    [resolvedHeight, resolvedWidth]
  );
  const uiDensity = useMemo(
    () => resolveResponsiveNodeClasses(resolvedWidth, resolvedHeight),
    [resolvedHeight, resolvedWidth]
  );
  const videoSrc = useMemo(
    () => (data.filePath ? resolveLocalAssetUrl(data.filePath) : null),
    [data.filePath]
  );
  const linkedStoryboardGenNode = useMemo(() => {
    if (data.linkedStoryboardGenNodeId) {
      return nodes.find((node) => node.id === data.linkedStoryboardGenNodeId) ?? null;
    }

    const viaEdge = edges.find((edge) => edge.source === id)
      ? nodes.find((node) =>
        node.type === CANVAS_NODE_TYPES.storyboardGen
        && edges.some((edge) => edge.source === id && edge.target === node.id)
      )
      : null;
    if (viaEdge) {
      return viaEdge;
    }

    return nodes.find((node) =>
      node.type === CANVAS_NODE_TYPES.storyboardGen
      && (node.data as StoryboardGenNodeData).sourceStoryboardNodeId === id
    ) ?? null;
  }, [data.linkedStoryboardGenNodeId, edges, id, nodes]);

  useEffect(() => {
    if (linkedStoryboardGenNode) {
      if (data.linkedStoryboardGenNodeId !== linkedStoryboardGenNode.id) {
        updateNodeData(id, { linkedStoryboardGenNodeId: linkedStoryboardGenNode.id });
      }
      if (!edges.some((edge) => edge.source === id && edge.target === linkedStoryboardGenNode.id)) {
        addEdge(id, linkedStoryboardGenNode.id, {
          relation: 'storyboard-map',
          autoGenerated: true,
          data: {
            label: 'Storyboard',
            lineStyle: 'dashed',
          },
        });
      }
      return;
    }

    const nextPosition = findNodePosition(id, 520, 520);
    const nextNodeId = addNode(CANVAS_NODE_TYPES.storyboardGen as CanvasNodeType, nextPosition, {
      displayName: `${resolvedTitle} Grid`,
      sourceStoryboardNodeId: id,
    });
    addEdge(id, nextNodeId, {
      relation: 'storyboard-map',
      autoGenerated: true,
      data: {
        label: 'Storyboard',
        lineStyle: 'dashed',
      },
    });
    updateNodeData(id, { linkedStoryboardGenNodeId: nextNodeId });
  }, [
    addEdge,
    addNode,
    data.linkedStoryboardGenNodeId,
    edges,
    findNodePosition,
    id,
    linkedStoryboardGenNode,
    resolvedTitle,
    updateNodeData,
  ]);

  const handleSyncToStoryboard = useCallback(() => {
    if (!linkedStoryboardGenNode || linkedStoryboardGenNode.type !== CANVAS_NODE_TYPES.storyboardGen) return;
    const orderedSegments = sortSegments(data.segments);
    const grid = resolveStoryboardGrid(Math.max(orderedSegments.length, 1));
    const total = grid.rows * grid.cols;
    const frames = buildStoryboardFrames(orderedSegments, total);
    updateNodeData(linkedStoryboardGenNode.id, {
      gridRows: grid.rows,
      gridCols: grid.cols,
      frames,
      sourceStoryboardNodeId: id,
      syncedFromStoryboardAt: Date.now(),
    });
  }, [data.segments, id, linkedStoryboardGenNode, updateNodeData]);
  const handlePickVideo = async () => {
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'] }],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    const normalizedPath = selectedPath.trim();
    const fileName = normalizedPath.split(/[/\\]/u).pop() ?? normalizedPath;
    updateNodeData(id, {
      filePath: normalizedPath,
      sourceFileName: fileName,
      currentTimeSec: 0,
      activeSegmentId: null,
      draftText: '',
    });
    setPlayheadSec(0);
  };

  const handleSaveSegments = useCallback((nextSegments: VideoStoryboardSegment[]) => {
    updateNodeData(id, { segments: nextSegments });
  }, [id, updateNodeData]);

  return (
    <>
      <div
        className={`
          tapnow-node-card group relative flex h-full flex-col overflow-visible p-2 transition-colors duration-150
          ${selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'}
        `}
        style={{ width: resolvedWidth, height: resolvedHeight }}
        onClick={() => setSelectedNode(id)}
        onDoubleClick={(event) => { event.stopPropagation(); setEditorOpen(true); }}
      >
        <NodeHeader
          className={NODE_HEADER_FLOATING_POSITION_CLASS}
          icon={<Clapperboard className="h-4 w-4" />}
          titleText={resolvedTitle}
          editable
          onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
        />

        <NodeMaterialStrip nodeId={id} className="mt-6" />

        <div className="mb-2 mt-2 flex items-center justify-between gap-2">
          <div className={`tapnow-node-pill px-2 py-1 uppercase tracking-[0.12em] ${uiDensity.metaText}`}>
            {t('node.videoStoryboard.title')}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={`tapnow-node-button px-2 py-1 ${uiDensity.metaText}`}
              onClick={(event) => { event.stopPropagation(); void handlePickVideo(); }}
            >
              {data.filePath ? t('node.media.changeFile') : t('node.media.selectFile')}
            </button>
            <button
              type="button"
              className={`tapnow-node-button inline-flex items-center gap-1 px-2 py-1 ${uiDensity.metaText}`}
              onClick={(event) => { event.stopPropagation(); setEditorOpen(true); }}
            >
              <PenLine className="h-3 w-3" />
              {t('node.videoStoryboard.openEditor', { defaultValue: '编辑分镜' })}
            </button>
            {linkedStoryboardGenNode && (
              <button
                type="button"
                className={`tapnow-node-button inline-flex items-center gap-1 px-2 py-1 ${uiDensity.metaText}`}
                title={t('node.videoStoryboard.syncToGenHint', { defaultValue: '将分镜内容同步到生成节点（会覆盖生成节点的手动编辑）' })}
                onClick={(event) => { event.stopPropagation(); handleSyncToStoryboard(); }}
              >
                {t('node.videoStoryboard.syncToGen', { defaultValue: '同步分镜' })}
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="tapnow-node-surface relative min-h-[180px] flex-1 overflow-hidden">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                className="h-full w-full object-contain"
                onLoadedMetadata={(event) => {
                  const nextDurationSec = Number.isFinite(event.currentTarget.duration)
                    ? event.currentTarget.duration
                    : null;
                  updateNodeData(id, { durationSec: nextDurationSec });
                  event.currentTarget.currentTime = data.currentTimeSec ?? 0;
                }}
                onTimeUpdate={(event) => setPlayheadSec(event.currentTarget.currentTime)}
                onPause={(event) => updateNodeData(id, { currentTimeSec: event.currentTarget.currentTime })}
              />
            ) : (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-text-muted">
                <Video className="h-8 w-8 opacity-60" />
                <span className="px-4 text-center text-sm">{t('node.videoStoryboard.empty')}</span>
              </div>
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                {t('node.videoStoryboard.currentTime')}
              </div>
              <div className="mt-1 text-sm text-text-dark">{formatSeconds(playheadSec)}</div>
            </div>
            <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                {t('node.videoStoryboard.segmentList')}
              </div>
              <div className="mt-1 text-sm text-text-dark">
                {t('node.videoStoryboard.segmentCount', { count: data.segments.length })}
              </div>
            </div>
            <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
              <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                {t('node.videoStoryboard.duration')}
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

      {editorOpen && createPortal(
        <StoryboardEditorModal
          nodeId={id}
          filePath={data.filePath ?? null}
          durationSec={data.durationSec ?? 0}
          segments={data.segments}
          onSave={handleSaveSegments}
          onClose={() => setEditorOpen(false)}
        />,
        document.body
      )}
    </>
  );
});

VideoStoryboardNode.displayName = 'VideoStoryboardNode';
