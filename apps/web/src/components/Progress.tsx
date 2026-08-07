interface ProgressProps {
  label: string;
  done: number;
  total: number;
}

/**
 * Determinate progress bar for work that outlives a request.
 *
 * Shows the counts, not just the bar: "1,120 / 1,828" tells an operator the run
 * is moving and roughly how long is left, which a percentage alone does not.
 * A zero total renders an empty bar rather than dividing by zero — a phase that
 * has not started yet is a normal state here, not an error.
 */
export function Progress({ label, done, total }: ProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className="tabular-nums">
          {done.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-primary-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
