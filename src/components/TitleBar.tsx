import { useCallback, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ArrowLeft, History, Languages, Maximize2, Minus, Moon, Settings, Sun, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useThemeStore } from '@/stores/themeStore';
import { useProjectStore } from '@/stores/projectStore';
import closeNormalIcon from '@/assets/macos-traffic-lights/1-close-1-normal.svg';
import closeHoverIcon from '@/assets/macos-traffic-lights/2-close-2-hover.svg';
import minimizeNormalIcon from '@/assets/macos-traffic-lights/2-minimize-1-normal.svg';
import minimizeHoverIcon from '@/assets/macos-traffic-lights/2-minimize-2-hover.svg';
import maximizeNormalIcon from '@/assets/macos-traffic-lights/3-maximize-1-normal.svg';
import maximizeHoverIcon from '@/assets/macos-traffic-lights/3-maximize-2-hover.svg';

interface TitleBarProps {
  onSettingsClick: () => void;
  onHistoryClick?: () => void;
  showBackButton?: boolean;
  onBackClick?: () => void;
}

function TitlebarToolButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-no-drag="true"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-transparent text-text-muted transition-all duration-150 hover:-translate-y-px hover:border-[var(--ui-border-soft)] hover:bg-[var(--ui-surface-field)] hover:text-text-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.22)]"
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export function TitleBar({ onSettingsClick, showBackButton, onBackClick, onHistoryClick }: TitleBarProps) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useThemeStore();
  const currentProjectName = useProjectStore((state) => state.currentProject?.name);

  const appWindow = getCurrentWindow();
  const isZh = i18n.language.startsWith('zh');
  const isMac =
    typeof navigator !== 'undefined'
    && /(Mac|iPhone|iPad|iPod)/i.test(`${navigator.platform} ${navigator.userAgent}`);
  const appTitle = t('app.title');
  const titleText = currentProjectName ? `${currentProjectName}` : appTitle;

  const handleMinimize = useCallback(async () => {
    await appWindow.minimize();
  }, [appWindow]);

  const handleMaximize = useCallback(async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  }, [appWindow]);

  const handleClose = useCallback(async () => {
    await appWindow.close();
  }, [appWindow]);

  const handleDragStart = useCallback(async (event: React.MouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('button') || target?.closest('[data-no-drag="true"]')) {
      return;
    }
    await appWindow.startDragging();
  }, [appWindow]);

  const handleLanguageClick = useCallback(() => {
    const nextLanguage = isZh ? 'en' : 'zh';
    void i18n.changeLanguage(nextLanguage);
  }, [i18n, isZh]);

  const subtitle = currentProjectName
    ? t('titleBar.workspaceMode', { defaultValue: 'Storyboard Workspace' })
    : t('app.subtitle');

  return (
    <div className="relative z-50 flex h-12 items-center justify-between border-b border-[var(--ui-border-soft)] bg-[linear-gradient(180deg,rgba(var(--titlebar-bg-rgb),0.98),rgba(var(--titlebar-bg-rgb),0.92))]">
      {isMac ? (
        <div className="group flex h-full items-center gap-2 pl-3 pr-2" data-no-drag="true">
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void handleClose()}
            className="relative flex h-3 w-3 items-center justify-center"
            title={t('titleBar.close')}
            aria-label={t('titleBar.close')}
          >
            <img src={closeNormalIcon} alt="" className="pointer-events-none h-3 w-3 opacity-100 transition-opacity group-hover:opacity-0" />
            <img src={closeHoverIcon} alt="" className="pointer-events-none absolute h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void handleMinimize()}
            className="relative flex h-3 w-3 items-center justify-center"
            title={t('titleBar.minimize')}
            aria-label={t('titleBar.minimize')}
          >
            <img src={minimizeNormalIcon} alt="" className="pointer-events-none h-3 w-3 opacity-100 transition-opacity group-hover:opacity-0" />
            <img src={minimizeHoverIcon} alt="" className="pointer-events-none absolute h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => void handleMaximize()}
            className="relative flex h-3 w-3 items-center justify-center"
            title={t('titleBar.maximize')}
            aria-label={t('titleBar.maximize')}
          >
            <img src={maximizeNormalIcon} alt="" className="pointer-events-none h-3 w-3 opacity-100 transition-opacity group-hover:opacity-0" />
            <img src={maximizeHoverIcon} alt="" className="pointer-events-none absolute h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </div>
      ) : null}

      <div className="flex h-full min-w-0 flex-1 items-center px-3.5" onMouseDown={handleDragStart}>
        {showBackButton && onBackClick ? (
          <button
            type="button"
            data-no-drag="true"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onBackClick}
            className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-transparent text-text-muted transition-all duration-150 hover:-translate-y-px hover:border-[var(--ui-border-soft)] hover:bg-[var(--ui-surface-field)] hover:text-text-dark"
            title={t('titleBar.back')}
            aria-label={t('titleBar.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}

        <div className="min-w-0">
          <div className="ui-display-title truncate text-[13px] uppercase leading-4 tracking-[0.08em] text-text-dark">
            {titleText}
          </div>
          <div className="truncate text-[10px] tracking-[0.04em] text-text-muted">
            {subtitle}
          </div>
        </div>
      </div>

      <div className="flex h-full items-center gap-2 pr-2.5" data-no-drag="true">
        <div className="flex items-center rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] px-1.5 shadow-[var(--ui-elevation-1)]">
          <TitlebarToolButton
            title={isZh ? t('titleBar.switchToEnglish') : t('titleBar.switchToChinese')}
            onClick={handleLanguageClick}
          >
            <Languages className="h-4 w-4" />
          </TitlebarToolButton>

          <TitlebarToolButton
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </TitlebarToolButton>

          {onHistoryClick ? (
            <TitlebarToolButton
              title={t('app.assetManager', { defaultValue: 'Asset Manager' })}
              onClick={onHistoryClick}
            >
              <History className="h-4 w-4" />
            </TitlebarToolButton>
          ) : null}

          <TitlebarToolButton
            title={t('settings.title')}
            onClick={onSettingsClick}
          >
            <Settings className="h-4 w-4" />
          </TitlebarToolButton>
        </div>

        {!isMac ? (
          <div className="flex items-center rounded-[var(--ui-radius-xl)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] p-1 shadow-[var(--ui-elevation-1)]">
            <TitlebarToolButton title={t('titleBar.minimize')} onClick={() => void handleMinimize()}>
              <Minus className="h-4 w-4" />
            </TitlebarToolButton>
            <TitlebarToolButton title={t('titleBar.maximize')} onClick={() => void handleMaximize()}>
              <Maximize2 className="h-4 w-4" />
            </TitlebarToolButton>
            <button
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => void handleClose()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--ui-radius-lg)] border border-transparent text-text-muted transition-all duration-150 hover:border-red-500/30 hover:bg-red-500 hover:text-white"
              title={t('titleBar.close')}
              aria-label={t('titleBar.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}


