import { BarChart2, Clock, Dumbbell, Settings, type LucideIcon } from 'lucide-react';

export type BottomNavTab = 'today' | 'progress' | 'history' | 'settings';

export interface BottomNavProps {
  active: BottomNavTab;
  onChange: (tab: BottomNavTab) => void;
}

const tabs: { id: BottomNavTab; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Today', icon: Dumbbell },
  { id: 'progress', label: 'Progress', icon: BarChart2 },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="pointer-events-auto fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.35),0_0_48px_-10px_rgba(139,92,246,0.18)] backdrop-blur-xl"
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
              isActive ? 'bg-[#8B5CF6] p-2.5 text-white' : 'p-2.5 text-[#6B7280]'
            }`}
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.25 : 2} aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}
