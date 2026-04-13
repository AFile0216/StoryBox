import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { UiButton, UiInput, UiModal } from '@/components/ui/primitives';

interface RenameDialogProps {
  isOpen: boolean;
  title: string;
  defaultValue?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export function RenameDialog({
  isOpen,
  title,
  defaultValue = '',
  onClose,
  onConfirm,
}: RenameDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setName(defaultValue);
    }
  }, [defaultValue, isOpen]);

  const canConfirm = useMemo(() => name.trim().length > 0, [name]);

  const handleConfirm = () => {
    if (!canConfirm) {
      return;
    }
    onConfirm(name.trim());
    onClose();
  };

  return (
    <UiModal
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      widthClassName="w-[min(92vw,420px)]"
      footer={(
        <>
          <UiButton type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </UiButton>
          <UiButton type="button" variant="primary" onClick={handleConfirm} disabled={!canConfirm}>
            {t('common.confirm')}
          </UiButton>
        </>
      )}
    >
      <div className="space-y-2">
        <p className="text-xs text-text-muted">{t('project.name')}</p>
        <UiInput
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('project.namePlaceholder')}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleConfirm();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />
      </div>
    </UiModal>
  );
}
