import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-md ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
  'disabled:opacity-50 disabled:pointer-events-none select-none ' +
  'active:translate-y-px whitespace-nowrap';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover shadow-subtle',
  secondary:
    'bg-surface text-ink border border-line hover:bg-surface-muted hover:border-line-strong shadow-subtle',
  subtle: 'bg-surface-muted text-ink hover:bg-surface-sunken',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-muted',
  danger: 'bg-danger text-white hover:brightness-110 shadow-subtle',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-11 px-5 text-[15px]',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', iconLeft, iconRight, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
});
