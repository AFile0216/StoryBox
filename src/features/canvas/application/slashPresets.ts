import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
  type CanvasNodeType,
  type StoryboardFrameItem,
} from '../domain/canvasNodes';

export type SlashPresetId =
  | 'multicam_9'
  | 'story_drama_4'
  | 'story_continuity_25'
  | 'character_triple_view'
  | 'scene_plus_3s'
  | 'scene_minus_5s'
  | 'cinematic_lighting_fix';

export type SlashPresetMenuIcon = 'layout' | 'sparkles' | 'video' | 'text';

export interface SlashPresetMenuDefinition {
  id: SlashPresetId;
  titleKey: string;
  menuIcon: SlashPresetMenuIcon;
  primaryType: CanvasNodeType;
}

export interface SlashWorkflowNodePlan {
  key: string;
  type: CanvasNodeType;
  offset: { x: number; y: number };
  data?: Partial<CanvasNodeData>;
}

export interface SlashWorkflowEdgePlan {
  from: string;
  to: string;
}

export interface SlashWorkflowPlan {
  nodes: SlashWorkflowNodePlan[];
  edges: SlashWorkflowEdgePlan[];
  primaryNodeKey: string;
}

export interface SlashExecutionPlan {
  id: SlashPresetId;
  workflow: SlashWorkflowPlan;
}

function createStoryboardFrames(rows: number, cols: number, frameAspectRatio = '1:1'): StoryboardFrameItem[] {
  const frameCount = Math.max(1, rows * cols);
  return Array.from({ length: frameCount }, (_item, index) => ({
    id: crypto.randomUUID(),
    imageUrl: null,
    previewImageUrl: null,
    aspectRatio: frameAspectRatio,
    note: '',
    order: index,
  }));
}

function createStoryboardWorkflow(
  id: SlashPresetId,
  rows: number,
  cols: number,
  options?: {
    includePromptNode?: boolean;
    promptMode?: 'plain-text' | 'text-to-image-prompt';
    promptContent?: string;
  }
): SlashExecutionPlan {
  const frameAspectRatio = '1:1';
  const composeNode: SlashWorkflowNodePlan = {
    key: 'compose',
    type: CANVAS_NODE_TYPES.storyboardCompose,
    offset: { x: 0, y: 0 },
    data: {
      gridRows: rows,
      gridCols: cols,
      aspectRatio: frameAspectRatio,
      frameAspectRatio,
      frames: createStoryboardFrames(rows, cols, frameAspectRatio),
    },
  };
  const genNode: SlashWorkflowNodePlan = {
    key: 'gen',
    type: CANVAS_NODE_TYPES.storyboardGen,
    offset: { x: 360, y: 0 },
    data: {
      gridRows: rows,
      gridCols: cols,
      requestAspectRatio: frameAspectRatio,
    },
  };

  if (!options?.includePromptNode) {
    return {
      id,
      workflow: {
        nodes: [composeNode, genNode],
        edges: [{ from: 'compose', to: 'gen' }],
        primaryNodeKey: 'gen',
      },
    };
  }

  return {
    id,
    workflow: {
      nodes: [
        {
          key: 'prompt',
          type: CANVAS_NODE_TYPES.textAnnotation,
          offset: { x: -320, y: 0 },
          data: {
            mode: options.promptMode ?? 'text-to-image-prompt',
            content: options.promptContent ?? '',
          },
        },
        composeNode,
        genNode,
      ],
      edges: [
        { from: 'compose', to: 'gen' },
        { from: 'prompt', to: 'gen' },
      ],
      primaryNodeKey: 'gen',
    },
  };
}

const PRESET_PLAN_MAP: Record<SlashPresetId, SlashExecutionPlan> = {
  multicam_9: createStoryboardWorkflow('multicam_9', 3, 3),
  story_drama_4: createStoryboardWorkflow('story_drama_4', 2, 2),
  story_continuity_25: createStoryboardWorkflow('story_continuity_25', 5, 5),
  character_triple_view: createStoryboardWorkflow('character_triple_view', 1, 3, {
    includePromptNode: true,
    promptMode: 'text-to-image-prompt',
    promptContent: '',
  }),
  scene_plus_3s: {
    id: 'scene_plus_3s',
    workflow: {
      nodes: [
        {
          key: 'upload',
          type: CANVAS_NODE_TYPES.upload,
          offset: { x: -320, y: 0 },
          data: {},
        },
        {
          key: 'edit',
          type: CANVAS_NODE_TYPES.imageEdit,
          offset: { x: 320, y: 0 },
          data: {
            taskMode: 'image-to-image',
            prompt: '在保持同一角色与场景连续性的前提下，推演当前画面 3 秒后的状态，补充合理的动作与镜头变化，电影感构图，高清细节。',
          },
        },
      ],
      edges: [{ from: 'upload', to: 'edit' }],
      primaryNodeKey: 'edit',
    },
  },
  scene_minus_5s: {
    id: 'scene_minus_5s',
    workflow: {
      nodes: [
        {
          key: 'upload',
          type: CANVAS_NODE_TYPES.upload,
          offset: { x: -320, y: 0 },
          data: {},
        },
        {
          key: 'edit',
          type: CANVAS_NODE_TYPES.imageEdit,
          offset: { x: 320, y: 0 },
          data: {
            taskMode: 'image-to-image',
            prompt: '在保持同一角色与场景连续性的前提下，反推当前画面 5 秒前的状态，补全合理的动作前序与镜头关系，电影感构图，高清细节。',
          },
        },
      ],
      edges: [{ from: 'upload', to: 'edit' }],
      primaryNodeKey: 'edit',
    },
  },
  cinematic_lighting_fix: {
    id: 'cinematic_lighting_fix',
    workflow: {
      nodes: [
        {
          key: 'upload',
          type: CANVAS_NODE_TYPES.upload,
          offset: { x: -320, y: 0 },
          data: {},
        },
        {
          key: 'prompt',
          type: CANVAS_NODE_TYPES.textAnnotation,
          offset: { x: 0, y: -220 },
          data: {
            mode: 'text-to-image-prompt',
            content: '',
          },
        },
        {
          key: 'edit',
          type: CANVAS_NODE_TYPES.imageEdit,
          offset: { x: 320, y: 0 },
          data: {
            taskMode: 'image-to-image',
            prompt: 'cinematic lighting adjustment',
          },
        },
      ],
      edges: [
        { from: 'upload', to: 'edit' },
        { from: 'prompt', to: 'edit' },
      ],
      primaryNodeKey: 'edit',
    },
  },
};

export const SLASH_PRESET_MENU_DEFINITIONS: SlashPresetMenuDefinition[] = [
  {
    id: 'multicam_9',
    titleKey: 'node.menu.slash.multicam9',
    menuIcon: 'layout',
    primaryType: CANVAS_NODE_TYPES.storyboardGen,
  },
  {
    id: 'story_drama_4',
    titleKey: 'node.menu.slash.storyDrama4',
    menuIcon: 'layout',
    primaryType: CANVAS_NODE_TYPES.storyboardGen,
  },
  {
    id: 'story_continuity_25',
    titleKey: 'node.menu.slash.storyContinuity25',
    menuIcon: 'layout',
    primaryType: CANVAS_NODE_TYPES.storyboardGen,
  },
  {
    id: 'character_triple_view',
    titleKey: 'node.menu.slash.characterTripleView',
    menuIcon: 'sparkles',
    primaryType: CANVAS_NODE_TYPES.storyboardGen,
  },
  {
    id: 'scene_plus_3s',
    titleKey: 'node.menu.slash.scenePlus3s',
    menuIcon: 'sparkles',
    primaryType: CANVAS_NODE_TYPES.imageEdit,
  },
  {
    id: 'scene_minus_5s',
    titleKey: 'node.menu.slash.sceneMinus5s',
    menuIcon: 'sparkles',
    primaryType: CANVAS_NODE_TYPES.imageEdit,
  },
  {
    id: 'cinematic_lighting_fix',
    titleKey: 'node.menu.slash.cinematicLightingFix',
    menuIcon: 'sparkles',
    primaryType: CANVAS_NODE_TYPES.imageEdit,
  },
];

export function getSlashPresetPlan(id: SlashPresetId): SlashExecutionPlan | null {
  return PRESET_PLAN_MAP[id] ?? null;
}
