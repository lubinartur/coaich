import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'dark'
  | 'ghost'
  | 'accent-ghost'
  | 'danger'
  | 'link';

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

export function Button({
  children,
  variant = 'primary',
  onClick,
  className = '',
  fullWidth = false,
  size = 'md',
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  const baseStyles =
    'rounded-xl font-semibold transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-white hover:opacity-90 shadow-lg shadow-accent/20',
    secondary: 'bg-surface border border-border text-text-primary hover:bg-card',
    dark: 'bg-card text-text-primary hover:bg-border',
    ghost: 'bg-transparent text-text-secondary hover:text-text-primary',
    'accent-ghost': 'bg-accent/10 text-accent hover:bg-accent/20',
    danger: 'bg-warning/10 text-warning hover:bg-warning/20',
    link: 'bg-transparent text-accent font-semibold hover:underline p-0 rounded-none active:scale-100 shadow-none',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-3 text-sm',
    lg: 'px-6 py-4 text-base',
  };
  const sizeClass = variant === 'link' ? 'text-sm py-1' : sizes[size];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${sizeClass} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
