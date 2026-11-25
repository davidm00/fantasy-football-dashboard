import type { ReactNode } from "react";
import { useId } from "react";
import { useSearchParams } from "react-router";
import type { SeasonLoaderData } from "../../routes/loader";
import ScheduleComparisonView from "../shared/ScheduleComparisonView";

export default function SeasonMatchupsSection({ season, children }: { season: SeasonLoaderData; children: ReactNode }) {
  const id = useId();
  const [params, setParams] = useSearchParams();
  const schedule = params.get("matchupView") === "schedule";
  const setView = (showSchedule: boolean) => {
    const next = new URLSearchParams(params);
    if (showSchedule) next.set("matchupView", "schedule");
    else next.delete("matchupView");
    setParams(next, { flushSync: true, preventScrollReset: true });
  };
  return <section className="activity-view schedule-matchups-section" aria-labelledby={`${id}-heading`}>
    <header className="activity-heading"><h2 id={`${id}-heading`}>Matchups</h2></header>
    <div className="season-view-toggle" role="group" aria-label="Matchup view">
      <button type="button" aria-pressed={!schedule} onClick={() => setView(false)}>Actual matchups</button>
      <button type="button" aria-pressed={schedule} onClick={() => setView(true)}>Schedule comparison</button>
    </div>
    {schedule ? <ScheduleComparisonView season={season} /> : children}
  </section>;
}
