import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n/useI18n';

const control =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle ' +
  'transition-colors hover:border-line-strong focus:border-accent focus:outline-none ' +
  'focus-visible:outline-none aria-[invalid=true]:border-danger';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  optional?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, optional, hint, children, className }: FieldProps) {
  const { t } = useI18n();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink">
        {label}
        {optional ? <span className="text-[12px] font-normal text-ink-subtle">({t('common.optional')})</span> : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-danger-text">
          <AlertCircle size={13} aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(control, 'h-9', className)} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(control, 'resize-y py-2 leading-relaxed', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(control, 'h-9 cursor-pointer appearance-none bg-[length:16px] pr-8', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23868e9c' stroke-width='2' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

/** Generates a stable id pair for label/control wiring. */
export function useFieldId(name: string): string {
  const id = useId();
  return `${name}-${id}`;
}
