import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  collectNodeOwnedMediaReferences,
  type CanvasMediaKind,
} from '@/features/canvas/application/canvasMediaReferences';
import { isTextAnnotationNode, type CanvasNode } from '@/features/canvas/domain/canvasNodes';

export type AssetCategory = 'local' | 'character' | 'scene' | 'prop';
export type AssetSourceType = 'local' | 'generated' | 'linked';

export interface ProjectAsset {
  id: string;
  projectId: string;
  nodeId: string;
  nodeType: string;
  nodeTitle: string;
  category: AssetCategory;
  mediaType: CanvasMediaKind | 'text';
  sourceType: AssetSourceType;
  mediaUrl?: string | null;
  textContent?: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface AssetStoreState {
  assetsByProject: Record<string, ProjectAsset[]>;
  activeCategoryByProject: Record<string, AssetCategory>;
  getProjectAssets: (projectId: string, category?: AssetCategory | 'all') => ProjectAsset[];
  getProjectAssetCount: (projectId: string, category?: AssetCategory | 'all') => number;
  getActiveCategory: (projectId: string) => AssetCategory;
  setActiveCategory: (projectId: string, category: AssetCategory) => void;
  syncProjectAssetsFromNodes: (projectId: string | null | undefined, nodes: CanvasNode[]) => void;
  archiveNodeToCategory: (
    projectId: string | null | undefined,
    node: CanvasNode | null | undefined,
    category: AssetCategory
  ) => number;
  updateAssetCategory: (
    projectId: string,
    assetId: string,
    category: AssetCategory
  ) => void;
  removeAsset: (projectId: string, assetId: string) => void;
  clearProjectAssets: (projectId: string) => void;
}

const DEFAULT_ASSET_CATEGORY: AssetCategory = 'local';
const MAX_PROJECT_ASSETS = 600;

function createAssetId(): string {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeProjectId(projectId: string | null | undefined): string {
  return (projectId ?? '').trim();
}

function resolveTextAsset(node: CanvasNode, projectId: string, category: AssetCategory): ProjectAsset[] {
  if (!isTextAnnotationNode(node)) {
    return [];
  }
  const content = typeof node.data.content === 'string' ? node.data.content.trim() : '';
  if (!content) {
    return [];
  }
  const sourceType: AssetSourceType =
    (node.data as { lastGeneratedAt?: number | null }).lastGeneratedAt ? 'generated' : 'local';
  const title = content.split('\n').find((line) => line.trim().length > 0)?.trim() ?? 'Text';
  return [
    {
      id: createAssetId(),
      projectId,
      nodeId: node.id,
      nodeType: node.type,
      nodeTitle: node.data.displayName ? String(node.data.displayName) : title,
      category,
      mediaType: 'text',
      sourceType,
      mediaUrl: null,
      textContent: content,
      title: title.slice(0, 120),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}

function resolveNodeAssets(
  node: CanvasNode,
  projectId: string,
  category: AssetCategory
): ProjectAsset[] {
  const mediaAssets: ProjectAsset[] = collectNodeOwnedMediaReferences(node).map((reference) => ({
    id: createAssetId(),
    projectId,
    nodeId: reference.nodeId,
    nodeType: reference.nodeType,
    nodeTitle: reference.nodeTitle,
    category,
    mediaType: reference.mediaKind,
    sourceType: reference.origin === 'local' ? 'local' : 'generated',
    mediaUrl: reference.sourceUrl,
    textContent: null,
    title: reference.nodeTitle,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));

  const textAssets = resolveTextAsset(node, projectId, category);
  return [...mediaAssets, ...textAssets];
}

function dedupeAssets(assets: ProjectAsset[]): ProjectAsset[] {
  const seen = new Set<string>();
  const result: ProjectAsset[] = [];

  for (const asset of assets) {
    const identity = `${asset.nodeId}:${asset.mediaType}:${asset.mediaUrl ?? asset.textContent ?? ''}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    result.push(asset);
  }

  return result;
}

function resolveAssetIdentity(asset: Pick<ProjectAsset, 'nodeId' | 'mediaType' | 'mediaUrl' | 'textContent'>): string {
  return `${asset.nodeId}:${asset.mediaType}:${asset.mediaUrl ?? asset.textContent ?? ''}`;
}

export const useAssetStore = create<AssetStoreState>()(
  persist(
    (set, get) => ({
      assetsByProject: {},
      activeCategoryByProject: {},

      getProjectAssets: (projectId, category = 'all') => {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId) {
          return [];
        }
        const assets = get().assetsByProject[normalizedProjectId] ?? [];
        if (category === 'all') {
          return assets;
        }
        return assets.filter((asset) => asset.category === category);
      },

      getProjectAssetCount: (projectId, category = 'all') =>
        get().getProjectAssets(projectId, category).length,

      getActiveCategory: (projectId) => {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId) {
          return DEFAULT_ASSET_CATEGORY;
        }
        return get().activeCategoryByProject[normalizedProjectId] ?? DEFAULT_ASSET_CATEGORY;
      },

      setActiveCategory: (projectId, category) => {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId) {
          return;
        }
        set((state) => ({
          activeCategoryByProject: {
            ...state.activeCategoryByProject,
            [normalizedProjectId]: category,
          },
        }));
      },

      syncProjectAssetsFromNodes: (projectId, nodes) => {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId) {
          return;
        }

        set((state) => {
          const existing = state.assetsByProject[normalizedProjectId] ?? [];
          const existingByIdentity = new Map(
            existing.map((asset) => [resolveAssetIdentity(asset), asset])
          );

          const nextAssets = dedupeAssets(
            nodes.flatMap((node) => {
              const drafts = resolveNodeAssets(node, normalizedProjectId, DEFAULT_ASSET_CATEGORY);
              return drafts.map((draft) => {
                const identity = resolveAssetIdentity(draft);
                const previous = existingByIdentity.get(identity);
                return {
                  ...draft,
                  id: previous?.id ?? draft.id,
                  category: previous?.category ?? (draft.sourceType === 'local' ? 'local' : 'scene'),
                  createdAt: previous?.createdAt ?? draft.createdAt,
                  updatedAt: Date.now(),
                };
              });
            })
          ).slice(0, MAX_PROJECT_ASSETS);

          return {
            assetsByProject: {
              ...state.assetsByProject,
              [normalizedProjectId]: nextAssets,
            },
          };
        });
      },

      archiveNodeToCategory: (projectId, node, category) => {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId || !node) {
          return 0;
        }

        const nextAssets = resolveNodeAssets(node, normalizedProjectId, category);
        if (nextAssets.length === 0) {
          return 0;
        }

        let createdCount = 0;
        set((state) => {
          const existing = state.assetsByProject[normalizedProjectId] ?? [];
          const nextIdentitySet = new Set(nextAssets.map((asset) => resolveAssetIdentity(asset)));
          const existingByIdentity = new Map(
            existing.map((asset) => [resolveAssetIdentity(asset), asset])
          );
          const recategorized = nextAssets.map((asset) => {
            const previous = existingByIdentity.get(resolveAssetIdentity(asset));
            return {
              ...asset,
              id: previous?.id ?? asset.id,
              category,
              createdAt: previous?.createdAt ?? asset.createdAt,
              updatedAt: Date.now(),
            };
          });
          const untouched = existing.filter((asset) => !nextIdentitySet.has(resolveAssetIdentity(asset)));
          const merged = dedupeAssets([...recategorized, ...untouched]).slice(0, MAX_PROJECT_ASSETS);
          createdCount = recategorized.length;
          return {
            assetsByProject: {
              ...state.assetsByProject,
              [normalizedProjectId]: merged,
            },
          };
        });
        return createdCount;
      },

      updateAssetCategory: (projectId, assetId, category) => {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId || !assetId) {
          return;
        }
        set((state) => {
          const currentAssets = state.assetsByProject[normalizedProjectId] ?? [];
          return {
            assetsByProject: {
              ...state.assetsByProject,
              [normalizedProjectId]: currentAssets.map((asset) =>
                asset.id === assetId
                  ? { ...asset, category, updatedAt: Date.now() }
                  : asset
              ),
            },
          };
        });
      },

      removeAsset: (projectId, assetId) => {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId || !assetId) {
          return;
        }
        set((state) => ({
          assetsByProject: {
            ...state.assetsByProject,
            [normalizedProjectId]: (state.assetsByProject[normalizedProjectId] ?? []).filter(
              (asset) => asset.id !== assetId
            ),
          },
        }));
      },

      clearProjectAssets: (projectId) => {
        const normalizedProjectId = normalizeProjectId(projectId);
        if (!normalizedProjectId) {
          return;
        }
        set((state) => ({
          assetsByProject: {
            ...state.assetsByProject,
            [normalizedProjectId]: [],
          },
        }));
      },
    }),
    {
      name: 'storybox-assets',
    }
  )
);
