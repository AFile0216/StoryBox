import { memo } from 'react';
import { X, ExternalLink, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useHistoryStore } from '@/stores/historyStore';
function format(timestamp: number, _fmt: string) { return new Date(timestamp).toLocaleString(); }

interface HistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryDialog = memo(({ isOpen, onClose }: HistoryDialogProps) => {
  const { t } = useTranslation();
  const records = useHistoryStore((state) => state.records);
  const removeRecord = useHistoryStore((state) => state.removeRecord);
  const clearHistory = useHistoryStore((state) => state.clearHistory);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-[var(--ui-border-soft)] bg-gradient-to-r from-accent/10 to-transparent px-6">
          <h2 className="text-lg font-semibold text-text-dark">
            {t('app.history', { defaultValue: '历史记录' })}
          </h2>
          <div className="flex items-center gap-3">
            {records.length > 0 && (
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

        <div className="flex-1 overflow-y-auto p-6 ui-scrollbar">
          {records.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-text-muted">
              <div className="mb-4 rounded-full bg-[var(--ui-surface-field)] p-4">
                <ExternalLink className="h-8 w-8 opacity-50" />
              </div>
              <p>{t('app.historyEmpty', { defaultValue: '暂无历史记录' })}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] transition-all hover:border-accent/40"
                  onContextMenu={async (e) => {
                    e.preventDefault();
                    if (record.filePath) {
                      try {
                        await revealItemInDir(record.filePath);
                      } catch (err) {
                        console.error('Failed to reveal file', err);
                      }
                    } else if (record.imageUrl.startsWith('file://')) {
                      try {
                        await revealItemInDir(record.imageUrl.replace('file://', ''));
                      } catch (err) {
                        console.error('Failed to reveal file', err);
                      }
                    }
                  }}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-black/20">
                    <img
                      src={record.imageUrl}
                      alt={record.prompt}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecord(record.id);
                      }}
                      className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 backdrop-blur-md transition-opacity hover:bg-red-500/80 group-hover:opacity-100"
                      title={t('common.delete', { defaultValue: '删除' })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-3">
                    <p className="line-clamp-2 text-xs leading-relaxed text-text-dark" title={record.prompt}>
                      {record.prompt || t('app.noPrompt', { defaultValue: '无提示词' })}
                    </p>
                    <div className="mt-3 flex items-center justify-between border-t border-[var(--ui-border-soft)] pt-2 text-[10px] text-text-muted">
                      <span className="truncate pr-2 uppercase tracking-wide opacity-70">
                        {record.model}
                      </span>
                      <span className="shrink-0 font-medium">
                        {format(record.createdAt, 'MM-dd HH:mm')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

HistoryDialog.displayName = 'HistoryDialog';
