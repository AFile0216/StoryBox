import { useTranslation } from 'react-i18next';
import { UiButton } from '@/components/ui/primitives';
import { openSettingsDialog } from './settingsEvents';

interface MissingApiKeyHintProps {
  className?: string;
}

export function MissingApiKeyHint({ className = '' }: MissingApiKeyHintProps) {
  const { t } = useTranslation();

  return (
    <div className={`flex w-full justify-center ${className}`}>
      <div className="ui-card pointer-events-auto inline-flex max-w-[760px] items-center gap-3 px-5 py-4 text-center">
        <p className="text-sm leading-7 text-text-muted sm:text-[15px]">
          {t('settings.missingAnyApiKeyMessage')}
        </p>
        <UiButton
          type="button"
          variant="primary"
          size="sm"
          className="shrink-0"
          onClick={() => openSettingsDialog({ category: 'providers' })}
        >
          {t('settings.openProvidersSettings')}
        </UiButton>
      </div>
    </div>
  );
}
