import type { Team } from "../../models/models";
import type { WeekMetrics } from "../../utils/metrics";
import MetricCard from "../MetricCard";
import MetricTooltip from "../MetricTooltip";

const getTeam = (teams: Team[], teamId: number) =>
  teams.find((team) => team.team_id === teamId);

function WeekMetricsPanel({
  metrics,
  teams,
}: {
  metrics: WeekMetrics;
  teams: Team[];
}) {
  const live = metrics.status === "in_progress";

  return (
    <section className="week-metrics" aria-labelledby="week-metrics-title">
      <div className="home-section-heading">
        <h2 id="week-metrics-title">
          Week metrics{live ? " · Live" : ""}
        </h2>
        <span>
          {live ? "Updates as scores change" : "Calculated from final scores"}
        </span>
      </div>

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
                        manager could have started this week.
                      </MetricTooltip>
                    </span>
                  </th>
                  <th scope="col">
                    <span className="metric-label">
                      Bench points
                      <MetricTooltip label="weekly bench points">
                        Best possible lineup points minus actual lineup
                        points.
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
                          {team?.owners[0]?.name ?? "Unknown manager"}
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
                          {opponent?.owners[0]?.name ?? "Opponent"} ·{" "}
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
                      {team?.owners[0]?.name ?? "Unknown manager"}
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
                      vs {opponent?.owners[0]?.name ?? "opponent"} ·{" "}
                      {performance.opponentScore.toFixed(2)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>All-play</dt>
                      <dd>
                        {performance.allPlayRecord.wins}-
                        {performance.allPlayRecord.losses}
                        {performance.allPlayRecord.ties
                          ? `-${performance.allPlayRecord.ties}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Efficiency</dt>
                      <dd>
                        {performance.lineupEfficiency === null
                          ? "—"
                          : `${performance.lineupEfficiency.toFixed(1)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>Bench</dt>
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
