import { useSearchParams } from "react-router";
import MetricTooltip from "./MetricTooltip";

export default function CurrentManagersFilter() {
  const [params, setParams] = useSearchParams();
  return <div className="current-managers-filter"><label className="activity-checkbox">
    <input type="checkbox" checked={params.get("managers") !== "all"} onChange={(event) => {
      const next = new URLSearchParams(params);
      if (event.target.checked) next.delete("managers"); else next.set("managers", "all");
      setParams(next, { flushSync: true, preventScrollReset: true });
    }} />
    Current managers only
    </label>
    <MetricTooltip label="Current managers">Managers who own a team in the latest exported season. This filters whose historical records are shown, not which years count. Uncheck to include former managers.</MetricTooltip>
  </div>;
}
