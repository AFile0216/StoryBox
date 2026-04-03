import { memo, useMemo } from 'react';
import { Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  type AudioNodeData,
  type CanvasNode,
  type ImageEditNodeData,
  type StoryboardGenNodeData,
  type StoryboardSplitNodeData,
  type TextAnnotationMode,
  type TextAnnotationNodeData,
  type VideoNodeData,
  type VideoStoryboardNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { UiInput, UiPanel, UiSelect } from '@/components/ui';
import { useCanvasStore } from '@/stores/canvasStore';
import { ReferenceAwareTextarea } from './ReferenceAwareTextarea';

interface NodeSettingsPopoverProps {
  node: CanvasNode;
}

const TEXT_MODES: TextAnnotationMode[] = [
  'plain-text',
  'text-to-image-prompt',
  'text-to-music-prompt',
  'text-to-video-prompt',
  'reverse-prompt',
];

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] text-text-muted">{children}</div>;
}

export const NodeSettingsPopover = memo(({ node }: NodeSettingsPopoverProps) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const resolvedTitle = useMemo(
    () => resolveNodeDisplayName(node.type, node.data),
    [node.data, node.type]
  );

  const renderBody = () => {
    if (node.type === CANVAS_NODE_TYPES.textAnnotation) {
      const data = node.data as TextAnnotationNodeData;
      return (
        <>
          <Section label={t('node.textAnnotation.modeLabel', { defaultValue: '模式' })}>
            <UiSelect
              value={data.mode}
              onChange={(event) =>
                updateNodeData(node.id, { mode: event.target.value as TextAnnotationMode })
              }
            >
              {TEXT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`node.textAnnotation.mode.${mode}`, { defaultValue: mode })}
                </option>
              ))}
            </UiSelect>
          </Section>
          <Section label={t('ai.prompt', { defaultValue: '提示词' })}>
            <ReferenceAwareTextarea
              nodeId={node.id}
              value={data.content}
              onChange={(value) => updateNodeData(node.id, { content: value })}
            />
          </Section>
        </>
      );
    }

    if (node.type === CANVAS_NODE_TYPES.imageEdit) {
      const data = node.data as ImageEditNodeData;
      return (
        <>
          <Section label={t('node.imageEdit.mode.text-to-image', { defaultValue: '图像任务' })}>
            <UiSelect
              value={data.taskMode ?? 'text-to-image'}
              onChange={(event) =>
                updateNodeData(node.id, {
                  taskMode: event.target.value as ImageEditNodeData['taskMode'],
                })
              }
            >
              <option value="text-to-image">
                {t('node.imageEdit.mode.text-to-image', { defaultValue: '文生图' })}
              </option>
              <option value="image-to-image">
                {t('node.imageEdit.mode.image-to-image', { defaultValue: '图生图' })}
              </option>
              <option value="image-to-video">
                {t('node.imageEdit.mode.image-to-video', { defaultValue: '图生视频' })}
              </option>
              <option value="super-resolution">
                {t('node.imageEdit.mode.super-resolution', { defaultValue: '超级分辨率' })}
              </option>
            </UiSelect>
          </Section>
          <Section label={t('ai.prompt', { defaultValue: '提示词' })}>
            <ReferenceAwareTextarea
              nodeId={node.id}
              value={data.prompt}
              onChange={(value) => updateNodeData(node.id, { prompt: value })}
            />
          </Section>
        </>
      );
    }

    if (node.type === CANVAS_NODE_TYPES.video) {
      const data = node.data as VideoNodeData;
      return (
        <>
          <Section label={t('node.video.mode', { defaultValue: '模式' })}>
            <UiSelect
              value={data.taskMode}
              onChange={(event) =>
                updateNodeData(node.id, { taskMode: event.target.value as VideoNodeData['taskMode'] })
              }
            >
              <option value="reference">
                {t('node.video.mode.reference', { defaultValue: '参考视频' })}
              </option>
              <option value="image-to-video">
                {t('node.video.mode.image-to-video', { defaultValue: '图生视频' })}
              </option>
              <option value="first-last-frame">
                {t('node.video.mode.first-last-frame', { defaultValue: '首尾帧视频' })}
              </option>
              <option value="video-storyboard-generation">
                {t('node.video.mode.video-storyboard-generation', { defaultValue: '视频分镜生成' })}
              </option>
            </UiSelect>
          </Section>
          <Section label={t('ai.prompt', { defaultValue: '提示词' })}>
            <ReferenceAwareTextarea
              nodeId={node.id}
              value={data.prompt}
              onChange={(value) => updateNodeData(node.id, { prompt: value })}
            />
          </Section>
        </>
      );
    }

    if (node.type === CANVAS_NODE_TYPES.audio) {
      const data = node.data as AudioNodeData;
      return (
        <>
          <Section label={t('node.audio.mode', { defaultValue: '模式' })}>
            <UiSelect
              value={data.taskMode}
              onChange={(event) =>
                updateNodeData(node.id, { taskMode: event.target.value as AudioNodeData['taskMode'] })
              }
            >
              <option value="audio-to-video">
                {t('node.audio.mode.audio-to-video', { defaultValue: '音频生成视频' })}
              </option>
              <option value="text-to-music">
                {t('node.audio.mode.text-to-music', { defaultValue: '文生音乐' })}
              </option>
            </UiSelect>
          </Section>
          <Section label={t('ai.prompt', { defaultValue: '提示词' })}>
            <ReferenceAwareTextarea
              nodeId={node.id}
              value={data.prompt}
              onChange={(value) => updateNodeData(node.id, { prompt: value })}
            />
          </Section>
        </>
      );
    }

    if (node.type === CANVAS_NODE_TYPES.videoStoryboard) {
      const data = node.data as VideoStoryboardNodeData;
      return (
        <>
          <Section label={t('node.videoStoryboard.timeline', { defaultValue: '时间范围' })}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>{t('node.videoStoryboard.rangeStart', { defaultValue: '开始' })}</FieldLabel>
                <UiInput
                  type="number"
                  step="0.1"
                  value={data.selectionStartSec}
                  onChange={(event) =>
                    updateNodeData(node.id, {
                      selectionStartSec: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <FieldLabel>{t('node.videoStoryboard.rangeEnd', { defaultValue: '结束' })}</FieldLabel>
                <UiInput
                  type="number"
                  step="0.1"
                  value={data.selectionEndSec}
                  onChange={(event) =>
                    updateNodeData(node.id, {
                      selectionEndSec: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </Section>
          <Section label={t('node.videoStoryboard.segmentText', { defaultValue: '批注内容' })}>
            <ReferenceAwareTextarea
              nodeId={node.id}
              value={data.draftText}
              onChange={(value) => updateNodeData(node.id, { draftText: value })}
            />
          </Section>
        </>
      );
    }

    if (node.type === CANVAS_NODE_TYPES.storyboardGen) {
      const data = node.data as StoryboardGenNodeData;
      return (
        <Section label={t('node.storyboardGen.gridPreviewTitle', { defaultValue: '分镜宫格' })}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>{t('node.storyboardGen.rowsShort', { defaultValue: '行' })}</FieldLabel>
              <UiInput
                type="number"
                min="1"
                max="9"
                value={data.gridRows}
                onChange={(event) =>
                  updateNodeData(node.id, {
                    gridRows: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>{t('node.storyboardGen.colsShort', { defaultValue: '列' })}</FieldLabel>
              <UiInput
                type="number"
                min="1"
                max="9"
                value={data.gridCols}
                onChange={(event) =>
                  updateNodeData(node.id, {
                    gridCols: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
            </div>
          </div>
        </Section>
      );
    }

    if (node.type === CANVAS_NODE_TYPES.storyboardSplit) {
      const data = node.data as StoryboardSplitNodeData;
      return (
        <Section label={t('node.storyboardNode.title', { defaultValue: '分镜' })}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>{t('node.storyboardNode.rows', { defaultValue: '行数' })}</FieldLabel>
              <UiInput
                type="number"
                min="1"
                value={data.gridRows}
                onChange={(event) =>
                  updateNodeData(node.id, {
                    gridRows: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>{t('node.storyboardNode.cols', { defaultValue: '列数' })}</FieldLabel>
              <UiInput
                type="number"
                min="1"
                value={data.gridCols}
                onChange={(event) =>
                  updateNodeData(node.id, {
                    gridCols: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
            </div>
          </div>
        </Section>
      );
    }

    return (
      <div className="text-sm text-text-muted">
        {t('common.edit', { defaultValue: '编辑' })} {resolvedTitle}
      </div>
    );
  };

  return (
    <div className="pointer-events-auto fixed right-5 top-24 z-[90] w-[360px] max-w-[calc(100vw-32px)]">
      <UiPanel className="rounded-[24px] border border-white/10 bg-[rgba(15,23,42,0.82)] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.32)] backdrop-blur-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80">
            <Settings2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
              {t('common.edit', { defaultValue: '编辑设置' })}
            </div>
            <div className="mt-1 truncate text-sm font-medium text-white/92">{resolvedTitle}</div>
          </div>
        </div>

        <Section label={t('project.name', { defaultValue: '名称' })}>
          <UiInput
            value={typeof node.data.displayName === 'string' ? node.data.displayName : ''}
            onChange={(event) => updateNodeData(node.id, { displayName: event.target.value })}
          />
        </Section>

        <div className="mt-4 space-y-4">{renderBody()}</div>
      </UiPanel>
    </div>
  );
});

NodeSettingsPopover.displayName = 'NodeSettingsPopover';
