import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'accent' | 'secondary' | 'success' | 'warning';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-card text-text-secondary font-mono',
    accent: 'bg-accent/10 text-accent font-mono',
    secondary: 'bg-surface text-text-secondary font-mono',
    success: 'bg-success/10 text-success font-mono',
    warning: 'bg-warning/10 text-warning font-mono',
  };
  return (
    <span
      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
