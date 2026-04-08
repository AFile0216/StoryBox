import { memo, useMemo } from 'react';
import { ExternalLink, FileText, Film, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

import { useHistoryStore, type HistoryRecord } from '@/stores/historyStore';

interface HistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function format(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function resolvePreviewUrl(record: HistoryRecord): string | null {
  const candidate = record.mediaUrl || record.imageUrl;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function resolveRevealPath(record: HistoryRecord): string | null {
  if (record.filePath && record.filePath.trim()) {
    return record.filePath.trim();
  }
  const previewUrl = resolvePreviewUrl(record);
  if (!previewUrl) {
    return null;
  }
  if (previewUrl.startsWith('file://')) {
    try {
      const parsed = new URL(previewUrl);
      const decodedPathname = decodeURIComponent(parsed.pathname);
      return decodedPathname.replace(/^\/([A-Za-z]:[\\/])/, '$1');
    } catch {
      return previewUrl.replace('file://', '');
    }
  }
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(previewUrl)) {
    return previewUrl;
  }
  return null;
}

function resolveRecordType(record: HistoryRecord): 'image' | 'video' | 'text' {
  if (record.type === 'video' || record.type === 'text' || record.type === 'image') {
    return record.type;
  }
  const previewUrl = resolvePreviewUrl(record);
  if (previewUrl && /\.(mp4|mov|m4v|webm|mkv|avi)$/iu.test(previewUrl)) {
    return 'video';
  }
  if (previewUrl) {
    return 'image';
  }
  return 'text';
}

function resolveContent(record: HistoryRecord): string {
  const text = record.outputText || record.prompt;
  return typeof text === 'string' ? text : '';
}

export const HistoryDialog = memo(({ isOpen, onClose }: HistoryDialogProps) => {
  const { t } = useTranslation();
  const records = useHistoryStore((state) => state.records);
  const removeRecord = useHistoryStore((state) => state.removeRecord);
  const clearHistory = useHistoryStore((state) => state.clearHistory);

  const sortedRecords = useMemo(
    () => [...records].sort((left, right) => right.createdAt - left.createdAt),
    [records]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-[var(--ui-border-soft)] bg-gradient-to-r from-accent/10 to-transparent px-6">
          <h2 className="text-lg font-semibold text-text-dark">
            {t('app.history', { defaultValue: '历史记录' })}
          </h2>
          <div className="flex items-center gap-3">
            {sortedRecords.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(t('app.clearHistoryConfirm', { defaultValue: '确定清空所有历史记录吗？' }))) {
                    clearHistory();
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('app.clearHistory', { defaultValue: '清空历史' })}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-[var(--ui-surface-field)] hover:text-text-dark"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="ui-scrollbar flex-1 overflow-y-auto p-6">
          {sortedRecords.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-text-muted">
              <div className="mb-4 rounded-full bg-[var(--ui-surface-field)] p-4">
                <ExternalLink className="h-8 w-8 opacity-50" />
              </div>
              <p>{t('app.historyEmpty', { defaultValue: '暂无历史记录' })}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedRecords.map((record) => {
                const recordType = resolveRecordType(record);
                const previewUrl = resolvePreviewUrl(record);
                const content = resolveContent(record);
                const revealPath = resolveRevealPath(record);
                const typeLabel =
                  recordType === 'video'
                    ? t('node.menu.video', { defaultValue: '视频' })
                    : recordType === 'text'
                      ? t('node.menu.textAnnotation', { defaultValue: '文本' })
                      : t('node.menu.uploadImage', { defaultValue: '图片' });

                return (
                  <div
                    key={record.id}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] transition-all hover:border-accent/40"
                    onContextMenu={async (event) => {
                      event.preventDefault();
                      if (!revealPath) {
                        return;
                      }
                      try {
                        await revealItemInDir(revealPath);
                      } catch (error) {
                        console.error('Failed to reveal path', error);
                      }
                    }}
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-black/20">
                      {recordType === 'image' && previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={record.prompt || 'history-record'}
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center gap-2 text-text-muted">
                          {recordType === 'video' ? <Film className="h-7 w-7 opacity-70" /> : null}
                          {recordType === 'text' ? <FileText className="h-7 w-7 opacity-70" /> : null}
                          {recordType === 'image' ? <ImageIcon className="h-7 w-7 opacity-70" /> : null}
                          <span className="text-xs">{typeLabel}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeRecord(record.id);
                        }}
                        className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-red-500/80 group-hover:opacity-100"
                        title={t('common.delete', { defaultValue: '删除' })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-3">
                      <p className="line-clamp-3 text-xs leading-relaxed text-text-dark" title={content}>
                        {content || t('app.noPrompt', { defaultValue: '无内容' })}
                      </p>
                      <div className="mt-3 border-t border-[var(--ui-border-soft)] pt-2 text-[10px] text-text-muted">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate uppercase tracking-wide opacity-80">{record.model || 'unknown'}</span>
                          <span className="shrink-0 font-medium">{format(record.createdAt)}</span>
                        </div>
                        {revealPath ? (
                          <div className="mt-1 truncate opacity-70">{revealPath}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

HistoryDialog.displayName = 'HistoryDialog';
