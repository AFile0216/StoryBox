import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { open } from '@tauri-apps/plugin-dialog';
import { createPortal } from 'react-dom';
import { Clapperboard, Film, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
  type StoryboardSplitNodeData,
  type VideoEditorNodeData,
  type VideoEditorTimelineClip,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { resolveAdaptiveHandleStyle, resolveResponsiveNodeClasses } from '@/features/canvas/ui/nodeMetrics';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { resolveLocalAssetUrl } from '@/features/canvas/application/imageData';
import { graphImageResolver } from '@/features/canvas/application/canvasServices';
import { VideoEditorModal, type VideoEditorSourceClipItem } from '@/features/canvas/ui/VideoEditorModal';
import { useCanvasStore } from '@/stores/canvasStore';

type VideoEditorNodeProps = NodeProps & {
  id: string;
  data: VideoEditorNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT = 430;
const MIN_WIDTH = 420;
const MIN_HEIGHT = 300;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;

function collectIncomingStoryboardClips(
  nodeId: string,
  nodes: CanvasNode[],
  edges: { source: string; target: string }[]
): VideoEditorSourceClipItem[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceNodeIds = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => edge.source);

  const clips: VideoEditorSourceClipItem[] = [];
  for (const sourceNodeId of sourceNodeIds) {
    const sourceNode = nodeById.get(sourceNodeId);
    if (!sourceNode || sourceNode.type !== CANVAS_NODE_TYPES.storyboardSplit) {
      continue;
    }

    const sourceData = sourceNode.data as StoryboardSplitNodeData;
    const sourceName = typeof sourceData.displayName === 'string' && sourceData.displayName.trim()
      ? sourceData.displayName.trim()
      : '分镜';
    const orderedFrames = [...sourceData.frames].sort((left, right) => left.order - right.order);
    orderedFrames.forEach((frame, index) => {
      if (!frame.imageUrl && !frame.previewImageUrl) {
        return;
      }
      clips.push({
        id: `${sourceNode.id}:${frame.id}`,
        label: `${sourceName} ${index + 1}`,
        imageUrl: frame.imageUrl,
        previewImageUrl: frame.previewImageUrl ?? frame.imageUrl ?? null,
      });
    });
  }

  const deduped = new Map<string, VideoEditorSourceClipItem>();
  for (const clip of clips) {
    if (!deduped.has(clip.id)) {
      deduped.set(clip.id, clip);
    }
  }
  return [...deduped.values()];
}

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    return '--:--';
  }
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const VideoEditorNode = memo(({ id, data, selected, width, height }: VideoEditorNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const findNodePosition = useCanvasStore((state) => state.findNodePosition);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);

  const [editorOpen, setEditorOpen] = useState(false);
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.videoEditor, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const uiDensity = useMemo(
    () => resolveResponsiveNodeClasses(resolvedWidth, resolvedHeight),
    [resolvedHeight, resolvedWidth]
  );
  const targetHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left'),
    [resolvedHeight, resolvedWidth]
  );
  const sourceHandleStyle = useMemo(
    () => resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right'),
    [resolvedHeight, resolvedWidth]
  );

  const incomingVideos = useMemo(
    () => graphImageResolver.collectInputVideos(id, nodes, edges),
    [edges, id, nodes]
  );
  const incomingStoryboardClips = useMemo(
    () => collectIncomingStoryboardClips(id, nodes, edges),
    [edges, id, nodes]
  );

  const resolvedVideoPath = data.filePath || incomingVideos[0] || null;
  const videoSrc = useMemo(
    () => (resolvedVideoPath ? resolveLocalAssetUrl(resolvedVideoPath) : null),
    [resolvedVideoPath]
  );

  const handlePickVideo = async () => {
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'] }],
    });
    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }
    const normalizedPath = selectedPath.trim();
    const fileName = normalizedPath.split(/[/\\]/u).pop() ?? normalizedPath;
    updateNodeData(id, {
      filePath: normalizedPath,
      sourceFileName: fileName,
      taskStatus: 'idle',
      taskMessage: null,
      taskOutputSummary: null,
    });
  };

  useEffect(() => {
    if (!data.autoOpenEditor) {
      return;
    }
    setEditorOpen(true);
    updateNodeData(id, { autoOpenEditor: false });
  }, [data.autoOpenEditor, id, updateNodeData]);

  const handleSaveTimeline = useCallback((clips: VideoEditorTimelineClip[], playheadSec: number) => {
    updateNodeData(id, {
      timelineClips: clips,
      currentTimeSec: playheadSec,
    });
  }, [id, updateNodeData]);

  const handleGeneratePreview = useCallback((clips: VideoEditorTimelineClip[]) => {
    const targetPath = data.filePath || incomingVideos[0] || null;
    if (!targetPath) {
      updateNodeData(id, {
        taskStatus: 'error',
        taskMessage: t('node.videoEditor.missingVideo', { defaultValue: '请先选择视频文件' }),
      });
      return;
    }

    const fileName = data.sourceFileName || targetPath.split(/[/\\]/u).pop() || 'video-preview';
    const nextPosition = findNodePosition(id, 560, 380);
    const previewNodeId = addNode(CANVAS_NODE_TYPES.videoPreview as CanvasNodeType, nextPosition, {
      filePath: targetPath,
      sourceFileName: fileName,
      mimeType: data.mimeType ?? null,
      durationSec: data.durationSec ?? null,
      displayName: `${fileName} Preview`,
    });
    addEdge(id, previewNodeId, { relation: 'video-flow', autoGenerated: true });
    updateNodeData(id, {
      taskStatus: 'success',
      taskMessage: t('node.videoEditor.previewReady', { defaultValue: '已根据时间轴生成预览节点' }),
      taskOutputSummary: `${clips.length} clip(s)`,
      outputFilePath: targetPath,
    });
  }, [
    addEdge,
    addNode,
    data.durationSec,
    data.filePath,
    data.mimeType,
    data.sourceFileName,
    findNodePosition,
    id,
    incomingVideos,
    t,
    updateNodeData,
  ]);

  return (
    <>
      <div
        className={`tapnow-node-card group relative flex h-full flex-col overflow-visible p-2 transition-colors duration-150 ${
          selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'
        }`}
        style={{ width: resolvedWidth, height: resolvedHeight }}
        onClick={() => setSelectedNode(id)}
      >
        <NodeHeader
          className={NODE_HEADER_FLOATING_POSITION_CLASS}
          icon={<Film className="h-4 w-4" />}
          titleText={resolvedTitle}
          editable
          onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
        />

        <div className="mb-2 mt-6 flex items-center justify-between gap-2">
          <div className={`tapnow-node-pill px-2 py-1 uppercase tracking-[0.12em] ${uiDensity.metaText}`}>
            {t('node.videoEditor.title', { defaultValue: '视频编辑' })}
          </div>
          <button
            type="button"
            className={`tapnow-node-button px-2 py-1 ${uiDensity.metaText}`}
            onClick={(event) => {
              event.stopPropagation();
              void handlePickVideo();
            }}
          >
            {data.filePath ? t('node.media.changeFile') : t('node.media.selectFile')}
          </button>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`tapnow-node-button inline-flex items-center justify-center gap-1 px-3 py-1.5 ${uiDensity.metaText}`}
            onClick={(event) => {
              event.stopPropagation();
              setEditorOpen(true);
            }}
          >
            <Clapperboard className="h-3.5 w-3.5" />
            {t('node.videoEditor.openEditor', { defaultValue: '打开编辑器' })}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
            onClick={(event) => {
              event.stopPropagation();
              handleGeneratePreview(data.timelineClips ?? []);
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('node.videoEditor.generatePreview', { defaultValue: '生成预览' })}
          </button>
        </div>

        <div className="tapnow-node-surface relative flex min-h-[160px] flex-1 items-center justify-center overflow-hidden">
          {videoSrc ? (
            <video
              src={videoSrc}
              controls
              className="h-full w-full object-contain"
              onLoadedMetadata={(event) => {
                const nextDuration = Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : null;
                updateNodeData(id, { durationSec: nextDuration });
              }}
            />
          ) : (
            <div className="px-4 text-center text-sm text-text-muted">
              {t('node.videoEditor.missingVideo', { defaultValue: '请先选择视频文件' })}
            </div>
          )}
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {t('node.video.duration', { defaultValue: '时长' })}
            </div>
            <div className="mt-1 text-sm text-text-dark">{formatSeconds(data.durationSec)}</div>
          </div>
          <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {t('node.videoEditor.sourceClips', { defaultValue: '分镜栏' })}
            </div>
            <div className="mt-1 text-sm text-text-dark">{incomingStoryboardClips.length}</div>
          </div>
          <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {t('node.videoEditor.timeline', { defaultValue: '时间轴' })}
            </div>
            <div className="mt-1 text-sm text-text-dark">{data.timelineClips?.length ?? 0}</div>
          </div>
        </div>

        {data.taskMessage ? (
          <div className={`mt-2 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 py-1 ${uiDensity.metaText} text-text-muted`}>
            {data.taskMessage}
          </div>
        ) : null}

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
        <VideoEditorModal
          filePath={resolvedVideoPath}
          durationSec={data.durationSec ?? 0}
          sourceClips={incomingStoryboardClips}
          initialTimelineClips={data.timelineClips ?? []}
          initialPlayheadSec={data.currentTimeSec ?? 0}
          onSave={handleSaveTimeline}
          onGenerate={handleGeneratePreview}
          onClose={() => setEditorOpen(false)}
        />,
        document.body
      )}
    </>
  );
});

VideoEditorNode.displayName = 'VideoEditorNode';
