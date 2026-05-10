import { getProgressionStatusPresentation, type ProgressionStatus } from '@/services/progressionEngine';

export function ProgressionStatusNote({ status }: { status: ProgressionStatus }) {
  const p = getProgressionStatusPresentation(status);
  if (!p) return null;
  return (
    <div className="mt-1.5 flex items-start gap-2 pl-0.5">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${p.dotClass}`} aria-hidden />
      <span className={`text-xs font-medium leading-snug ${p.textClass}`}>{p.text}</span>
    </div>
  );
}
