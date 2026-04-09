const fs = require('fs');

let appC = fs.readFileSync('src/App.tsx', 'utf8');
if (!appC.includes('isHistoryOpen')) {
  appC = appC.replace(
    'const [showSettings, setShowSettings] = useState(false);',
    'const [showSettings, setShowSettings] = useState(false);\n  const [isHistoryOpen, setIsHistoryOpen] = useState(false);'
  );
  fs.writeFileSync('src/App.tsx', appC, 'utf8');
}

let titleBarC = fs.readFileSync('src/components/TitleBar.tsx', 'utf8');
if (!titleBarC.includes('{onHistoryClick && (')) {
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

let storeC = fs.readFileSync('src/stores/canvasStore.ts', 'utf8');
storeC = storeC.replace(
  "model: ((node.data as any).generationProviderId as string) || 'unknown',",
  "model: String((node.data as any).generationProviderId || 'unknown'),"
);
fs.writeFileSync('src/stores/canvasStore.ts', storeC, 'utf8');

console.log('done');
