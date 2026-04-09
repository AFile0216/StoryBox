const fs = require('fs');

let appC = fs.readFileSync('src/App.tsx', 'utf8');
appC = appC.replace(
  'const [showSettings, setShowSettings] = useState(false);',
  'const [showSettings, setShowSettings] = useState(false);\n  const [isHistoryOpen, setIsHistoryOpen] = useState(false);'
);
appC = appC.replace(
  '<TitleBar onSettingsClick={() => setShowSettings(true)} />',
  '<TitleBar onSettingsClick={() => setShowSettings(true)} onHistoryClick={() => setIsHistoryOpen(true)} />'
);
fs.writeFileSync('src/App.tsx', appC, 'utf8');

let storeC = fs.readFileSync('src/stores/canvasStore.ts', 'utf8');
storeC = storeC.replace(
  "node.type === CANVAS_NODE_TYPES.imageEdit || node.type === CANVAS_NODE_TYPES.storyboardGen",
  "node.type === CANVAS_NODE_TYPES.imageEdit || node.type === CANVAS_NODE_TYPES.storyboardGen"
);
storeC = storeC.replace(
  "model: String((node.data as any).generationProviderId || 'unknown'),",
  "model: String((node.data as any).generationProviderId || 'unknown') as string,"
);
fs.writeFileSync('src/stores/canvasStore.ts', storeC, 'utf8');

console.log('done');
