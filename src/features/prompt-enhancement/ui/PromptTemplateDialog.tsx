import { useState, useCallback, useMemo } from 'react';
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import { BUILT_IN_TEMPLATES } from '../infrastructure/builtInTemplates';
import type { PromptTemplate, PromptTemplateCategory } from '../domain/promptTemplate';
import { useSettingsStore } from '@/stores/settingsStore';

interface PromptTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert?: (content: string) => void;
}

type TabCategory = PromptTemplateCategory | 'all';

const CATEGORY_LABELS: Record<TabCategory, string> = {
  all: '全部',
  style: '风格',
  scene: '场景',
  character: '人物',
  quality: '质量',
  lighting: '光照',
  camera: '镜头',
  custom: '自定义',
};

const CATEGORIES: TabCategory[] = ['all', 'style', 'scene', 'character', 'quality', 'lighting', 'camera', 'custom'];

interface EditingTemplate {
  id: string | null;
  name: string;
  category: PromptTemplateCategory;
  content: string;
  description: string;
}

const EMPTY_EDITING: EditingTemplate = {
  id: null,
  name: '',
  category: 'custom',
  content: '',
  description: '',
};

export function PromptTemplateDialog({ isOpen, onClose, onInsert }: PromptTemplateDialogProps) {
  const { promptTemplates, setPromptTemplates } = useSettingsStore();
  const [activeCategory, setActiveCategory] = useState<TabCategory>('all');
  const [editing, setEditing] = useState<EditingTemplate | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);

  const allTemplates = useMemo(() => [
    ...BUILT_IN_TEMPLATES,
    ...promptTemplates,
  ], [promptTemplates]);

  const filteredTemplates = useMemo(() => {
    if (activeCategory === 'all') return allTemplates;
    return allTemplates.filter(t => t.category === activeCategory);
  }, [allTemplates, activeCategory]);

  const handleInsert = useCallback((template: PromptTemplate) => {
    onInsert?.(template.content);
    setInsertedId(template.id);
    setTimeout(() => setInsertedId(null), 1500);
  }, [onInsert]);

  const handleDelete = useCallback((templateId: string) => {
    setPromptTemplates(promptTemplates.filter(t => t.id !== templateId));
  }, [promptTemplates, setPromptTemplates]);

  const handleStartEdit = useCallback((template?: PromptTemplate) => {
    if (template) {
      setEditing({
        id: template.id,
        name: template.name,
        category: template.category,
        content: template.content,
        description: template.description ?? '',
      });
    } else {
      setEditing({ ...EMPTY_EDITING });
    }
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editing || !editing.name.trim() || !editing.content.trim()) return;

    const now = Date.now();
    if (editing.id) {
      // 编辑现有
      setPromptTemplates(promptTemplates.map(t =>
        t.id === editing.id
          ? { ...t, name: editing.name.trim(), category: editing.category, content: editing.content.trim(), description: editing.description.trim(), updatedAt: now }
          : t
      ));
    } else {
      // 新增
      const newTemplate: PromptTemplate = {
        id: uuidv4(),
        name: editing.name.trim(),
        category: editing.category,
        content: editing.content.trim(),
        description: editing.description.trim(),
        isBuiltIn: false,
        createdAt: now,
        updatedAt: now,
      };
      setPromptTemplates([...promptTemplates, newTemplate]);
    }
    setEditing(null);
  }, [editing, promptTemplates, setPromptTemplates]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex h-[620px] w-[720px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-border-dark bg-surface shadow-2xl">

        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-border-dark px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-dark">提示词模板库</h2>
            <p className="mt-0.5 text-xs text-text-muted">选择并插入常用提示词片段</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-dark hover:text-text-dark"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 分类标签 */}
        <div className="flex gap-1 overflow-x-auto border-b border-border-dark px-4 py-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:bg-bg-dark hover:text-text-dark'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* 主内容区 */}
        <div className="flex min-h-0 flex-1 flex-col">
          {editing ? (
            /* 编辑表单 */
            <div className="flex flex-col gap-4 overflow-y-auto p-6">
              <h3 className="text-sm font-medium text-text-dark">
                {editing.id ? '编辑模板' : '新建模板'}
              </h3>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-xs text-text-muted">名称 *</label>
                  <input
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    placeholder="模板名称"
                    className="w-full rounded-lg border border-border-dark bg-bg-dark px-3 py-2 text-sm text-text-dark placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="w-32">
                  <label className="mb-1.5 block text-xs text-text-muted">分类</label>
                  <select
                    value={editing.category}
                    onChange={e => setEditing({ ...editing, category: e.target.value as PromptTemplateCategory })}
                    className="w-full rounded-lg border border-border-dark bg-bg-dark px-3 py-2 text-sm text-text-dark focus:border-accent focus:outline-none"
                  >
                    {CATEGORIES.filter(c => c !== 'all').map(cat => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-text-muted">提示词内容 *</label>
                <textarea
                  value={editing.content}
                  onChange={e => setEditing({ ...editing, content: e.target.value })}
                  placeholder="输入提示词内容，例如：masterpiece, best quality, highly detailed"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-border-dark bg-bg-dark px-3 py-2 text-sm text-text-dark placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-text-muted">描述（可选）</label>
                <input
                  value={editing.description}
                  onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="简要描述这个模板的用途"
                  className="w-full rounded-lg border border-border-dark bg-bg-dark px-3 py-2 text-sm text-text-dark placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-border-dark px-4 py-2 text-sm text-text-muted transition-colors hover:bg-bg-dark hover:text-text-dark"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editing.name.trim() || !editing.content.trim()}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            /* 模板列表 */
            <div className="ui-scrollbar flex-1 overflow-y-auto p-4">
              {filteredTemplates.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-text-muted">
                  <p className="text-sm">暂无模板</p>
                  <p className="mt-1 text-xs">点击下方按钮创建自定义模板</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredTemplates.map(template => (
                    <div
                      key={template.id}
                      className="group relative flex flex-col gap-1.5 rounded-xl border border-border-dark bg-bg-dark p-3 transition-colors hover:border-accent/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-text-dark">
                              {template.name}
                            </span>
                            {template.isBuiltIn && (
                              <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[10px] text-accent">
                                内置
                              </span>
                            )}
                          </div>
                          {template.description && (
                            <p className="mt-0.5 truncate text-xs text-text-muted">
                              {template.description}
                            </p>
                          )}
                        </div>
                        {!template.isBuiltIn && (
                          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => handleStartEdit(template)}
                              className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface hover:text-text-dark"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(template.id)}
                              className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-text-muted/80">
                        {template.content}
                      </p>
                      {onInsert && (
                        <button
                          onClick={() => handleInsert(template)}
                          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-dark py-1.5 text-xs text-text-muted transition-colors hover:border-accent/60 hover:bg-accent/8 hover:text-accent"
                        >
                          {insertedId === template.id ? (
                            <>
                              <Check className="h-3 w-3 text-green-400" />
                              <span className="text-green-400">已插入</span>
                            </>
                          ) : (
                            '插入到提示词'
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        {!editing && (
          <div className="flex items-center justify-between border-t border-border-dark px-6 py-3">
            <span className="text-xs text-text-muted">
              共 {filteredTemplates.length} 个模板
            </span>
            <button
              onClick={() => handleStartEdit()}
              className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
            >
              <Plus className="h-3.5 w-3.5" />
              新建模板
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
