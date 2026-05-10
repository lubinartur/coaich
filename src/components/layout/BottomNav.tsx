import { BarChart2, Clock, Home, Settings } from 'lucide-react';

export type BottomNavTab = 'today' | 'progress' | 'history' | 'settings';

export interface BottomNavProps {
  active: BottomNavTab;
  onChange: (tab: BottomNavTab) => void;
}

const tabs: { id: BottomNavTab; label: string; icon: typeof Home }[] = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'progress', label: 'Progress', icon: BarChart2 },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="pointer-events-auto absolute bottom-5 left-1/2 z-50 flex h-[60px] w-[90%] max-w-[340px] -translate-x-1/2 items-center justify-around rounded-[30px] border border-border bg-card/80 px-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
      aria-label="Main"
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            onClick={() => onChange(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center justify-center rounded-full transition-all duration-300 ${
              isActive ? 'bg-accent px-4 py-2 text-white' : 'px-3 py-2 text-text-secondary'
            }`}
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.25 : 2} aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}
