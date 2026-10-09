import { useMemo, useState } from "react";
import {
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useNavigate,
  useRouteError,
  useSearchParams,
} from "react-router";
import MetricTooltip from "../components/MetricTooltip";
import seasonList from "../data/seasons.json";
import type { Team } from "../models/models";
import type {
  SeasonLoaderData,
} from "./loader";
import type { TeamSeasonMetrics } from "../utils/metrics";
import RouteErrorPage from "./RouteErrorPage";

type SortKey =
  | "manager"
  | "record"
  | "pointsFor"
  | "pointsAgainst"
  | "allPlay"
  | "luck"
  | "efficiency";

type SortDirection = "ascending" | "descending";

type StandingsRow = {
  rank: number;
  team: Team;
  metrics: TeamSeasonMetrics;
};

const DERIVED_METRIC_EXPLANATIONS = {
  allPlay:
    "The record this manager would have if they played every other team each completed week.",
  luck: "Actual wins minus expected wins from all-play performance. Positive values indicate a favorable schedule.",
  efficiency:
    "Points scored divided by the best valid lineup that could have been started from each week's roster.",
};

export function SeasonErrorBoundary() {
  const error = useRouteError();
  const newestSeason = Math.max(...seasonList);
  const isMissingSeason =
    isRouteErrorResponse(error) &&
    error.status === 404 &&
    typeof error.data === "string";

  if (!isMissingSeason) {
    return (
      <RouteErrorPage
        code="Error"
        eyebrow="Unable to load season"
        title="Something went wrong"
        description="We couldn't load this season right now. Return to the latest season and try again."
        linkTo={`/seasons/${newestSeason}`}
        linkLabel={`View the ${newestSeason} season`}
      />
    );
  }

  return (
    <RouteErrorPage
      code="404"
      eyebrow="Season unavailable"
      title={`No season ${error.data}`}
      description="We don't have league data for that season. Choose the latest available season to continue."
      linkTo={`/seasons/${newestSeason}`}
      linkLabel={`View the ${newestSeason} season`}
    />
  );
}

const formatRecord = ({
  wins,
  losses,
  ties,
}: TeamSeasonMetrics["record"]) =>
  `${wins}-${losses}${ties ? `-${ties}` : ""}`;

const getManagerName = (team: Team) =>
  team.owners.map(({ name }) => name).join(" & ") || team.team_name;

const getHeatClass = (rank: number, teamCount: number) => {
  if (rank <= Math.ceil(teamCount / 4)) return "season-rank-top";
  if (rank <= Math.ceil(teamCount / 2)) return "season-rank-upper";
  if (rank <= Math.ceil((teamCount * 3) / 4)) return "season-rank-lower";
  return "season-rank-bottom";
};

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  align = "right",
  tooltip,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  align?: "left" | "right";
  tooltip?: string;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === activeKey;

  return (
    <th
      scope="col"
      className={`season-sort-heading season-align-${align}`}
      aria-sort={isActive ? direction : "none"}
    >
      <span className="season-sort-control">
        <button type="button" onClick={() => onSort(sortKey)}>
          {label}
          {isActive && (
            <span aria-hidden="true">
              {direction === "descending" ? "↓" : "↑"}
            </span>
          )}
        </button>
        {tooltip && (
          <MetricTooltip label={label}>{tooltip}</MetricTooltip>
        )}
      </span>
    </th>
  );
}

function WeeklyRankCell({
  week,
  rank,
  teamCount,
  year,
}: {
  week: number;
  rank: number;
  teamCount: number;
  year: number;
}) {
  return (
    <Link
      className={`season-rank-cell ${getHeatClass(rank, teamCount)}`}
      to={`/seasons/${year}/weeks/${week}`}
      aria-label={`Open Week ${week} results: rank ${rank} of ${teamCount} in points`}
      title={`Open Week ${week} results`}
    >
      {rank}
    </Link>
  );
}

function SeasonAward({
  kicker,
  title,
  body,
  cta,
  href,
  explanation,
}: {
  kicker: string;
  title: string;
  body: string;
  cta: string;
  href?: string;
  explanation?: string;
}) {
  return (
    <article
      className={`season-award-card${href ? "" : " season-award-disabled"}`}
    >
      <span className="season-award-kicker metric-label">
        {kicker}
        {explanation && (
          <MetricTooltip label={kicker}>{explanation}</MetricTooltip>
        )}
      </span>
      <strong>{title}</strong>
      <span>{body}</span>
      {href ? (
        <Link className="season-award-cta" to={href}>
          {cta} →
        </Link>
      ) : (
        <span className="season-award-cta">{cta}</span>
      )}
    </article>
  );
}

function Season() {
  const season = useLoaderData() as SeasonLoaderData;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sort, setSort] = useState<{
    key: SortKey;
    direction: SortDirection;
  }>({ key: "record", direction: "descending" });
  const hasFinalStandings = season.standings.some(
    ({ final_standing }) => final_standing > 0,
  );
  const showFinal =
    hasFinalStandings && searchParams.get("view") === "final";
  const playoffTeamCount = Math.min(
    season.settings.team_count,
    Math.max(2, Math.floor(season.settings.team_count / 2)),
  );
  const regularRanks = useMemo(() => {
    const rows = season.teams
      .map((team) => ({
        team,
        metrics: season.metrics.teams[team.team_id],
      }))
      .filter(
        (
          row,
        ): row is {
          team: Team;
          metrics: TeamSeasonMetrics;
        } => row.metrics !== undefined,
      )
      .sort(
        (left, right) =>
          right.metrics.record.wins - left.metrics.record.wins ||
          left.metrics.record.losses - right.metrics.record.losses ||
          right.metrics.pointsFor - left.metrics.pointsFor,
      );

    return new Map(
      rows.map(({ team }, index) => [team.team_id, index + 1]),
    );
  }, [season.metrics.teams, season.teams]);
  const finalRanks = useMemo(
    () =>
      new Map(
        season.standings
          .filter(({ final_standing }) => final_standing > 0)
          .map(({ team_id, final_standing }) => [team_id, final_standing]),
      ),
    [season.standings],
  );
  const standingsRows = useMemo(() => {
    const rows: StandingsRow[] = season.teams.flatMap((team) => {
      const metrics = season.metrics.teams[team.team_id];
      const rank = showFinal
        ? finalRanks.get(team.team_id)
        : regularRanks.get(team.team_id);

      return metrics && rank ? [{ rank, team, metrics }] : [];
    });
    const multiplier = sort.direction === "descending" ? -1 : 1;

    return rows.sort((left, right) => {
      let comparison = 0;

      switch (sort.key) {
        case "manager":
          comparison = getManagerName(left.team).localeCompare(
            getManagerName(right.team),
          );
          break;
        case "record":
          if (showFinal) {
            comparison = right.rank - left.rank;
          } else {
            comparison =
              left.metrics.record.wins - right.metrics.record.wins ||
              right.metrics.record.losses - left.metrics.record.losses ||
              left.metrics.pointsFor - right.metrics.pointsFor;
          }
          break;
        case "pointsFor":
          comparison = left.metrics.pointsFor - right.metrics.pointsFor;
          break;
        case "pointsAgainst":
          comparison =
            left.metrics.pointsAgainst - right.metrics.pointsAgainst;
          break;
        case "allPlay":
          comparison =
            left.metrics.allPlayRecord.wins -
              right.metrics.allPlayRecord.wins ||
            right.metrics.allPlayRecord.losses -
              left.metrics.allPlayRecord.losses;
          break;
        case "luck":
          comparison = left.metrics.luck - right.metrics.luck;
          break;
        case "efficiency":
          comparison =
            (left.metrics.lineupEfficiency ?? -1) -
            (right.metrics.lineupEfficiency ?? -1);
          break;
      }

      return comparison * multiplier || left.rank - right.rank;
    });
  }, [
    finalRanks,
    regularRanks,
    season.metrics.teams,
    season.teams,
    showFinal,
    sort,
  ]);
  const scoringLeader = [...standingsRows].sort(
    (left, right) => right.metrics.pointsFor - left.metrics.pointsFor,
  )[0];
  const unluckiest = [...standingsRows].sort(
    (left, right) => left.metrics.luck - right.metrics.luck,
  )[0];
  const unluckiestPointsRank =
    [...standingsRows]
      .sort(
        (left, right) =>
          right.metrics.pointsFor - left.metrics.pointsFor,
      )
      .findIndex(
        ({ team }) => team.team_id === unluckiest?.team.team_id,
      ) + 1;
  const keeperCounts = new Map<number, number>();

  for (const pick of season.draft.picks.filter(({ is_keeper }) => is_keeper)) {
    keeperCounts.set(pick.team_id, (keeperCounts.get(pick.team_id) ?? 0) + 1);
  }

  const keeperLimit = Math.max(0, ...keeperCounts.values());
  const awards = season.metrics.awards;
  const closestWinner = season.teams.find(
    ({ team_id }) => team_id === awards.closestGame?.winnerTeamId,
  );
  const closestLoser = season.teams.find(
    ({ team_id }) => team_id === awards.closestGame?.loserTeamId,
  );
  const benchTeam = season.teams.find(
    ({ team_id }) => team_id === awards.benchBlunder?.teamId,
  );
  const pickupTeam = season.teams.find(
    ({ team_id }) => team_id === awards.bestPickup?.teamId,
  );
  const draftTeam = season.teams.find(
    ({ team_id }) => team_id === awards.draftSteal?.teamId,
  );

  const handleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "descending"
          ? "ascending"
          : "descending",
    }));
  };

  const setStandingsView = (final: boolean) => {
    const next = new URLSearchParams(searchParams);

    if (final) next.set("view", "final");
    else next.delete("view");

    setSearchParams(next);
    setSort({ key: "record", direction: "descending" });
  };

  return (
    <main className="season-hub">
      <header className="season-hub-header">
        <div>
          <h1>{season.year} season</h1>
          <p>
            Week {season.metrics.throughWeek} of{" "}
            {season.settings.regular_season_length} played ·{" "}
            {playoffTeamCount} of {season.settings.team_count} make the
            playoffs
            {season.settings.waiver_type === "faab" &&
              ` · $${season.settings.faab_budget ?? 100} FAAB`}
            {keeperLimit > 0 &&
              ` · ${keeperLimit} keeper${keeperLimit === 1 ? "" : "s"}`}
          </p>
        </div>
        <label className="season-picker">
          <span>Season</span>
          <select
            value={season.year}
            onChange={(event) =>
              navigate(`/seasons/${event.currentTarget.value}`)
            }
          >
            {[...seasonList]
              .sort((left, right) => right - left)
              .map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
          </select>
        </label>
      </header>

      <nav className="season-tabs" aria-label="Season sections">
        <span aria-current="page">Standings</span>
        {["Bracket", "Matchups", "Reports", "Draft", "Moves"].map(
          (tab) => (
            <button
              key={tab}
              type="button"
              disabled
              title={`${tab} coming soon`}
            >
              {tab}
            </button>
          ),
        )}
      </nav>

      {scoringLeader && unluckiest && (
        <p className="season-narrative">
          <strong>{getManagerName(scoringLeader.team)}</strong> leads the
          league with {scoringLeader.metrics.pointsFor.toFixed(1)} points
          and has the weekly high{" "}
          {scoringLeader.metrics.weeklyHighs} time
          {scoringLeader.metrics.weeklyHighs === 1 ? "" : "s"}.{" "}
          <strong>{getManagerName(unluckiest.team)}</strong> has had the
          toughest schedule so far: {unluckiestPointsRank}
          {unluckiestPointsRank === 1
            ? "st"
            : unluckiestPointsRank === 2
              ? "nd"
              : unluckiestPointsRank === 3
                ? "rd"
                : "th"}{" "}
          in points, with a {formatRecord(unluckiest.metrics.record)} record.
        </p>
      )}

      <div className="season-standings-toolbar">
        <div
          className="season-view-toggle"
          role="group"
          aria-label="Standings view"
        >
          <button
            type="button"
            aria-pressed={!showFinal}
            onClick={() => setStandingsView(false)}
          >
            Regular season
          </button>
          <button
            type="button"
            aria-pressed={showFinal}
            disabled={!hasFinalStandings}
            onClick={() => setStandingsView(true)}
          >
            Final (after playoffs)
          </button>
        </div>
        <div className="season-rank-legend">
          <span>Weekly scoring rank:</span>
          <span><i className="season-rank-top" />1 to 3</span>
          <span><i className="season-rank-upper" />4 to 6</span>
          <span><i className="season-rank-lower" />7 to 9</span>
          <span><i className="season-rank-bottom" />10 to 12</span>
        </div>
      </div>

      <div className="season-table-shell">
        <table className="season-standings-table">
          <caption>
            {season.year} {showFinal ? "final" : "regular season"} standings
            through week {season.metrics.throughWeek}
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <SortHeader
                label="Manager"
                sortKey="manager"
                activeKey={sort.key}
                direction={sort.direction}
                align="left"
                onSort={handleSort}
              />
              <SortHeader
                label="Record"
                sortKey="record"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="PF"
                sortKey="pointsFor"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="PA"
                sortKey="pointsAgainst"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="All-play"
                sortKey="allPlay"
                activeKey={sort.key}
                direction={sort.direction}
                tooltip={DERIVED_METRIC_EXPLANATIONS.allPlay}
                onSort={handleSort}
              />
              <SortHeader
                label="Luck"
                sortKey="luck"
                activeKey={sort.key}
                direction={sort.direction}
                tooltip={DERIVED_METRIC_EXPLANATIONS.luck}
                onSort={handleSort}
              />
              <SortHeader
                label="Lineup eff."
                sortKey="efficiency"
                activeKey={sort.key}
                direction={sort.direction}
                tooltip={DERIVED_METRIC_EXPLANATIONS.efficiency}
                onSort={handleSort}
              />
              <th scope="col">Weekly rank · last 5</th>
            </tr>
          </thead>
          <tbody>
            {standingsRows.map(({ rank, team, metrics }) => (
              <SeasonStandingRow
                key={team.team_id}
                rank={rank}
                team={team}
                metrics={metrics}
                year={season.year}
                teamCount={season.settings.team_count}
                playoffTeamCount={playoffTeamCount}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="season-standings-mobile">
        {[...standingsRows]
          .sort((left, right) => left.rank - right.rank)
          .map((row) => (
            <SeasonMobileStandingCard
              key={row.team.team_id}
              {...row}
              year={season.year}
              teamCount={season.settings.team_count}
              playoffTeamCount={playoffTeamCount}
            />
          ))}
      </div>
      <p className="season-table-note">
        Select a header to sort. Each form cell opens that week. Lineup
        efficiency compares actual points with the best valid lineup.
      </p>

      <section className="season-weekly-panel" aria-labelledby="weekly-ranks">
        <div className="season-section-heading">
          <h2 id="weekly-ranks">Weekly scoring rank, full season</h2>
          <span>
            Rank among {season.settings.team_count} by points that week. 1 =
            top scorer.
          </span>
        </div>
        <div className="season-weekly-table-shell">
          <table className="season-weekly-table">
            <caption>
              Weekly scoring rank for each manager, weeks 1 to{" "}
              {season.settings.regular_season_length}
            </caption>
            <thead>
              <tr>
                <th scope="col">Manager</th>
                {Array.from(
                  { length: season.settings.regular_season_length },
                  (_, index) => (
                    <th key={index} scope="col">
                      W{index + 1}
                    </th>
                  ),
                )}
                <th scope="col">Avg</th>
                <th scope="col">Spread</th>
              </tr>
            </thead>
            <tbody>
              {[...standingsRows]
                .sort((left, right) => left.rank - right.rank)
                .map(({ team, metrics }) => {
                  const ranks = metrics.weeklyRanks.map(({ rank }) => rank);
                  const average =
                    ranks.length > 0
                      ? ranks.reduce((sum, rank) => sum + rank, 0) /
                        ranks.length
                      : 0;
                  const spread =
                    ranks.length > 0
                      ? Math.max(...ranks) - Math.min(...ranks)
                      : 0;

                  return (
                    <tr key={team.team_id}>
                      <th scope="row">{getManagerName(team)}</th>
                      {Array.from(
                        { length: season.settings.regular_season_length },
                        (_, index) => {
                          const weeklyRank = metrics.weeklyRanks.find(
                            ({ week }) => week === index + 1,
                          );

                          return (
                            <td key={index}>
                              {weeklyRank ? (
                                <WeeklyRankCell
                                  week={weeklyRank.week}
                                  rank={weeklyRank.rank}
                                  teamCount={season.settings.team_count}
                                  year={season.year}
                                />
                              ) : (
                                <span
                                  className="season-rank-empty"
                                  aria-label={`Week ${index + 1} not played`}
                                />
                              )}
                            </td>
                          );
                        },
                      )}
                      <td>{ranks.length ? average.toFixed(1) : "—"}</td>
                      <td>{ranks.length ? spread : "—"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="season-table-note">
          Dashed cells have not been played. Spread is the difference
          between a manager&apos;s best and worst weekly rank.
        </p>
      </section>

      <section className="season-awards" aria-labelledby="season-awards">
        <h2 id="season-awards">Season so far</h2>
        <div>
          {awards.closestGame && closestWinner && closestLoser && (
            <SeasonAward
              kicker="Closest game"
              title={`${getManagerName(closestWinner)} ${awards.closestGame.winnerScore.toFixed(2)}, ${getManagerName(closestLoser)} ${awards.closestGame.loserScore.toFixed(2)}`}
              body={`Week ${awards.closestGame.week}, decided by ${awards.closestGame.margin.toFixed(2)} points.`}
              cta="See the box score"
              href={`/seasons/${season.year}/weeks/${awards.closestGame.week}`}
            />
          )}
          {awards.benchBlunder && benchTeam && (
            <SeasonAward
              kicker="Bench blunder"
              title={`${getManagerName(benchTeam)} benched ${awards.benchBlunder.benchedPlayer}`}
              body={`Week ${awards.benchBlunder.week}. ${awards.benchBlunder.benchedPlayer} scored ${awards.benchBlunder.benchPoints.toFixed(2)}; ${awards.benchBlunder.startedPlayer} scored ${awards.benchBlunder.starterPoints.toFixed(2)}.`}
              cta="See the box score"
              href={`/seasons/${season.year}/weeks/${awards.benchBlunder.week}`}
              explanation="The largest points gap where a benched player was eligible to replace a lower-scoring starter."
            />
          )}
          {awards.bestPickup && pickupTeam && (
            <SeasonAward
              kicker="Best pickup"
              title={`${getManagerName(pickupTeam)}: ${awards.bestPickup.playerName}, $${awards.bestPickup.bidAmount}`}
              body={`${awards.bestPickup.startedPoints.toFixed(2)} points as a starter after being added.`}
              cta="Moves tab coming soon"
              explanation="The waiver or free-agent addition with the most points scored in the acquiring team's starting lineup."
            />
          )}
          {awards.draftSteal && draftTeam && (
            <SeasonAward
              kicker="Steal of the draft"
              title={`${getManagerName(draftTeam)}: ${awards.draftSteal.playerName} at R${awards.draftSteal.round}.${awards.draftSteal.roundPick}`}
              body={`${awards.draftSteal.startedPoints.toFixed(2)} points for the drafting manager.`}
              cta="Draft tab coming soon"
              explanation="Draft value balances started points with acquisition cost, rewarding productive players selected in later rounds."
            />
          )}
        </div>
      </section>
    </main>
  );
}

function SeasonStandingRow({
  rank,
  team,
  metrics,
  year,
  teamCount,
  playoffTeamCount,
}: StandingsRow & {
  year: number;
  teamCount: number;
  playoffTeamCount: number;
}) {
  const form = metrics.weeklyRanks.slice(-5);
  const luckWidth = Math.min(50, (Math.abs(metrics.luck) / 2) * 50);

  return (
    <>
      <tr className={rank > playoffTeamCount ? "season-outside-playoffs" : ""}>
        <td>{rank}</td>
        <th scope="row">
          <strong>{getManagerName(team)}</strong>
          <span>{team.team_name}</span>
        </th>
        <td>{formatRecord(metrics.record)}</td>
        <td>{metrics.pointsFor.toFixed(2)}</td>
        <td>{metrics.pointsAgainst.toFixed(2)}</td>
        <td>{formatRecord(metrics.allPlayRecord)}</td>
        <td>
          <div className="season-luck">
            <span className="season-luck-track" aria-hidden="true">
              <i
                className={metrics.luck >= 0 ? "positive" : "negative"}
                style={{ width: `${luckWidth}%` }}
              />
            </span>
            <span>
              {metrics.luck > 0 ? "+" : ""}
              {metrics.luck.toFixed(1)}
            </span>
          </div>
        </td>
        <td>
          {metrics.lineupEfficiency === null
            ? "—"
            : `${metrics.lineupEfficiency.toFixed(1)}%`}
        </td>
        <td>
          <div className="season-form">
            {form.map(({ week, rank: weeklyRank }) => (
              <WeeklyRankCell
                key={week}
                week={week}
                rank={weeklyRank}
                teamCount={teamCount}
                year={year}
              />
            ))}
          </div>
        </td>
      </tr>
      {rank === playoffTeamCount && (
        <tr className="season-playoff-cut">
          <td colSpan={9}>
            <span>Playoff line</span>
          </td>
        </tr>
      )}
    </>
  );
}

function SeasonMobileStandingCard({
  rank,
  team,
  metrics,
  year,
  teamCount,
  playoffTeamCount,
}: StandingsRow & {
  year: number;
  teamCount: number;
  playoffTeamCount: number;
}) {
  return (
    <>
      <article className="season-mobile-standing-card">
        <div className="season-mobile-standing-header">
          <span className="season-mobile-standing-rank">{rank}</span>
          <div>
            <strong>{getManagerName(team)}</strong>
            <span>{team.team_name}</span>
          </div>
          <strong>{formatRecord(metrics.record)}</strong>
        </div>
        <dl>
          <div>
            <dt>Points</dt>
            <dd>{metrics.pointsFor.toFixed(1)}</dd>
          </div>
          <div>
            <dt>All-play</dt>
            <dd>{formatRecord(metrics.allPlayRecord)}</dd>
          </div>
          <div>
            <dt>Luck</dt>
            <dd>
              {metrics.luck > 0 ? "+" : ""}
              {metrics.luck.toFixed(1)}
            </dd>
          </div>
          <div>
            <dt>Efficiency</dt>
            <dd>
              {metrics.lineupEfficiency === null
                ? "—"
                : `${metrics.lineupEfficiency.toFixed(1)}%`}
            </dd>
          </div>
        </dl>
        <div className="season-mobile-form">
          <span>Recent weekly rank</span>
          <div>
            {metrics.weeklyRanks.slice(-5).map(({ week, rank: weeklyRank }) => (
              <WeeklyRankCell
                key={week}
                week={week}
                rank={weeklyRank}
                teamCount={teamCount}
                year={year}
              />
            ))}
          </div>
        </div>
      </article>
      {rank === playoffTeamCount && (
        <div className="season-mobile-playoff-line">
          <span>Playoff line</span>
        </div>
      )}
    </>
  );
}

export default Season;
