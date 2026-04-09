import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { Clapperboard, Film, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
  type StoryboardSplitNodeData,
  type VideoEditorNodeData,
  type VideoEditorTextClip,
  type VideoEditorTimelineClip,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { resolveAdaptiveHandleStyle, resolveResponsiveNodeClasses } from '@/features/canvas/ui/nodeMetrics';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
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
      : '鍒嗛暅';
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

function formatTimelineSeconds(value: number): string {
  return `${Math.max(0, value).toFixed(1)}s`;
}

function sanitizeInlineText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function buildTimelineMarkdown(
  timelineClips: VideoEditorTimelineClip[],
  textClips: VideoEditorTextClip[],
  sourceClipMap: Map<string, VideoEditorSourceClipItem>
): string {
  const lines: string[] = [
    '# Video Timeline',
    '',
    '## Storyboard Track',
  ];

  if (timelineClips.length === 0) {
    lines.push('- None');
  } else {
    timelineClips.forEach((clip, index) => {
      const source = sourceClipMap.get(clip.sourceClipId);
      const clipName = sanitizeInlineText(source?.label ?? clip.sourceClipId);
      const note = sanitizeInlineText(clip.note ?? '');
      const notePart = note ? ` | Note: ${note}` : '';
      lines.push(
        `${index + 1}. ${formatTimelineSeconds(clip.startSec)}-${formatTimelineSeconds(clip.startSec + clip.durationSec)} | Storyboard: ${clipName}${notePart}`
      );
    });
  }

  lines.push('');
  lines.push('## Text Track');
  if (textClips.length === 0) {
    lines.push('- None');
  } else {
    textClips.forEach((clip, index) => {
      lines.push(
        `${index + 1}. ${formatTimelineSeconds(clip.startSec)}-${formatTimelineSeconds(clip.startSec + clip.durationSec)} | Text: ${sanitizeInlineText(clip.text)}`
      );
    });
  }

  return lines.join('\n');
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
  const sourceClipMap = useMemo(
    () => new Map(incomingStoryboardClips.map((clip) => [clip.id, clip])),
    [incomingStoryboardClips]
  );

  const resolvedVideoPath = data.filePath || incomingVideos[0] || null;
  const timelineDurationSec = useMemo(
    () => Math.max(
      (data.timelineClips ?? []).reduce(
        (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
        0
      ),
      (data.textClips ?? []).reduce(
        (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
        0
      )
    ),
    [data.textClips, data.timelineClips]
  );

  useEffect(() => {
    if (!data.autoOpenEditor) {
      return;
    }
    setEditorOpen(true);
    updateNodeData(id, { autoOpenEditor: false });
  }, [data.autoOpenEditor, id, updateNodeData]);

  const handleSaveTimeline = useCallback((
    clips: VideoEditorTimelineClip[],
    textClips: VideoEditorTextClip[],
    playheadSec: number
  ) => {
    updateNodeData(id, {
      timelineClips: clips,
      textClips,
      currentTimeSec: playheadSec,
    });
  }, [id, updateNodeData]);

  const handleGenerateTextNode = useCallback((
    clips: VideoEditorTimelineClip[],
    textClips: VideoEditorTextClip[] = []
  ) => {
    const normalizedClips = [...clips]
      .filter((clip) => Number.isFinite(clip.startSec) && Number.isFinite(clip.durationSec) && clip.durationSec > 0)
      .map((clip) => ({
        ...clip,
        note: sanitizeInlineText(clip.note ?? ''),
      }))
      .sort((left, right) => left.startSec - right.startSec);

    const normalizedTextClips = [...textClips]
      .filter((clip) => Number.isFinite(clip.startSec) && Number.isFinite(clip.durationSec) && clip.durationSec > 0)
      .map((clip) => ({
        ...clip,
        text: clip.text.trim(),
      }))
      .filter((clip) => clip.text.length > 0)
      .sort((left, right) => left.startSec - right.startSec);

    if (normalizedClips.length === 0 && normalizedTextClips.length === 0) {
      updateNodeData(id, {
        taskStatus: 'error',
        taskMessage: t('node.videoEditor.noSequence', { defaultValue: '请先在时间轴编排分镜序列' }),
      });
      return;
    }

    const timelineEnd = Math.max(
      normalizedClips.reduce(
        (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
        0
      ),
      normalizedTextClips.reduce(
        (max, clip) => Math.max(max, clip.startSec + clip.durationSec),
        0
      )
    );
    const markdown = buildTimelineMarkdown(normalizedClips, normalizedTextClips, sourceClipMap);

    const nextPosition = findNodePosition(id, 460, 360);
    const textNodeId = addNode(CANVAS_NODE_TYPES.textAnnotation as CanvasNodeType, nextPosition, {
      displayName: `${resolvedTitle} Timeline`,
      content: markdown,
      mode: 'plain-text',
      lastAppliedTaskType: 'video-editor-markdown',
    });
    addEdge(id, textNodeId, { relation: 'text-flow', autoGenerated: true });
    updateNodeData(id, {
      taskStatus: 'success',
      taskMessage: t('node.videoEditor.textNodeReady', { defaultValue: '已生成时间线文本节点' }),
      taskOutputSummary: `${normalizedClips.length} storyboard clip(s), ${normalizedTextClips.length} text clip(s), ${formatTimelineSeconds(timelineEnd)}`,
      outputFilePath: null,
    });
  }, [
    addEdge,
    addNode,
    findNodePosition,
    id,
    resolvedTitle,
    sourceClipMap,
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
          <span className={`rounded-md border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 py-1 text-text-muted ${uiDensity.metaText}`}>
            PR Timeline
          </span>
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
              handleGenerateTextNode(data.timelineClips ?? [], data.textClips ?? []);
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('node.videoEditor.generateTextNode', { defaultValue: '生成文本节点' })}
          </button>
        </div>

        <div className="tapnow-node-surface relative flex min-h-[160px] flex-1 items-center justify-center overflow-hidden p-2">
          {incomingStoryboardClips[0]?.previewImageUrl || incomingStoryboardClips[0]?.imageUrl ? (
            <img
              src={resolveImageDisplayUrl(incomingStoryboardClips[0].previewImageUrl ?? incomingStoryboardClips[0].imageUrl ?? '')}
              alt="storyboard-cover"
              className="h-full w-full rounded-lg object-cover"
              draggable={false}
            />
          ) : (
            <div className="px-4 text-center text-sm text-text-muted">
              {t('node.videoEditor.noSourceClips', { defaultValue: '未检测到分镜图片，请连接分镜节点' })}
            </div>
          )}
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <div className={`tapnow-node-panel ${uiDensity.panelPadding}`}>
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {t('node.video.duration', { defaultValue: '时长' })}
            </div>
            <div className="mt-1 text-sm text-text-dark">{formatSeconds(timelineDurationSec || data.durationSec)}</div>
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
            <div className="mt-1 text-sm text-text-dark">
              {(data.timelineClips?.length ?? 0)} / {(data.textClips?.length ?? 0)}
            </div>
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
          initialTextClips={data.textClips ?? []}
          initialPlayheadSec={data.currentTimeSec ?? 0}
          onSave={handleSaveTimeline}
          onGenerate={handleGenerateTextNode}
          onClose={() => setEditorOpen(false)}
        />,
        document.body
      )}
    </>
  );
});

VideoEditorNode.displayName = 'VideoEditorNode';

