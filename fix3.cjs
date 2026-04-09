const fs = require('fs');

let appC = fs.readFileSync('src/App.tsx', 'utf8');
if (!appC.includes('isHistoryOpen')) {
  appC = appC.replace(
    'const [isSettingsOpen, setIsSettingsOpen] = useState(false);',
    'const [isSettingsOpen, setIsSettingsOpen] = useState(false);\n  const [isHistoryOpen, setIsHistoryOpen] = useState(false);'
  );
  fs.writeFileSync('src/App.tsx', appC, 'utf8');
}

let storeC = fs.readFileSync('src/stores/canvasStore.ts', 'utf8');
storeC = storeC.replace(
  "node.type === CANVAS_NODE_TYPES.image || node.type === CANVAS_NODE_TYPES.storyboardGen",
  "node.type === CANVAS_NODE_TYPES.imageEdit || node.type === CANVAS_NODE_TYPES.storyboardGen"
);
storeC = storeC.replace(
  "model: String((node.data as any).generationProviderId ?? 'unknown'),",
  "model: ((node.data as any).generationProviderId as string) || 'unknown',"
);
fs.writeFileSync('src/stores/canvasStore.ts', storeC, 'utf8');

console.log('done');
