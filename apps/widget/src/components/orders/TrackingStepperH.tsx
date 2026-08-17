import { Check, Package, Truck } from 'lucide-react';
import type { Tracking } from '../../lib/types';

/**
 * Horizontal shipment progress (PLN-260817 W-2, frame 49).
 *
 * The vertical `TrackingStepper` still serves the order-detail view; this is the
 * compact form the notification tab's Shipping filter needs, where several
 * shipments stack and each gets one line of progress rather than a column.
 *
 * Step labels come from the server already localized (`TrackingResponse.steps`),
 * so the count is data — do not assume the design's four.
 */
export function TrackingStepperH({
  tracking,
  labels,
}: {
  tracking: Tracking;
  /** Fallback labels when the payload carries none; already localized. */
  labels: string[];
}) {
  const steps = tracking.steps?.length ? tracking.steps : labels;
  if (!steps.length) return null;
  const last = steps.length - 1;

  return (
    <ol className="flex items-start">
      {steps.map((label, i) => {
        const done = i <= tracking.stepIndex;
        const finished = done && i === last;
        const Glyph = finished ? Check : i === 0 ? Package : Truck;
        return (
          <li key={i} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {/* Half-width connectors on each side keep the circle centred over
                  its label, so the rail stays continuous without a grid. */}
              <span
                className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : done ? 'bg-primary-500' : 'bg-gray-300'}`}
              />
              {/* Icon and step number sit SIDE BY SIDE inside the circle, both
                  centred (frame 49) — not a superscript. The final completed
                  step drops the number for a check mark. */}
              <span
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center gap-px rounded-full text-white ${
                  done ? 'bg-primary-500' : 'bg-gray-300'
                }`}
              >
                {done ? (
                  <>
                    <Glyph className="h-[15px] w-[15px]" strokeWidth={2.25} />
                    {!finished && <span className="text-xs font-bold leading-none">{i + 1}</span>}
                  </>
                ) : (
                  <span className="text-xs font-bold leading-none">{i + 1}</span>
                )}
              </span>
              <span
                className={`h-0.5 flex-1 ${
                  i === last ? 'bg-transparent' : i + 1 <= tracking.stepIndex ? 'bg-primary-500' : 'bg-gray-300'
                }`}
              />
            </div>
            <span
              className={`mt-1.5 w-full break-keep px-0.5 text-center text-[10px] leading-tight ${
                done ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
