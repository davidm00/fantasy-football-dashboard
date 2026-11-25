import { useId, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import type { SeasonLoaderData } from "../../routes/loader";
import { formatRecord, getManagerName } from "../../utils/homeViewUtils";
import { getScheduleComparison } from "../../utils/scheduleMetrics";
import MetricCard from "./MetricCard";
import SelectField from "./SelectField";
import TeamManagerLinks from "./TeamManagerLinks";

export default function ScheduleComparisonView({ season }: { season: SeasonLoaderData }) {
  const id = useId();
  const [params, setParams] = useSearchParams();
  const scoreValue = params.get("scoreTeam") ?? params.get("highlight") ?? String(season.teams[0]?.team_id ?? "");
  const scheduleValue = params.get("scheduleTeam") ??
    String(season.teams.find(team => team.team_id !== Number(scoreValue))?.team_id ?? season.teams[0]?.team_id ?? "");
  const changedOnly = params.get("scheduleChanges") === "1";
  const comparison = useMemo(() => getScheduleComparison(season, Number(scoreValue), Number(scheduleValue)),
    [season, scoreValue, scheduleValue]);
  const options = season.teams.toSorted((a, b) => getManagerName(a).localeCompare(getManagerName(b)))
    .map(team => ({ value: String(team.team_id), label: getManagerName(team) }));
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    setParams(next, { flushSync: true, preventScrollReset: true });
  };
  const visibleRows = comparison.available ? comparison.rows.filter(row =>
    !changedOnly || row.available && row.actual !== row.compared) : [];
  const hasCoverage = comparison.available && comparison.coveredWeeks > 0;
  const scoreName = comparison.available ? getManagerName(comparison.scoreTeam) : "";
  const scheduleName = comparison.available ? getManagerName(comparison.scheduleTeam) : "";

  return <section className="schedule-comparison" aria-labelledby={`${id}-heading`}>
    <header className="activity-heading"><h3 id={`${id}-heading`}>Compare schedules</h3></header>
    <p className="activity-note">Keep a manager’s actual weekly scores. Change who they faced.</p>
    <div className="activity-controls schedule-selectors">
      <SelectField label="Whose scores?" value={scoreValue} options={options} onChange={value => update({ scoreTeam: value })} />
      <SelectField label="Whose schedule?" value={scheduleValue} options={options} onChange={value => update({ scheduleTeam: value })} />
      <button type="button" onClick={() => update({ scoreTeam: scheduleValue, scheduleTeam: scoreValue })}>Swap managers</button>
    </div>
    {!comparison.available ? <p className="schedule-error" role="alert">{comparison.reason}</p> : <>
      <h4>{scoreName}’s scores. {scheduleName}’s schedule.</h4>
      <p className="activity-note">{comparison.coveredWeeks}/{comparison.rows.length} finalized regular-season weeks compared.</p>
      <div className="schedule-records">
        <MetricCard metric={{
          label: "Actual record", value: hasCoverage ? formatRecord(comparison.actualRecord) : "Unavailable",
          note: `${scoreName} · Same ${comparison.coveredWeeks} covered weeks`,
        }} />
        <MetricCard className={comparison.winDifference < 0 ? "schedule-record-worse" : ""} metric={{
          label: `With ${scheduleName}’s schedule`, value: hasCoverage ? formatRecord(comparison.comparedRecord) : "Unavailable",
          note: !hasCoverage ? "No covered matchups" : comparison.winDifference === 0 ? "Same number of wins" :
            `${Math.abs(comparison.winDifference)} ${comparison.winDifference > 0 ? "more" : "fewer"} ${Math.abs(comparison.winDifference) === 1 ? "win" : "wins"}`,
          presentation: "comparative",
        }} />
      </div>
      <p className="activity-note">{comparison.scoreTeam.team_id === comparison.scheduleTeam.team_id
        ? "Own schedule selected: this reproduces the actual record."
        : "Scores stay fixed. Head-to-head meetings stay unchanged."} Finalized regular season only; no playoff projections.</p>
      <div className="activity-controls schedule-week-heading">
        <div><h4>Week by week</h4><p className="activity-note">{comparison.changedResults} changed {comparison.changedResults === 1 ? "result" : "results"}</p></div>
        <label className="activity-checkbox"><input type="checkbox" checked={changedOnly}
          onChange={event => update({ scheduleChanges: event.target.checked ? "1" : "" })} />Only changed results</label>
      </div>
      <div className="activity-table-shell schedule-table-shell" role="region" aria-labelledby={`${id}-caption`} tabIndex={0}>
        <table className="activity-table schedule-table schedule-week-table">
          <caption id={`${id}-caption`}>{scoreName}’s weekly scores against {scheduleName}’s schedule</caption>
          <thead><tr><th scope="col">Week</th><th scope="col">{scoreName}’s score</th>
            <th scope="col">{scheduleName}’s scheduled opponent</th><th scope="col">Actual</th>
            <th scope="col">With {scheduleName}</th><th scope="col">Change</th></tr></thead>
          <tbody>{visibleRows.map(row => <tr key={row.week} className={row.available && row.actual !== row.compared ? "schedule-changed" : undefined}>
            <th scope="row"><Link to={`/seasons/${season.year}/weeks/${row.week}`}>W{row.week}</Link></th>
            {!row.available ? <td colSpan={5}>{row.reason}</td> : <>
              <td className="schedule-number">{row.score.toFixed(2)}</td>
              <td><div className="schedule-opponent"><TeamManagerLinks season={season} teamId={row.opponentId} />
                <span className="schedule-number">{row.opponentScore.toFixed(2)}</span></div>
                {row.headToHead && <small>Head-to-head unchanged</small>}</td>
              <td><span className={`schedule-outcome schedule-outcome-${row.actual}`}>{row.actual}</span></td>
              <td><span className={`schedule-outcome schedule-outcome-${row.compared}`}>{row.compared}</span></td>
              <td>{row.actual === row.compared ? "Same result" : `${row.compared === "W" ? "Won" : row.compared === "L" ? "Lost" : "Tied"} instead`}</td>
            </>}
          </tr>)}
          {!visibleRows.length && <tr><td colSpan={6}>{changedOnly ? "No changed results for this comparison." : "No finalized regular-season weeks available."}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="activity-note">W = win, L = loss, T = tie. Use Copy link in the site header to share these managers and filters.</p>
    </>}
  </section>;
}
