function MetricTooltip({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <details className="metric-tooltip">
      <summary aria-label={`Explain ${label}`}>?</summary>
      <span role="tooltip">{children}</span>
    </details>
  );
}

export default MetricTooltip;
