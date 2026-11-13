export default function TrendChart({ label, labels, series, rankCount }: {
  label: string;
  labels: string[];
  series: { name: string; values: (number | null)[]; color?: string }[];
  rankCount?: number;
}) {
  const observed = series.flatMap(({ values }) => values.filter((value): value is number => value !== null));
  if (!observed.length) return <p className="activity-note">No observed data for this chart yet.</p>;
  if (!series.some(({ values }) => values.filter((value) => value !== null).length > 1)) {
    return <div className="chart-snapshot" role="group" aria-label={`${label}: recorded snapshot`}>
      <span>{labels.find((_, index) => series.some(({ values }) => values[index] != null))}</span>
      <dl>{series.map((item) => {
        const value = item.values.find((value) => value !== null);
        return <div key={item.name}><dt>{item.name}</dt><dd>{value == null ? "Unavailable" : rankCount ? `${value} / ${rankCount}` : value.toFixed(2)}</dd></div>;
      })}</dl>
      <p className="activity-note">A trend needs multiple observations.</p>
    </div>;
  }
  const minimum = rankCount ? 1 : Math.min(0, ...observed);
  const maximum = rankCount ?? Math.max(0, ...observed);
  const range = maximum - minimum || 1;
  const x = (index: number) => labels.length === 1 ? 160 : 12 + index / (labels.length - 1) * 296;
  const y = (value: number) => rankCount ? 14 + (value - minimum) / range * 88 : 102 - (value - minimum) / range * 88;
  return <figure className="trend-chart">
    <svg viewBox="0 0 348 116" role="img" aria-label={label}>
      <title>{`${label}: ${series.map((item) => `${item.name}: ${item.values.map((value, index) => `${labels[index]} ${value === null ? "unavailable" : value.toFixed(1)}`).join(", ")}`).join("; ")}`}</title>
      <line x1="12" x2="308" y1={y(rankCount ? 1 : 0)} y2={y(rankCount ? 1 : 0)} stroke="#e2e8f0" />
      <text x="318" y={y(minimum) + 3} fill="#64748b" fontSize="10">{minimum.toFixed(minimum % 1 ? 1 : 0)}</text>
      {maximum !== minimum && <text x="318" y={y(maximum) + 3} fill="#64748b" fontSize="10">{maximum.toFixed(maximum % 1 ? 1 : 0)}</text>}
      {series.map((item, seriesIndex) => {
        const segments: string[][] = [];
        item.values.forEach((value, index) => {
          if (value === null) return;
          if (index === 0 || item.values[index - 1] === null) segments.push([]);
          segments[segments.length - 1].push(`${x(index)},${y(value)}`);
        });
        const color = item.color ?? (seriesIndex === 0 ? "#0f766e" : "#d97706");
        return <g key={item.name}>
          {segments.map((points, index) => <polyline key={index} points={points.join(" ")} fill="none" stroke={color} strokeWidth="2" />)}
          {item.values.map((value, index) => value === null ? null : <circle key={index} cx={x(index)} cy={y(value)} r="3" fill={color}>
            <title>{`${labels[index]}: ${item.name} ${value.toFixed(2)}`}</title>
          </circle>)}
        </g>;
      })}
    </svg>
    <div className="trend-axis" style={labels.length === 1 ? { justifyContent: "center" } : undefined}>
      {(labels.length <= 6 ? labels : [labels[0], labels.at(-1)]).map((text, index) => <span key={index}>{text}</span>)}
    </div>
    <figcaption>{series.map((item, index) => <span key={item.name}><i style={{ backgroundColor: item.color ?? (index === 0 ? "#0f766e" : "#d97706") }} />{item.name}</span>)}</figcaption>
  </figure>;
}
