import type { ScheduleStrengthRow } from "../../utils/scheduleMetrics";

export default function ScheduleStrengthValue({ strength }: { strength?: ScheduleStrengthRow }) {
  return strength ? <span className="season-sos-value">
    <strong>{strength.averageOpponentPoints.toFixed(2)}</strong>
    <small>Rank {strength.rank}</small>
  </span> : <span>Unavailable</span>;
}
