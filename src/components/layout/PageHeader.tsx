import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  right?: ReactNode;
}

export function PageHeader({ title, right }: PageHeaderProps) {
  return (
    <header className="mb-4 flex items-center justify-between px-5 pt-8">
      <h1 className="text-2xl font-bold tracking-tight text-text-primary">{title}</h1>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </header>
  );
}
