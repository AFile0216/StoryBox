const fs = require('fs');

// 1. Fix App.tsx
let appC = fs.readFileSync('src/App.tsx', 'utf8');
if (!appC.includes('isHistoryOpen')) {
  appC = appC.replace(
    'const [isSettingsOpen, setIsSettingsOpen] = useState(false);',
    'const [isSettingsOpen, setIsSettingsOpen] = useState(false);\n  const [isHistoryOpen, setIsHistoryOpen] = useState(false);'
  );
  fs.writeFileSync('src/App.tsx', appC, 'utf8');
}

// 2. Fix TitleBar.tsx
let titleBarC = fs.readFileSync('src/components/TitleBar.tsx', 'utf8');
if (titleBarC.includes('{onHistoryClick && (')) {
  // It's already using it
} else if (titleBarC.includes('onHistoryClick')) {
  const oldBtn = `<button
          type="button"
          onClick={onSettingsClick}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] text-text-muted hover:bg-white/5 hover:text-text-dark"
          title={t('settings.title')}
        >
          <Settings className="h-[14px] w-[14px]" />
        </button>`;

  const newBtn = `{onHistoryClick && (
          <button
            type="button"
            onClick={onHistoryClick}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] text-text-muted hover:bg-white/5 hover:text-text-dark"
            title={t('app.history', { defaultValue: '历史记录' })}
          >
            <History className="h-[14px] w-[14px]" />
          </button>
        )}
        <button
          type="button"
          onClick={onSettingsClick}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] text-text-muted hover:bg-white/5 hover:text-text-dark"
          title={t('settings.title')}
        >
          <Settings className="h-[14px] w-[14px]" />
        </button>`;
  titleBarC = titleBarC.replace(oldBtn, newBtn);
  fs.writeFileSync('src/components/TitleBar.tsx', titleBarC, 'utf8');
}

// 3. Fix HistoryDialog.tsx unused `fmt`
let histC = fs.readFileSync('src/components/HistoryDialog.tsx', 'utf8');
histC = histC.replace('function format(timestamp: number, fmt: string) {', 'function format(timestamp: number, _fmt: string) {');
fs.writeFileSync('src/components/HistoryDialog.tsx', histC, 'utf8');

// 4. Fix canvasStore.ts CanvasNodeType check and missing import
let storeC = fs.readFileSync('src/stores/canvasStore.ts', 'utf8');
if (!storeC.includes('import { useHistoryStore }')) {
  storeC = "import { useHistoryStore } from './historyStore';\n" + storeC;
}
storeC = storeC.replace(
  "node.type === 'image_node' || node.type === 'storyboard_gen_node'",
  "node.type === 'image' || node.type === 'storyboardGen'"
);
fs.writeFileSync('src/stores/canvasStore.ts', storeC, 'utf8');

// 5. Fix VideoNode.tsx unused useState
let videoC = fs.readFileSync('src/features/canvas/nodes/VideoNode.tsx', 'utf8');
videoC = videoC.replace("import { memo, useMemo, useRef, useState } from 'react';", "import { memo, useMemo, useRef } from 'react';");
fs.writeFileSync('src/features/canvas/nodes/VideoNode.tsx', videoC, 'utf8');

console.log('Fixed all TS errors');
