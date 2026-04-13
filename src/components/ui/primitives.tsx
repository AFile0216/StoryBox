import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, LoaderCircle, X } from 'lucide-react';

import {
  UI_CONTENT_OVERLAY_INSET_CLASS,
  UI_DIALOG_TRANSITION_MS,
  UI_POPOVER_TRANSITION_MS,
} from './motion';
import { useDialogTransition } from './useDialogTransition';

type ButtonVariant = 'primary' | 'muted' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

interface UiIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

interface UiChipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

interface UiCheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

interface UiSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

interface UiSelectOption {
  value: string;
  label: ReactNode;
  disabled: boolean;
}

interface UiModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  containerClassName?: string;
}

const BUTTON_BASE_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-[var(--ui-radius-lg)] font-medium tracking-[0.01em] transition-[transform,border-color,background-color,color,box-shadow,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.26)]';

function resolveButtonVariant(variant: ButtonVariant): string {
  if (variant === 'primary') {
    return 'border border-[rgba(var(--accent-rgb),0.5)] bg-[rgba(var(--accent-rgb),0.88)] text-white shadow-[0_10px_24px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-px hover:bg-[rgba(var(--accent-rgb),0.96)] hover:shadow-[0_14px_30px_rgba(var(--accent-rgb),0.36)]';
  }

  if (variant === 'danger') {
    return 'border border-[rgba(239,68,68,0.38)] bg-[rgba(239,68,68,0.16)] text-[rgb(254,226,226)] hover:-translate-y-px hover:bg-[rgba(239,68,68,0.24)]';
  }

  if (variant === 'success') {
    return 'border border-[rgba(34,197,94,0.34)] bg-[rgba(34,197,94,0.16)] text-[rgb(220,252,231)] hover:-translate-y-px hover:bg-[rgba(34,197,94,0.24)]';
  }

  if (variant === 'ghost') {
    return 'border border-transparent bg-transparent text-text-dark hover:-translate-y-px hover:border-[var(--ui-border-soft)] hover:bg-[rgba(15,23,42,0.06)] dark:hover:bg-white/[0.05]';
  }

  return 'border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-text-dark hover:-translate-y-px hover:border-[var(--ui-border-strong)] hover:bg-white/80 dark:hover:bg-white/[0.06]';
}

function resolveButtonSize(size: ButtonSize): string {
  if (size === 'sm') {
    return 'h-8 px-3 text-xs';
  }
  if (size === 'lg') {
    return 'h-11 px-4 text-sm';
  }
  return 'h-10 px-3.5 text-sm';
}

export function UiButton({
  className = '',
  variant = 'muted',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}: UiButtonProps) {
  return (
    <button
      className={`${BUTTON_BASE_CLASS} ${resolveButtonVariant(variant)} ${resolveButtonSize(size)} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
      <span className={loading ? 'opacity-90' : ''}>{children}</span>
    </button>
  );
}

export function UiIconButton({ className = '', active = false, ...props }: UiIconButtonProps) {
  return (
    <button
      className={`inline-flex h-9 w-9 items-center justify-center rounded-[var(--ui-radius-lg)] border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.26)] ${
        active
          ? 'border-[rgba(var(--accent-rgb),0.42)] bg-[rgba(var(--accent-rgb),0.12)] text-text-dark'
          : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-text-muted hover:border-[var(--ui-border-strong)] hover:bg-white/85 hover:text-text-dark dark:hover:bg-white/[0.06]'
      } ${className}`}
      {...props}
    />
  );
}

export const UiChipButton = forwardRef<HTMLButtonElement, UiChipButtonProps>(
  ({ className = '', active = false, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs tracking-[0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.24)] ${
        active
          ? 'border-[rgba(var(--accent-rgb),0.46)] bg-[rgba(var(--accent-rgb),0.13)] text-text-dark shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)]'
          : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-text-muted hover:border-[var(--ui-border-strong)] hover:bg-white/80 hover:text-text-dark dark:hover:bg-white/[0.06]'
      } ${className}`}
      {...props}
    />
  )
);

UiChipButton.displayName = 'UiChipButton';

export function UiPanel({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-panel border p-0 ${className}`} {...props} />;
}

export function UiTextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full resize-none rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2.5 text-sm text-text-dark outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-text-muted/70 focus:border-[rgba(var(--accent-rgb),0.6)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)] ${className}`}
      {...props}
    />
  );
}

export const UiTextAreaField = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = '', ...props }, ref) => (
  <textarea
    ref={ref}
    className={`w-full resize-none rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2.5 text-sm text-text-dark outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-text-muted/70 focus:border-[rgba(var(--accent-rgb),0.6)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)] ${className}`}
    {...props}
  />
));

UiTextAreaField.displayName = 'UiTextAreaField';

export const UiInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] px-3 py-2 text-sm text-text-dark outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-text-muted/70 focus:border-[rgba(var(--accent-rgb),0.6)] focus:ring-2 focus:ring-[rgba(var(--accent-rgb),0.12)] ${className}`}
      {...props}
    />
  )
);

UiInput.displayName = 'UiInput';

export const UiCheckbox = forwardRef<HTMLButtonElement, UiCheckboxProps>(
  ({ className = '', checked, onCheckedChange, onClick, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`inline-flex h-5 w-5 items-center justify-center rounded border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.28)] ${
        checked
          ? 'border-[rgba(var(--accent-rgb),0.68)] bg-[rgba(var(--accent-rgb),0.2)] text-[rgba(var(--accent-rgb),1)]'
          : 'border-[var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-transparent hover:border-[var(--ui-border-strong)]'
      } ${className}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onCheckedChange?.(!checked);
        }
      }}
      {...props}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  )
);

UiCheckbox.displayName = 'UiCheckbox';

export function UiSelect({ className = '', children, invalid = false, ...props }: UiSelectProps) {
  const {
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    disabled,
    name,
    'aria-label': ariaLabel,
    ...selectProps
  } = props;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const hiddenSelectRef = useRef<HTMLSelectElement | null>(null);
  const listboxIdRef = useRef(`ui-select-${Math.random().toString(36).slice(2, 10)}`);
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ left: number; top: number; width: number }>({
    left: 0,
    top: 0,
    width: 0,
  });
  const { shouldRender: shouldRenderMenu, isVisible: isMenuVisible } = useDialogTransition(
    isOpen,
    UI_POPOVER_TRANSITION_MS
  );

  const parsedOptions = useMemo<UiSelectOption[]>(() => {
    return Children.toArray(children).flatMap((child) => {
      if (!isValidElement(child) || child.type !== 'option') {
        return [];
      }

      const optionValue = child.props.value ?? child.props.children;
      return [
        {
          value: String(optionValue ?? ''),
          label: child.props.children,
          disabled: Boolean(child.props.disabled),
        },
      ];
    });
  }, [children]);

  const initialValue = useMemo(() => {
    if (value != null) {
      return String(value);
    }

    if (defaultValue != null) {
      return String(defaultValue);
    }

    return parsedOptions.find((option) => !option.disabled)?.value ?? '';
  }, [defaultValue, parsedOptions, value]);

  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const isControlled = value != null;
  const selectedValue = isControlled ? String(value) : uncontrolledValue;
  const selectedOption =
    parsedOptions.find((option) => option.value === selectedValue) ??
    parsedOptions.find((option) => !option.disabled) ??
    null;

  useEffect(() => {
    if (!isControlled) {
      setUncontrolledValue(initialValue);
    }
  }, [initialValue, isControlled]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const estimatedMenuHeight = Math.min(Math.max(parsedOptions.length * 38 + 12, 60), 260);
      const openAbove = rect.bottom + 8 + estimatedMenuHeight > viewportHeight && rect.top > estimatedMenuHeight;
      setMenuStyle({
        left: rect.left,
        top: openAbove ? Math.max(8, rect.top - estimatedMenuHeight - 8) : rect.bottom + 8,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, parsedOptions.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target ?? null)) {
        return;
      }

      const menuElement = document.getElementById(listboxIdRef.current);
      if (menuElement?.contains(target ?? null)) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const commitValue = (nextValue: string) => {
    if (!isControlled) {
      setUncontrolledValue(nextValue);
    }

    if (hiddenSelectRef.current) {
      hiddenSelectRef.current.value = nextValue;
    }

    onChange?.({
      target: { value: nextValue, name },
      currentTarget: { value: nextValue, name },
    } as ChangeEvent<HTMLSelectElement>);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled || parsedOptions.length === 0) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen((current) => !current);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const enabledOptions = parsedOptions.filter((option) => !option.disabled);
      if (enabledOptions.length === 0) {
        return;
      }

      const currentIndex = enabledOptions.findIndex((option) => option.value === selectedValue);
      const fallbackIndex = event.key === 'ArrowDown' ? 0 : enabledOptions.length - 1;
      const nextIndex =
        currentIndex === -1
          ? fallbackIndex
          : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + enabledOptions.length) %
            enabledOptions.length;
      commitValue(enabledOptions[nextIndex].value);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <select
        ref={hiddenSelectRef}
        tabIndex={-1}
        aria-hidden="true"
        value={selectedValue}
        name={name}
        disabled={disabled}
        className="pointer-events-none absolute inset-0 opacity-0"
        onChange={() => undefined}
        {...selectProps}
      >
        {children}
      </select>

      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxIdRef.current}
        disabled={disabled}
        className={`group inline-flex h-9 w-full items-center justify-between rounded-[var(--ui-radius-lg)] border bg-[var(--ui-surface-field)] px-3 text-left text-xs font-medium text-text-dark outline-none transition-[border-color,background-color,box-shadow,color] duration-150 hover:border-[var(--ui-border-strong)] hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.2)] disabled:cursor-not-allowed disabled:opacity-55 ${
          invalid
            ? 'border-[rgba(239,68,68,0.42)]'
            : 'border-[var(--ui-border-soft)]'
        } ${className}`}
        onClick={() => {
          if (!disabled && parsedOptions.length > 0) {
            setIsOpen((current) => !current);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        onBlur={(event) => onBlur?.(event as never)}
        onFocus={(event) => onFocus?.(event as never)}
      >
        <span className="min-w-0 truncate pr-3">{selectedOption?.label ?? ''}</span>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted transition-colors group-hover:text-text-dark group-focus-visible:text-accent">
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            style={{ transitionDuration: `${UI_POPOVER_TRANSITION_MS}ms` }}
          />
        </span>
      </button>

      {shouldRenderMenu && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={listboxIdRef.current}
              role="listbox"
              aria-label={ariaLabel}
              className={`fixed z-[140] overflow-hidden rounded-[var(--ui-radius-lg)] border border-[var(--ui-border-soft)] bg-[var(--ui-surface-panel)] p-1 shadow-[var(--ui-shadow-panel)] transition-[opacity,transform] ease-out ${
                isMenuVisible
                  ? 'opacity-100 translate-y-0'
                  : 'pointer-events-none opacity-0 -translate-y-1'
              }`}
              style={{
                left: menuStyle.left,
                top: menuStyle.top,
                width: menuStyle.width,
                maxHeight: 260,
                transitionDuration: `${UI_POPOVER_TRANSITION_MS}ms`,
              }}
            >
              <div className="ui-scrollbar max-h-[248px] overflow-y-auto">
                {parsedOptions.map((option) => {
                  const isSelected = option.value === selectedValue;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-sm transition-colors ${
                        option.disabled
                          ? 'cursor-not-allowed opacity-40'
                          : isSelected
                            ? 'bg-[rgba(var(--accent-rgb),0.86)] text-white'
                            : 'text-text-dark hover:bg-[rgba(15,23,42,0.06)] dark:hover:bg-white/[0.08]'
                      }`}
                      onClick={() => {
                        if (option.disabled) {
                          return;
                        }
                        commitValue(option.value);
                        setIsOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected ? <Check className="ml-3 h-3.5 w-3.5 shrink-0 text-white" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function UiModal({
  isOpen,
  title,
  onClose,
  children,
  footer,
  widthClassName = 'w-[min(92vw,520px)]',
  containerClassName = '',
}: UiModalProps) {
  const { shouldRender, isVisible } = useDialogTransition(isOpen, UI_DIALOG_TRANSITION_MS);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className={`fixed ${UI_CONTENT_OVERLAY_INSET_CLASS} z-[120] flex items-center justify-center p-4 ${containerClassName}`}>
      <div
        className={`absolute inset-0 bg-black/58 backdrop-blur-[2px] transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <UiPanel
        className={`relative transition-[opacity,transform] duration-200 ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        } ${widthClassName}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--ui-border-soft)] px-4 py-3">
          <h2 className="ui-display-title text-[13px] uppercase tracking-[0.06em] text-text-dark">{title}</h2>
          <UiIconButton className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </UiIconButton>
        </div>

        <div className="px-4 py-4">{children}</div>

        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--ui-border-soft)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </UiPanel>
    </div>
  );
}
