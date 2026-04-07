import type { PromptTemplate } from '../domain/promptTemplate';

/**
 * 内置提示词模板库
 */
export const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  // 风格类
  {
    id: 'style-realistic',
    name: '写实风格',
    category: 'style',
    content: 'photorealistic, realistic, photo, highly detailed',
    description: '真实照片风格',
    tags: ['写实', '照片'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'style-anime',
    name: '动漫风格',
    category: 'style',
    content: 'anime style, manga, cel shaded, vibrant colors',
    description: '日式动漫风格',
    tags: ['动漫', '二次元'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'style-oil-painting',
    name: '油画风格',
    category: 'style',
    content: 'oil painting, impressionism, brush strokes, artistic',
    description: '古典油画风格',
    tags: ['油画', '艺术'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'style-watercolor',
    name: '水彩风格',
    category: 'style',
    content: 'watercolor painting, soft colors, artistic, delicate',
    description: '水彩画风格',
    tags: ['水彩', '艺术'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // 质量类
  {
    id: 'quality-high',
    name: '高质量',
    category: 'quality',
    content: 'masterpiece, best quality, highly detailed, 8k, ultra high resolution',
    description: '提升画面质量',
    tags: ['质量', '高清'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'quality-professional',
    name: '专业级',
    category: 'quality',
    content: 'professional photography, award winning, sharp focus, perfect composition',
    description: '专业摄影级别',
    tags: ['专业', '摄影'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // 光照类
  {
    id: 'lighting-natural',
    name: '自然光',
    category: 'lighting',
    content: 'natural lighting, soft light, golden hour, warm tones',
    description: '柔和自然光线',
    tags: ['自然光', '柔和'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'lighting-dramatic',
    name: '戏剧光',
    category: 'lighting',
    content: 'dramatic lighting, cinematic lighting, rim light, high contrast',
    description: '电影感强烈光影',
    tags: ['戏剧', '电影'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'lighting-studio',
    name: '影棚光',
    category: 'lighting',
    content: 'studio lighting, professional lighting, three-point lighting',
    description: '专业影棚布光',
    tags: ['影棚', '专业'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // 镜头类
  {
    id: 'camera-closeup',
    name: '特写镜头',
    category: 'camera',
    content: 'close-up shot, portrait, shallow depth of field, bokeh background',
    description: '人物特写',
    tags: ['特写', '人像'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'camera-wide',
    name: '广角镜头',
    category: 'camera',
    content: 'wide angle shot, establishing shot, panoramic view, expansive',
    description: '场景全景',
    tags: ['广角', '全景'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'camera-aerial',
    name: '俯拍镜头',
    category: 'camera',
    content: 'aerial view, birds eye view, top down perspective, overhead shot',
    description: '从上往下拍摄',
    tags: ['俯拍', '鸟瞰'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // 场景类
  {
    id: 'scene-indoor',
    name: '室内场景',
    category: 'scene',
    content: 'interior, indoor scene, cozy atmosphere, ambient lighting',
    description: '室内环境',
    tags: ['室内', '环境'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'scene-outdoor',
    name: '户外场景',
    category: 'scene',
    content: 'outdoor, nature, landscape, open air, natural environment',
    description: '户外自然环境',
    tags: ['户外', '自然'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'scene-urban',
    name: '城市场景',
    category: 'scene',
    content: 'urban, city, modern architecture, street view, metropolitan',
    description: '现代城市环境',
    tags: ['城市', '现代'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // 人物类
  {
    id: 'character-expression-happy',
    name: '开心表情',
    category: 'character',
    content: 'smiling, happy expression, joyful, cheerful, bright eyes',
    description: '愉快的表情',
    tags: ['表情', '开心'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'character-expression-serious',
    name: '严肃表情',
    category: 'character',
    content: 'serious expression, focused, determined, intense gaze',
    description: '严肃认真的表情',
    tags: ['表情', '严肃'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'character-action-running',
    name: '奔跑动作',
    category: 'character',
    content: 'running, dynamic pose, motion blur, action shot, energetic',
    description: '动态奔跑姿势',
    tags: ['动作', '奔跑'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'character-action-standing',
    name: '站立姿势',
    category: 'character',
    content: 'standing pose, confident stance, full body, elegant posture',
    description: '优雅站立姿势',
    tags: ['动作', '站立'],
    isBuiltIn: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

/**
 * 根据分类获取模板
 */
export function getTemplatesByCategory(category: string): PromptTemplate[] {
  if (category === 'all') {
    return BUILT_IN_TEMPLATES;
  }
  return BUILT_IN_TEMPLATES.filter(t => t.category === category);
}

/**
 * 根据 ID 获取模板
 */
export function getTemplateById(id: string): PromptTemplate | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === id);
}
