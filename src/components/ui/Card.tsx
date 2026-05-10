import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export type CardProps = ComponentPropsWithoutRef<'div'> & {
  children: ReactNode;
  padded?: boolean;
};

export function Card({ children, className = '', padded = true, onClick, ...rest }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-border bg-card ${padded ? 'p-4' : ''} ${onClick ? 'cursor-pointer transition-transform active:scale-[0.99]' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
