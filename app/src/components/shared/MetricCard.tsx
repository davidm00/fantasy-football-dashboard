import type { MetricPresentation } from "../../utils/metrics";
import MetricTooltip from "./MetricTooltip";

export type MetricCardData = {
  label: string;
  value: string;
  note: string;
  explanation?: string;
  presentation?: MetricPresentation;
};

function MetricCard({
  metric,
  className = "",
}: {
  metric: MetricCardData;
  className?: string;
}) {
  const presentation = metric.presentation ?? "direct";

  return (
    <article
      className={`metric-card metric-card-${presentation} ${className}`.trim()}
    >
      <span className="metric-label">
        {metric.label}
        {metric.explanation && (
          <MetricTooltip label={metric.label}>
            {metric.explanation}
          </MetricTooltip>
        )}
      </span>
      <strong>{metric.value}</strong>
      <small>{metric.note}</small>
    </article>
  );
}

export default MetricCard;
