import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, LoaderCircle, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';

import { useProjectStore } from '@/stores/projectStore';
import { getConfiguredProviderCount, useSettingsStore } from '@/stores/settingsStore';
import { UI_CONTENT_OVERLAY_INSET_CLASS } from '@/components/ui/motion';
import { UiButton, UiSelect } from '@/components/ui/primitives';
import { MissingApiKeyHint } from '@/features/settings/MissingApiKeyHint';
import { RenameDialog } from './RenameDialog';

type ProjectSortField = 'name' | 'createdAt' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

export function ProjectManager() {
  const { t } = useTranslation();
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [sortField, setSortField] = useState<ProjectSortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const configuredApiKeyCount = useSettingsStore((state) => getConfiguredProviderCount(state));

  const { projects, isOpeningProject, createProject, deleteProject, renameProject, openProject } =
    useProjectStore();

  const handleCreateProject = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
    setShowRenameDialog(true);
  };

  const handleRenameClick = (id: string, name: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingProjectId(id);
    setEditingProjectName(name);
    setShowRenameDialog(true);
  };

  const handleDeleteClick = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    deleteProject(id);
  };

  const handleConfirm = (name: string) => {
    if (editingProjectId) {
      renameProject(editingProjectId, name);
      return;
    }
    createProject(name);
  };

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();

  const sortedProjects = useMemo(() => {
    const list = [...projects];
    const direction = sortDirection === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      if (sortField === 'name') {
        return a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' }) * direction;
      }

      const left = sortField === 'createdAt' ? a.createdAt : a.updatedAt;
      const right = sortField === 'createdAt' ? b.createdAt : b.updatedAt;
      return (left - right) * direction;
    });

    return list;
  }, [projects, sortDirection, sortField]);

  return (
    <div className="ui-scrollbar h-full w-full overflow-auto p-5 md:p-8">
      <div className="mx-auto max-w-6xl animate-[ui-fade-slide-in_var(--ui-duration-normal)_var(--ui-ease-standard)] space-y-6">
        <section className="ui-card px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(var(--accent-rgb),0.24)] bg-[rgba(var(--accent-rgb),0.1)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-text-dark">
                <Sparkles className="h-3.5 w-3.5" />
                {t('project.title')}
              </div>
              <h1 className="ui-display-title mt-3 text-xl uppercase tracking-[0.08em] text-text-dark md:text-2xl">
                {t('project.title')}
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                {t('project.emptyHint', { defaultValue: 'Create and manage your canvas projects.' })}
              </p>
            </div>

            <div className="flex min-w-[240px] flex-1 flex-wrap items-center justify-end gap-2">
              <UiSelect
                aria-label={t('project.sortBy')}
                value={sortField}
                onChange={(event) => setSortField(event.target.value as ProjectSortField)}
                className="w-[130px]"
              >
                <option value="name">{t('project.sortByName')}</option>
                <option value="createdAt">{t('project.sortByCreatedAt')}</option>
                <option value="updatedAt">{t('project.sortByUpdatedAt')}</option>
              </UiSelect>

              <UiSelect
                aria-label={t('project.sortDirection')}
                value={sortDirection}
                onChange={(event) => setSortDirection(event.target.value as SortDirection)}
                className="w-[108px]"
              >
                <option value="asc">{t('project.sortAsc')}</option>
                <option value="desc">{t('project.sortDesc')}</option>
              </UiSelect>

              <UiButton type="button" variant="primary" onClick={handleCreateProject} className="shrink-0">
                <Plus className="h-4 w-4" />
                {t('project.newProject')}
              </UiButton>
            </div>
          </div>
        </section>

        {configuredApiKeyCount === 0 ? <MissingApiKeyHint /> : null}

        {sortedProjects.length === 0 ? (
          <section className="ui-empty-state flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="rounded-2xl border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] p-4 text-text-muted">
              <FolderOpen className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-text-dark">{t('project.empty')}</p>
              <p className="text-sm text-text-muted">{t('project.emptyHint')}</p>
            </div>
            <UiButton type="button" variant="muted" onClick={handleCreateProject}>
              <Plus className="h-4 w-4" />
              {t('project.newProject')}
            </UiButton>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sortedProjects.map((project) => (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => openProject(project.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openProject(project.id);
                  }
                }}
                className="ui-card group flex w-full cursor-pointer flex-col items-start gap-3 p-4 text-left transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-[rgba(var(--accent-rgb),0.34)] hover:shadow-[0_16px_32px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.24)]"
                aria-label={`${t('project.open')}: ${project.name}`}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <h3 className="line-clamp-1 text-sm font-semibold text-text-dark md:text-base">{project.name}</h3>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <button
                      type="button"
                      onClick={(event) => handleRenameClick(project.id, project.name, event)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-transparent text-text-muted transition-colors hover:border-[var(--ui-border-soft)] hover:bg-[var(--ui-surface-field)] hover:text-text-dark"
                      title={t('project.rename')}
                      aria-label={t('project.rename')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => handleDeleteClick(project.id, event)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-transparent text-text-muted transition-colors hover:border-red-400/35 hover:bg-red-500/12 hover:text-red-300"
                      title={t('project.delete')}
                      aria-label={t('project.delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="w-full space-y-1 rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2">
                  <p className="text-xs text-text-muted">
                    {t('project.modified')}: <span className="text-text-dark">{formatDate(project.updatedAt)}</span>
                  </p>
                  <p className="text-xs text-text-muted">
                    {t('project.created')}: <span className="text-text-dark">{formatDate(project.createdAt)}</span>
                  </p>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      {isOpeningProject ? (
        <div className={`fixed ${UI_CONTENT_OVERLAY_INSET_CLASS} z-20 flex items-center justify-center bg-black/30 backdrop-blur-[2px]`}>
          <div className="ui-card inline-flex items-center gap-2 px-4 py-2 text-sm text-text-dark">
            <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
            {t('project.open', { defaultValue: 'Open Project' })}
          </div>
        </div>
      ) : null}

      <RenameDialog
        isOpen={showRenameDialog}
        title={editingProjectId ? t('project.renameTitle') : t('project.newProjectTitle')}
        defaultValue={editingProjectName}
        onClose={() => setShowRenameDialog(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
