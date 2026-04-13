import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Send, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { collectCanvasReferenceImages } from '@/features/canvas/application/canvasMediaReferences';
import { filterReferencedImages } from '@/features/canvas/application/referenceTokenEditing';
import { ReferenceAwareTextarea } from '@/features/canvas/ui/ReferenceAwareTextarea';
import { useCanvasStore } from '@/stores/canvasStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSettingsStore } from '@/stores/settingsStore';

interface SidebarMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

function createMessageId(): string {
  return `ai-panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stripReferenceTokens(prompt: string): string {
  return prompt.replace(/@(?:\u56FE\u7247|\u56FE)\d+/gu, '').replace(/\s{2,}/gu, ' ').trim();
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
  return '';
}

export const AiSidePanel = memo(() => {
  const { t } = useTranslation();
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const customApiInterfaces = useSettingsStore((state) => state.customApiInterfaces);
  const nodes = useCanvasStore((state) => state.nodes);

  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<SidebarMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [interfaceId, setInterfaceId] = useState('');
  const [modelId, setModelId] = useState('');

  const selectedInterface = useMemo(() => {
    const byId = customApiInterfaces.find((item) => item.id === interfaceId);
    return byId ?? customApiInterfaces[0] ?? null;
  }, [customApiInterfaces, interfaceId]);
  const selectedModel = modelId || selectedInterface?.modelIds[0] || '';

  useEffect(() => {
    if (!selectedInterface) {
      setInterfaceId('');
      setModelId('');
      return;
    }
    if (!interfaceId) {
      setInterfaceId(selectedInterface.id);
    }
    if (!selectedModel && selectedInterface.modelIds[0]) {
      setModelId(selectedInterface.modelIds[0]);
    }
  }, [interfaceId, selectedInterface, selectedModel]);

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [currentProjectId]);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || !selectedInterface || !selectedModel || isSending) {
      return;
    }

    const canvasImages = collectCanvasReferenceImages(nodes).map((item) => item.sourceUrl);
    const referencedImages = filterReferencedImages(canvasImages, prompt);
    const cleanedPrompt = stripReferenceTokens(prompt);
    const referenceLines = referencedImages.map(
      (url, index) => `Reference image ${index + 1}: ${url}`
    );
    const userPrompt = [cleanedPrompt, ...referenceLines].filter(Boolean).join('\n');

    const userMessage: SidebarMessage = {
      id: createMessageId(),
      role: 'user',
      content: prompt,
    };
    setMessages((previous) => [...previous, userMessage]);
    setInput('');
    setIsSending(true);

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
            {
              role: 'system',
              content:
                'You are a storyboard and prompt assistant. Provide concise, actionable responses.',
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const payload = await response.json().catch(() => null);
      const assistantText = extractChatContent(payload).trim() || t('common.error', { defaultValue: 'Error' });
      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          role: 'assistant',
          content: assistantText,
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          role: 'error',
          content: error instanceof Error ? error.message : String(error),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, nodes, selectedInterface, selectedModel, t]);

  if (!currentProjectId) {
    return null;
  }

  return (
    <div
      className={`absolute right-0 top-0 z-40 h-full overflow-visible transition-[width] duration-200 ${
        collapsed
          ? 'w-0 border-l-0 bg-transparent shadow-none backdrop-blur-0'
          : 'w-[clamp(300px,32vw,420px)] max-w-[52vw] border-l border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] shadow-[var(--ui-elevation-2)] backdrop-blur-xl'
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((previous) => !previous)}
        className="absolute -left-4 top-1/2 flex h-10 w-8 -translate-y-1/2 items-center justify-center rounded-l-full border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-accent shadow-[var(--ui-elevation-2)]"
        aria-label={collapsed
          ? t('node.chat.expand', { defaultValue: '展开 AI 面板' })
          : t('node.chat.collapse', { defaultValue: '收起 AI 面板' })}
      >
        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {!collapsed ? (
        <div className="flex h-full min-h-0 flex-col gap-2 p-3">
          <div className="mb-2 flex items-center gap-2 text-text-dark">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">
              {t('node.chat.sidePanelTitle', { defaultValue: 'AI 对话助手' })}
            </span>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <select
              value={selectedInterface?.id ?? ''}
              onChange={(event) => {
                const nextInterface = customApiInterfaces.find((item) => item.id === event.target.value);
                setInterfaceId(event.target.value);
                setModelId(nextInterface?.modelIds[0] ?? '');
              }}
              className="h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-xs text-text-dark outline-none"
            >
              {customApiInterfaces.length === 0 && <option value="">{t('settings.customApiSettingsTitle')}</option>}
              {customApiInterfaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={selectedModel}
              onChange={(event) => setModelId(event.target.value)}
              className="h-8 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-2 text-xs text-text-dark outline-none"
            >
              {(selectedInterface?.modelIds ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="ui-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-2">
            {messages.length === 0 ? (
              <div className="pt-2 text-xs text-text-muted">
                {t('node.chat.emptyHint', { defaultValue: '发送消息开始对话' })}
              </div>
            ) : null}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`ui-safe-text rounded-lg px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap ${
                  message.role === 'user'
                    ? 'ml-8 bg-accent/20 text-text-dark'
                    : message.role === 'error'
                      ? 'mr-8 border border-red-500/40 bg-red-500/12 text-red-300'
                      : 'mr-8 border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] text-text-dark'
                }`}
              >
                {message.content}
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-lg border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-2">
            <ReferenceAwareTextarea
              nodeId="__canvas_scope__"
              value={input}
              onChange={setInput}
              placeholder={t('node.chat.inputPlaceholder', { defaultValue: '输入消息...' })}
              minHeightClassName="min-h-[86px]"
              className="h-[96px]"
              referenceMediaTypes={['image']}
              referenceScope="canvas"
              pickerSearchPlaceholder={t('node.chat.searchCanvasImages', { defaultValue: '检索画布图片' })}
            />
            <div className="mt-2 flex items-center justify-end">
              <button
                type="button"
                disabled={isSending || !input.trim() || !selectedInterface || !selectedModel}
                onClick={() => {
                  void handleSend();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {t('canvas.generate', { defaultValue: '发送' })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

AiSidePanel.displayName = 'AiSidePanel';

