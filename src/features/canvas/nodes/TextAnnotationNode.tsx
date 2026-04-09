import { memo, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText, LoaderCircle, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';

import {
  CANVAS_NODE_TYPES,
  type TextAnnotationMode,
  type TextAnnotationNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { graphImageResolver } from '@/features/canvas/application/canvasServices';
import {
  filterReferencedImages,
  filterReferencedVideos,
} from '@/features/canvas/application/referenceTokenEditing';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { resolveAdaptiveHandleStyle, resolveResponsiveNodeClasses } from '@/features/canvas/ui/nodeMetrics';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { ReferenceAwareTextarea } from '@/features/canvas/ui/ReferenceAwareTextarea';
import { UiSelect } from '@/components/ui';
import { useCanvasStore } from '@/stores/canvasStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useSettingsStore } from '@/stores/settingsStore';

type TextAnnotationNodeProps = NodeProps & {
  id: string;
  data: TextAnnotationNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 300;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 180;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 960;

const TEXT_MODES: TextAnnotationMode[] = [
  'plain-text',
  'text-to-image-prompt',
  'text-to-music-prompt',
  'text-to-video-prompt',
  'reverse-prompt',
];

function stripReferenceTokens(prompt: string): string {
  return prompt.replace(/@(?:\u56FE\u7247|\u56FE|\u89C6\u9891)\d+/gu, '').replace(/\s{2,}/gu, ' ').trim();
}

function resolveModeInstruction(mode: TextAnnotationMode): string {
  switch (mode) {
    case 'text-to-image-prompt':
      return '生成可直接用于图像生成的高质量提示词。';
    case 'text-to-music-prompt':
      return '生成可直接用于音乐生成的高质量提示词。';
    case 'text-to-video-prompt':
      return '生成可直接用于视频生成的高质量提示词。';
    case 'reverse-prompt':
      return '根据上下文生成反向提示词，强调约束项和负面词。';
    default:
      return '扩写并优化文本内容，保持可读和结构清晰。';
  }
}

function extractChatContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  if (!first) {
    return '';
  }

  const message = first.message as Record<string, unknown> | undefined;
  if (message && typeof message.content === 'string') {
    return message.content;
  }

  const content = first.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>).text : ''))
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n');
    if (text.trim()) {
      return text;
    }
  }

  const plainText = first.text;
  return typeof plainText === 'string' ? plainText : '';
}

export const TextAnnotationNode = memo(({
  id,
  data,
  selected,
  width,
  height,
}: TextAnnotationNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const addHistoryRecord = useHistoryStore((state) => state.addRecord);
  const customApiInterfaces = useSettingsStore((state) => state.customApiInterfaces);
  const content = typeof data.content === 'string' ? data.content : '';
  const mode = (data.mode ?? 'plain-text') as TextAnnotationMode;
  const isGenerating = data.isGenerating === true;
  const selectedInterface = useMemo(() => {
    const byId = customApiInterfaces.find((item) => item.id === data.interfaceId);
    return byId ?? customApiInterfaces[0] ?? null;
  }, [customApiInterfaces, data.interfaceId]);
  const selectedModel = data.modelId || selectedInterface?.modelIds[0] || '';
  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.textAnnotation, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));
  const uiDensity = resolveResponsiveNodeClasses(resolvedWidth, resolvedHeight);
  const targetHandleStyle = resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'left');
  const sourceHandleStyle = resolveAdaptiveHandleStyle(resolvedWidth, resolvedHeight, 'right');

  useEffect(() => {
    if (!data.interfaceId && selectedInterface) {
      updateNodeData(id, { interfaceId: selectedInterface.id });
    }
    if (!selectedModel && selectedInterface?.modelIds[0]) {
      updateNodeData(id, { modelId: selectedInterface.modelIds[0] });
    }
  }, [data.interfaceId, id, selectedInterface, selectedModel, updateNodeData]);

  const handleMarkdownLinkClick = useCallback((href?: string) => {
    if (!href) {
      return;
    }
    void openUrl(href);
  }, []);

  const handleGenerate = useCallback(async () => {
    const prompt = content.trim();
    if (!prompt || !selectedInterface || !selectedModel || !selectedInterface.apiKey.trim()) {
      updateNodeData(id, {
        generationError: !prompt
          ? t('node.imageEdit.promptRequired', { defaultValue: '请输入提示词' })
          : !selectedModel
            ? t('node.imageEdit.modelRequired', { defaultValue: '请先选择可用模型' })
            : t('node.imageEdit.apiKeyRequired', { defaultValue: '请先完成接口配置' }),
      });
      return;
    }

    const incomingImages = graphImageResolver.collectInputImages(id, nodes, edges);
    const incomingVideos = graphImageResolver.collectInputVideos(id, nodes, edges);
    const referencedImages = filterReferencedImages(incomingImages, prompt);
    const referencedVideos = filterReferencedVideos(incomingVideos, prompt);
    const cleanedPrompt = stripReferenceTokens(prompt);
    const referenceLines = [
      ...referencedImages.map((url, index) => `参考图${index + 1}: ${url}`),
      ...referencedVideos.map((url, index) => `参考视频${index + 1}: ${url}`),
    ];
    const userPrompt = [cleanedPrompt, ...referenceLines].filter(Boolean).join('\n');

    updateNodeData(id, {
      isGenerating: true,
      generationError: null,
      interfaceId: selectedInterface.id,
      modelId: selectedModel,
    });

    try {
      const response = await fetch(`${selectedInterface.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${selectedInterface.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          stream: false,
          messages: [
            { role: 'system', content: resolveModeInstruction(mode) },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const payload = await response.json().catch(() => null);
      const generatedText = extractChatContent(payload).trim();
      if (!generatedText) {
        throw new Error(t('common.error', { defaultValue: '未获取到可用文本结果' }));
      }

      updateNodeData(id, {
        content: generatedText,
        isGenerating: false,
        generationError: null,
        lastGeneratedAt: Date.now(),
      });
      addHistoryRecord({
        nodeId: id,
        type: 'text',
        prompt,
        outputText: generatedText,
        model: selectedModel,
      });
    } catch (error) {
      updateNodeData(id, {
        isGenerating: false,
        generationError: error instanceof Error ? error.message : String(error),
      });
    }
  }, [addHistoryRecord, content, edges, id, mode, nodes, selectedInterface, selectedModel, t, updateNodeData]);

  return (
    <div
      className={`
        tapnow-node-card group relative h-full w-full overflow-visible p-2 transition-colors duration-150
        ${selected ? 'tapnow-node-card--selected' : 'tapnow-node-card--default'}
      `}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<FileText className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <div className="mb-2 mt-6 grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
        <UiSelect
          value={mode}
          onChange={(event) =>
            updateNodeData(id, {
              mode: event.target.value as TextAnnotationMode,
            })
          }
          className="h-8 text-xs"
        >
          {TEXT_MODES.map((item) => (
            <option key={item} value={item}>
              {t(`node.textAnnotation.mode.${item}`)}
            </option>
          ))}
        </UiSelect>

        <UiSelect
          value={selectedInterface?.id ?? ''}
          onChange={(event) => {
            const nextInterface = customApiInterfaces.find((item) => item.id === event.target.value);
            updateNodeData(id, {
              interfaceId: event.target.value,
              modelId: nextInterface?.modelIds[0] ?? '',
            });
          }}
          className="h-8 text-xs"
        >
          {customApiInterfaces.length === 0 ? <option value="">未配置接口</option> : null}
          {customApiInterfaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </UiSelect>

        <UiSelect
          value={selectedModel}
          onChange={(event) => updateNodeData(id, { modelId: event.target.value })}
          className="h-8 text-xs"
        >
          {(selectedInterface?.modelIds ?? []).map((modelId) => (
            <option key={modelId} value={modelId}>
              {modelId}
            </option>
          ))}
          {selectedInterface?.modelIds?.length === 0 ? (
            <option value="">{t('node.imageEdit.modelRequired', { defaultValue: '请先配置模型' })}</option>
          ) : null}
        </UiSelect>

        <button
          type="button"
          className={`flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60 ${uiDensity.buttonText}`}
          onClick={(event) => {
            event.stopPropagation();
            void handleGenerate();
          }}
          disabled={isGenerating || !selectedInterface || !selectedModel}
        >
          {isGenerating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          生成
        </button>
      </div>

      {selected ? (
        <ReferenceAwareTextarea
          nodeId={id}
          autoFocus
          value={content}
          onChange={(value) => {
            updateNodeData(id, { content: value, generationError: null });
          }}
          placeholder={t('node.textAnnotation.placeholder', {
            mode: t(`node.textAnnotation.mode.${mode}`),
          })}
          minHeightClassName="min-h-0"
          className={`h-[calc(100%-106px)] ${uiDensity.panelPadding} ${uiDensity.bodyText}`}
          referenceMediaTypes={['image', 'video']}
        />
      ) : (
        <div className={`tapnow-node-panel nodrag nowheel h-[calc(100%-106px)] overflow-auto ${uiDensity.panelPadding} ${uiDensity.bodyText} text-text-dark`}>
          <div className={`tapnow-node-pill mb-2 px-2 py-0.5 uppercase tracking-[0.12em] ${uiDensity.metaText}`}>
            {t(`node.textAnnotation.mode.${mode}`)}
          </div>
          {content.trim().length > 0 ? (
            <div className="markdown-body break-words [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:border-white/10 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_p+_p]:mt-4 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-black/30 [&_pre]:p-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.preventDefault();
                        handleMarkdownLinkClick(href);
                      }}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="pt-1 text-text-muted">{t('node.textAnnotation.empty')}</div>
          )}
        </div>
      )}

      {data.generationError ? (
        <div className="mt-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300">
          {data.generationError}
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
  );
});

TextAnnotationNode.displayName = 'TextAnnotationNode';
