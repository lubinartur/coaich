import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card } from '@/components/ui';

const BENCHMARKS = [
  { name: 'Squat', kg: '145', change: '+2.5', changeTone: 'success' as const },
  { name: 'Bench Press', kg: '110', change: '+0', changeTone: 'muted' as const },
  { name: 'Deadlift', kg: '180', change: '+5', changeTone: 'success' as const },
];

const VOLUME_ROWS = [
  { muscle: 'CHEST', sets: 14, max: 20 },
  { muscle: 'BACK', sets: 18, max: 20 },
  { muscle: 'QUADS', sets: 12, max: 20 },
  { muscle: 'BICEPS', sets: 9, max: 20 },
];

export default function ProgressScreen() {
  return (
    <div className="flex flex-col gap-6 px-5 pb-8 pt-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Progress</h1>
      </header>

      {/* Overall strength */}
      <Card className="border-border bg-card">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          OVERALL STRENGTH SCORE
        </p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-mono text-5xl font-bold tracking-tighter text-text-primary">842</span>
          <span className="flex items-center gap-0.5 text-sm font-bold text-success">
            <ArrowUp className="h-4 w-4" aria-hidden />
            +5.2%
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-surface p-2 text-center">
            <p className="text-[8px] font-bold uppercase tracking-wide text-text-secondary">PUSH</p>
            <p className="mt-1 flex items-center justify-center gap-0.5 text-xs font-bold text-success">
              245 <ArrowUp className="h-3 w-3" aria-hidden />
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-2 text-center">
            <p className="text-[8px] font-bold uppercase tracking-wide text-text-secondary">PULL</p>
            <p className="mt-1 flex items-center justify-center gap-0.5 text-xs font-bold text-success">
              280 <ArrowUp className="h-3 w-3" aria-hidden />
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-2 text-center">
            <p className="text-[8px] font-bold uppercase tracking-wide text-text-secondary">LEGS</p>
            <p className="mt-1 flex items-center justify-center gap-0.5 text-xs font-bold text-red-400">
              317 <ArrowDown className="h-3 w-3" aria-hidden />
            </p>
          </div>
        </div>
      </Card>

      {/* Benchmark lifts */}
      <section>
        <h2 className="mb-4 px-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          BENCHMARK LIFTS (EST. 1RM)
        </h2>
        <div className="flex flex-col gap-3">
          {BENCHMARKS.map((lift) => (
            <Card key={lift.name} className="relative overflow-hidden border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight text-text-primary">{lift.name}</p>
                  <p
                    className={`mt-1 text-[10px] font-bold uppercase tracking-tight ${
                      lift.changeTone === 'success' ? 'text-success' : 'text-text-secondary'
                    }`}
                  >
                    {lift.change}KG
                  </p>
                </div>
                <span className="shrink-0 font-mono text-lg font-bold text-text-primary">{lift.kg}kg</span>
              </div>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface">
                <div className="h-full w-[80%] rounded-full bg-accent" />
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Weekly volume */}
      <section className="mb-4">
        <h2 className="mb-4 px-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
          WEEKLY VOLUME
        </h2>
        <Card className="flex flex-col gap-4 border-border">
          {VOLUME_ROWS.map((row) => (
            <div key={row.muscle} className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold uppercase text-text-secondary">{row.muscle}</span>
                <span className="font-mono text-text-primary">{row.sets} SETS</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${(row.sets / row.max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
