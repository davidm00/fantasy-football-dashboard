import type { Team } from "../../models/models";
import type { WeekMetrics } from "../../utils/metrics";
import MetricCard from "../shared/MetricCard";
import MetricTooltip from "../shared/MetricTooltip";
import { getManagerName } from "../../utils/homeViewUtils";

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
                  <th scope="col">Rank</th>
                  <th scope="col">Manager</th>
                  <th scope="col">Score</th>
                  <th scope="col">Result</th>
                  <th scope="col">
                    <span className="metric-label">
                      All-play
                      <MetricTooltip label="weekly all-play">
                        The manager&apos;s record if they played every other
                        team this week.
                      </MetricTooltip>
                    </span>
                  </th>
                  <th scope="col">
                    <span className="metric-label">
                      Lineup efficiency
                      <MetricTooltip label="weekly lineup efficiency">
                        Points scored divided by the best valid lineup the
                        manager could have started this week, using hindsight.
                      </MetricTooltip>
                    </span>
                  </th>
                  <th scope="col">
                    <span className="metric-label">
                      Points left on bench
                      <MetricTooltip label="weekly points left on bench">
                        Extra points available from a valid hindsight-optimal
                        lineup, not the total points scored by the bench.
                      </MetricTooltip>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {metrics.performances.map((performance) => {
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
            {metrics.performances.map((performance) => {
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
