import type { Team } from "../../models/models";
import type { WeekMetrics } from "../../utils/metrics";
import MetricCard from "../shared/MetricCard";
import MetricTooltip from "../shared/MetricTooltip";
import { getManagerName } from "../../utils/homeViewUtils";
import SortHeader from "../shared/SortHeader";
import { useTableSort } from "../../hooks/useTableSort";

const getTeam = (teams: Team[], teamId: number) =>
  teams.find((team) => team.team_id === teamId);

function WeekMetricsPanel({
  metrics,
  teams,
}: {
  metrics: WeekMetrics;
  teams: Team[];
}) {
  const provisional = metrics.status === "in_progress";
  const sorter = useTableSort(metrics.performances, {
    rank: { value: (row) => row.rank },
    manager: { value: (row) => getManagerName(getTeam(teams, row.teamId)) },
    score: { value: (row) => row.score, direction: "descending" },
    result: { value: (row) => row.result },
    allPlay: { value: (row) => row.allPlayRecord.wins + row.allPlayRecord.ties / 2, direction: "descending" },
    efficiency: { value: (row) => row.lineupEfficiency, direction: "descending" },
    bench: { value: (row) => row.pointsLeftOnBench, direction: "descending" },
  }, { key: "rank", direction: "ascending" }, "weekMetrics");

  return (
    <section className="week-metrics" aria-labelledby="week-metrics-title">
      <div className="home-section-heading">
        <h2 id="week-metrics-title">
          Week metrics{provisional ? " · Provisional" : ""}
        </h2>
        <span>
          {provisional
            ? "Snapshot scores; outcomes are not final"
            : metrics.status === "final"
              ? "Calculated from final scores"
              : "Awaiting scoring data"}
        </span>
        <button type="button" className="table-reset" onClick={sorter.reset} disabled={sorter.isDefault}>Reset sort</button>
      </div>

      {provisional && (
        <p>
          Lineup efficiency and points left on bench are available after the
          week is final, so players awaiting kickoff are not treated as missed
          opportunities.
        </p>
      )}

      {metrics.performances.length === 0 ? (
        <p className="week-empty">
          Weekly metrics will appear when scoring data is available.
        </p>
      ) : (
        <>
          <div className="week-metric-cards">
            {metrics.cards.map((card) => (
              <MetricCard key={card.label} metric={card} />
            ))}
          </div>

          <div className="week-metrics-table-shell">
            <table className="week-metrics-table">
              <caption>Manager performance metrics for this week</caption>
              <thead>
                <tr>
                  {[
                    { key: "rank", label: "Rank" }, { key: "manager", label: "Manager" }, { key: "score", label: "Score" },
                    { key: "result", label: "Result" }, { key: "allPlay", label: "All-play", tooltip: "The manager's record if they played every other team this week." },
                    { key: "efficiency", label: "Lineup efficiency", tooltip: "Points scored divided by the best valid lineup the manager could have started this week, using hindsight." },
                    { key: "bench", label: "Points left on bench", tooltip: "Extra points available from a valid hindsight-optimal lineup, not the total points scored by the bench." },
                  ].map(({ key, label, tooltip }) => <SortHeader key={key} sortKey={key} label={label} activeKey={sorter.key}
                    direction={sorter.direction} onSort={sorter.onSort} tooltip={tooltip} align="left" />)}
                </tr>
              </thead>
              <tbody>
                {sorter.rows.map((performance) => {
                  const team = getTeam(teams, performance.teamId);
                  const opponent = getTeam(
                    teams,
                    performance.opponentTeamId,
                  );

                  return (
                    <tr key={performance.teamId}>
                      <td>{performance.rank}</td>
                      <th scope="row">
                        <strong>
                          {getManagerName(team)}
                        </strong>
                        <span>{team?.team_name ?? "Unknown team"}</span>
                      </th>
                      <td>{performance.score.toFixed(2)}</td>
                      <td>
                        <strong
                          className={`week-result week-result-${performance.result.toLowerCase()}`}
                        >
                          {performance.result}
                        </strong>
                        <span>
                          {getManagerName(opponent)} ·{" "}
                          {performance.opponentScore.toFixed(2)}
                        </span>
                      </td>
                      <td>
                        {performance.allPlayRecord.wins}-
                        {performance.allPlayRecord.losses}
                        {performance.allPlayRecord.ties
                          ? `-${performance.allPlayRecord.ties}`
                          : ""}
                      </td>
                      <td>
                        {performance.lineupEfficiency === null
                          ? "—"
                          : `${performance.lineupEfficiency.toFixed(1)}%`}
                      </td>
                      <td>
                        {performance.pointsLeftOnBench === null
                          ? "—"
                          : performance.pointsLeftOnBench.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="week-metrics-mobile-list">
            {sorter.rows.map((performance) => {
              const team = getTeam(teams, performance.teamId);
              const opponent = getTeam(
                teams,
                performance.opponentTeamId,
              );

              return (
                <article key={performance.teamId}>
                  <div className="week-mobile-rank">
                    <span>{performance.rank}</span>
                  </div>
                  <div className="week-mobile-manager">
                    <strong>
                      {getManagerName(team)}
                    </strong>
                    <span>{team?.team_name ?? "Unknown team"}</span>
                  </div>
                  <strong className="week-mobile-score">
                    {performance.score.toFixed(2)}
                  </strong>
                  <div className="week-mobile-result">
                    <strong
                      className={`week-result week-result-${performance.result.toLowerCase()}`}
                    >
                      {performance.result}
                    </strong>
                    <span>
                      vs {getManagerName(opponent)} ·{" "}
                      {performance.opponentScore.toFixed(2)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt className="metric-label">
                        All-play
                        <MetricTooltip label="weekly all-play">
                          Your record against every other team this week;
                          provisional until the games are final.
                        </MetricTooltip>
                      </dt>
                      <dd>
                        {performance.allPlayRecord.wins}-
                        {performance.allPlayRecord.losses}
                        {performance.allPlayRecord.ties
                          ? `-${performance.allPlayRecord.ties}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="metric-label">
                        Efficiency
                        <MetricTooltip label="weekly lineup efficiency">
                          Actual starter points divided by hindsight-optimal
                          valid lineup points, expressed as a percentage.
                        </MetricTooltip>
                      </dt>
                      <dd>
                        {performance.lineupEfficiency === null
                          ? "—"
                          : `${performance.lineupEfficiency.toFixed(1)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt className="metric-label">
                        Points left
                        <MetricTooltip label="weekly points left on bench">
                          Extra points available from a valid hindsight-optimal
                          lineup, not the total bench score.
                        </MetricTooltip>
                      </dt>
                      <dd>
                        {performance.pointsLeftOnBench === null
                          ? "—"
                          : performance.pointsLeftOnBench.toFixed(1)}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default WeekMetricsPanel;
