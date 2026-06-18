import { Check } from 'lucide-react';
import type { Tracking } from '../../lib/types';
import { formatDate } from '../../lib/format';

export function TrackingStepper({ tracking }: { tracking: Tracking }) {
  const steps =
    tracking.steps && tracking.steps.length
      ? tracking.steps
      : [
          { label: 'Ordered' },
          { label: 'Preparing' },
          { label: 'Shipped' },
          { label: 'Delivered' },
        ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">
          {tracking.carrier || 'Carrier'}
        </span>
        {tracking.trackingNumber && (
          <span className="text-xs text-gray-500">
            #{tracking.trackingNumber}
          </span>
        )}
      </div>
      <ol className="relative ml-2 border-l border-gray-200">
        {steps.map((step, i) => {
          const done = step.done ?? i <= tracking.stepIndex;
          const current = i === tracking.stepIndex;
          return (
            <li key={i} className="mb-4 ml-4 last:mb-0">
              <span
                className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ${
                  done ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-400'
                }`}
              >
                {done && <Check className="h-2.5 w-2.5" />}
              </span>
              <div
                className={`text-sm ${
                  current
                    ? 'font-semibold text-primary-600'
                    : done
                      ? 'text-gray-800'
                      : 'text-gray-400'
                }`}
              >
                {step.label}
              </div>
              {step.at && (
                <div className="text-[11px] text-gray-400">
                  {formatDate(step.at)}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
