import { Link } from "react-router";
import MetricTooltip from "./MetricTooltip";

export default function InsightCard({ label, value, note, explanation, to }: {
  label: string;
  value: string;
  note: string;
  explanation?: string;
  to?: string;
}) {
  return <article className="insight-card">
    <span>{label}{explanation && <MetricTooltip label={label}>{explanation}</MetricTooltip>}</span>
    <strong>{to ? <Link to={to}>{value}</Link> : value}</strong>
    <p>{note}</p>
  </article>;
}
