import { useTranslation } from 'react-i18next';

/**
 * Question volume over the selected range. Inline SVG rather than a charting
 * dependency: one series, no interaction beyond the tooltip, and the artifact
 * CSP-style constraints of this console make a 100KB library a poor trade.
 */
export function TrendChart({ data }: { data: Array<{ date: string; asked: number }> }) {
  const { t } = useTranslation('statistics');
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">{t('noTrend')}</p>;
  }

  const width = 720;
  const height = 160;
  const padding = { top: 12, right: 12, bottom: 22, left: 34 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const max = Math.max(...data.map((d) => d.asked), 1);
  // A single data point has no span to divide by; centre it instead of /0.
  const x = (i: number) => (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => plotH - (v / max) * plotH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.asked).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${plotH} L ${x(0).toFixed(1)} ${plotH} Z`;

  // At most six date labels, whatever the range length.
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full min-w-[480px]" role="img"
        aria-label={t('trendAria', { count: data.length })}>
        <g transform={`translate(${padding.left},${padding.top})`}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={0} x2={plotW} y1={plotH * f} y2={plotH * f} stroke="#E5E7EB" strokeWidth={1} />
              <text x={-8} y={plotH * f + 4} textAnchor="end" className="fill-gray-400 text-[10px] tabular-nums">
                {Math.round(max * (1 - f))}
              </text>
            </g>
          ))}
          <path d={area} fill="#6366F1" fillOpacity={0.12} />
          <path d={line} fill="none" stroke="#6366F1" strokeWidth={2} strokeLinejoin="round" />
          {data.map((d, i) => (
            <circle key={d.date} cx={x(i)} cy={y(d.asked)} r={2.5} fill="#4F46E5">
              <title>{`${d.date}: ${d.asked}`}</title>
            </circle>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text
                key={`l-${d.date}`}
                x={x(i)}
                y={plotH + 15}
                textAnchor="middle"
                className="fill-gray-400 text-[10px] tabular-nums"
              >
                {d.date.slice(5)}
              </text>
            ) : null,
          )}
        </g>
      </svg>
    </div>
  );
}
