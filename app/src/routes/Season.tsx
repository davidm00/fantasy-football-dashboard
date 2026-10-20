import { useMemo, useState } from "react";
import {
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useNavigate,
  useRouteError,
  useSearchParams,
} from "react-router";
import PlayoffBracket from "../components/shared/PlayoffBracket";
import MetricTooltip from "../components/shared/MetricTooltip";
import SeasonMatchupsView from "../components/season/SeasonMatchupsView";
import SeasonReportsView from "../components/season/SeasonReportsView";
import seasonList from "../data/seasons.json";
import type { Team } from "../models/models";
import type {
  SeasonLoaderData,
} from "./loader";
import type { TeamSeasonMetrics } from "../utils/metrics";
import { getPlayoffRounds } from "../utils/playoffRounds";
import { getManagerName } from "../utils/homeViewUtils";
import RouteErrorPage from "./RouteErrorPage";

type SortKey =
  | "manager"
  | "record"
  | "power"
  | "pointsFor"
  | "pointsAgainst"
  | "allPlay"
  | "luck"
  | "efficiency";

type SortDirection = "ascending" | "descending";
type SeasonTab = "standings" | "bracket" | "matchups" | "reports";

type StandingsRow = {
  rank: number;
  team: Team;
  metrics: TeamSeasonMetrics;
};

const DERIVED_METRIC_EXPLANATIONS = {
  allPlay:
    "Your combined record against every other team in each completed regular-season week, not just your scheduled opponent.",
  luck: "Schedule luck measures how much your actual record benefited or suffered from which opponents you faced, holding everyone’s actual weekly scores fixed. Measured in wins: actual wins minus expected wins from all-play performance. +0.7 means about 0.7 more wins than your weekly scoring would predict; positive values indicate a favorable schedule.",
  efficiency:
    "Actual starter points divided by hindsight-optimal valid lineup points across completed regular-season weeks. 100% means no points left on the bench.",
  power:
    "A scoring-and-record strength score; higher is better. Power = (6 × scoring average + 2 × season high + 2 × season low + 400 × win percentage) ÷ 10. The arrow shows rank movement since the previous completed week.",
};

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "record", label: "Standings" },
  { key: "manager", label: "Manager" },
  { key: "power", label: "Power" },
  { key: "pointsFor", label: "Points scored" },
  { key: "pointsAgainst", label: "Points against" },
  { key: "allPlay", label: "All-play" },
  { key: "luck", label: "Schedule luck" },
  { key: "efficiency", label: "Lineup efficiency" },
];

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
        description="We couldn't load this season right now. Retry this page without losing your place."
        retry
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

function SeasonBracketView({
  season,
  seeds,
}: {
  season: SeasonLoaderData;
  seeds: Team[];
}) {
  const champion = season.bracket.champion
    ? season.teams.find(
        ({ team_id }) => team_id === season.bracket.champion?.team_id,
      )
    : undefined;

  return (
    <section className="home-panel home-bracket season-bracket-view">
      <div className="home-section-heading">
        <div>
          <span className="home-eyebrow">Playoffs</span>
          <h2>Championship bracket</h2>
        </div>
        <span>{champion ? "Final" : "Pairings from the latest snapshot"}</span>
      </div>
      {champion && (
        <div className="season-bracket-champion">
          <span>Champion</span>
          <strong>{champion.team_name}</strong>
          <small>{getManagerName(champion)}</small>
        </div>
      )}
      <PlayoffBracket season={season} seeds={seeds} />
    </section>
  );
}

function Season() {
  const season = useLoaderData() as SeasonLoaderData;
  const seasonComplete = season.bracket.champion !== null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: SeasonTab =
    tabParam === "bracket" ||
    tabParam === "matchups" ||
    tabParam === "reports"
      ? tabParam
      : "standings";
  const [sort, setSort] = useState<{
    key: SortKey;
    direction: SortDirection;
  }>({ key: "record", direction: "descending" });
  const hasFinalStandings = season.standings.some(
    ({ final_standing }) => final_standing > 0,
  );
  const showFinal =
    hasFinalStandings && searchParams.get("view") === "final";
  const showCards = searchParams.get("layout") === "cards";
  const openingPlayoffWeek = getPlayoffRounds(season.settings, season.bracket)[0]?.week;
  const openingPlayoffTeams = new Set(
    season.bracket.rounds
      .find(({ week }) => week === openingPlayoffWeek)?.games
      .filter(({ tier }) => tier === "WINNERS_BRACKET")
      .flatMap(({ home_team_id, away_team_id }) =>
        [home_team_id, away_team_id].filter((id): id is number => id !== null),
      ),
  );
  const playoffTeamCount = openingPlayoffTeams.size || Math.min(
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
  const bracketSeeds = useMemo(
    () =>
      [...season.teams]
        .sort(
          (left, right) =>
            (regularRanks.get(left.team_id) ?? Number.POSITIVE_INFINITY) -
            (regularRanks.get(right.team_id) ?? Number.POSITIVE_INFINITY),
        )
        .slice(0, playoffTeamCount),
    [playoffTeamCount, regularRanks, season.teams],
  );
  const requestedHighlightId = Number(searchParams.get("highlight"));
  const highlightedTeamId = season.teams.some(
    ({ team_id }) => team_id === requestedHighlightId,
  )
    ? requestedHighlightId
    : null;
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
        case "power":
          comparison =
            (left.metrics.power.score ?? -1) -
            (right.metrics.power.score ?? -1);
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
  const benchBlunderGame = season.box_scores.find(
    (game) =>
      game.week === awards.benchBlunder?.week &&
      (game.home_team_id === awards.benchBlunder.teamId ||
        game.away_team_id === awards.benchBlunder.teamId),
  );
  const closestGameBoxScore = season.box_scores.find(
    (game) =>
      game.week === awards.closestGame?.week &&
      ((game.home_team_id === awards.closestGame.winnerTeamId &&
        game.away_team_id === awards.closestGame.loserTeamId) ||
       (game.away_team_id === awards.closestGame.winnerTeamId &&
        game.home_team_id === awards.closestGame.loserTeamId)),
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

  const setStandingsLayout = (cards: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (cards) next.set("layout", "cards");
    else next.delete("layout");
    setSearchParams(next);
  };

  const setSeasonTab = (tab: SeasonTab) => {
    const next = new URLSearchParams(searchParams);

    if (tab !== "standings") next.set("tab", tab);
    else next.delete("tab");
    if (tab !== "matchups") next.delete("highlight");

    setSearchParams(next);
  };

  const setHighlightedTeam = (teamId: number | null) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "matchups");
    if (teamId === null) next.delete("highlight");
    else next.set("highlight", String(teamId));
    setSearchParams(next);
  };

  return (
    <main className="season-hub">
      <header className="season-hub-header">
        <div>
          <h1>{season.year} season</h1>
          <p>
            {seasonComplete ? "Completed season" : `Regular-season Week ${season.metrics.throughWeek} of ${season.settings.regular_season_length} finalized`} ·{" "}
            {playoffTeamCount} of {season.settings.team_count} {seasonComplete ? "made" : "make"} the
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
              navigate(
                `/seasons/${event.currentTarget.value}${
                  activeTab === "standings" ? "" : `?tab=${activeTab}`
                }`,
              )
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
        <button
          type="button"
          aria-current={activeTab === "standings" ? "page" : undefined}
          onClick={() => setSeasonTab("standings")}
        >
          Standings
        </button>
        <button
          type="button"
          aria-current={activeTab === "bracket" ? "page" : undefined}
          onClick={() => setSeasonTab("bracket")}
        >
          Bracket
        </button>
        <button
          type="button"
          aria-current={activeTab === "matchups" ? "page" : undefined}
          onClick={() => setSeasonTab("matchups")}
        >
          Matchups
        </button>
        <button
          type="button"
          aria-current={activeTab === "reports" ? "page" : undefined}
          onClick={() => setSeasonTab("reports")}
        >
          Reports
        </button>
        {["Draft", "Moves"].map(
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

      {activeTab === "bracket" && (
        <SeasonBracketView season={season} seeds={bracketSeeds} />
      )}

      {activeTab === "matchups" && bracketSeeds[0] && (
        <SeasonMatchupsView
          key={season.year}
          year={season.year}
          teams={season.teams}
          weeks={season.matchupWeeks}
          reports={season.reports}
          regularSeasonLength={season.settings.regular_season_length}
          defaultTeamId={bracketSeeds[0].team_id}
          highlightedTeamId={highlightedTeamId}
          onHighlight={setHighlightedTeam}
        />
      )}

      {activeTab === "reports" && (
        <SeasonReportsView year={season.year} reports={season.reports} />
      )}

      {activeTab === "standings" && (
        <>
      {scoringLeader && unluckiest && season.metrics.throughWeek > 0 && (
        <p className="season-narrative">
          <strong>{getManagerName(scoringLeader.team)}</strong> {seasonComplete ? "led" : "leads"} the
          league with {scoringLeader.metrics.pointsFor.toFixed(1)} points
          and {seasonComplete ? "had" : "has had"} the weekly high{" "}
          {scoringLeader.metrics.weeklyHighs} time
          {scoringLeader.metrics.weeklyHighs === 1 ? "" : "s"}.{" "}
          <strong>{getManagerName(unluckiest.team)}</strong> {seasonComplete ? "finished with" : "currently has"} the
          lowest schedule luck: {unluckiestPointsRank}
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
        <div
          className="season-view-toggle"
          role="group"
          aria-label="Standings layout"
        >
          <button
            type="button"
            aria-pressed={!showCards}
            onClick={() => setStandingsLayout(false)}
          >
            Table
          </button>
          <button
            type="button"
            aria-pressed={showCards}
            onClick={() => setStandingsLayout(true)}
          >
            Cards
          </button>
        </div>
        <div className="season-sort-picker">
          <label>
            <span>Sort by</span>
            <select
              value={sort.key}
              onChange={(event) => {
                const option = SORT_OPTIONS.find(({ key }) => key === event.currentTarget.value);
                if (option) {
                  setSort({ key: option.key, direction: option.key === "manager" ? "ascending" : "descending" });
                }
              }}
            >
              {SORT_OPTIONS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label={`Sort ${sort.direction === "descending" ? "ascending" : "descending"}`}
            onClick={() => setSort((current) => ({
              ...current,
              direction: current.direction === "descending" ? "ascending" : "descending",
            }))}
          >
            {sort.direction === "descending" ? "Descending ↓" : "Ascending ↑"}
          </button>
        </div>
        <div className="season-rank-legend">
          <span>Weekly scoring rank:</span>
          <span><i className="season-rank-top" />1 to {Math.ceil(season.settings.team_count / 4)}</span>
          <span><i className="season-rank-upper" />{Math.ceil(season.settings.team_count / 4) + 1} to {Math.ceil(season.settings.team_count / 2)}</span>
          <span><i className="season-rank-lower" />{Math.ceil(season.settings.team_count / 2) + 1} to {Math.ceil(season.settings.team_count * 3 / 4)}</span>
          <span><i className="season-rank-bottom" />{Math.ceil(season.settings.team_count * 3 / 4) + 1} to {season.settings.team_count}</span>
        </div>
      </div>

      {!showCards && (
        <>
      <p className="season-mobile-table-hint">
        Full standings table · Swipe horizontally to compare every metric.
      </p>
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
                label="Power"
                sortKey="power"
                activeKey={sort.key}
                direction={sort.direction}
                tooltip={DERIVED_METRIC_EXPLANATIONS.power}
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
                label="Schedule luck"
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
                showPlayoffLine={!showFinal && sort.key === "record" && sort.direction === "descending"}
              />
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}
      {showCards && (
      <div className="season-standings-mobile">
        {standingsRows.map((row) => (
            <SeasonMobileStandingCard
              key={row.team.team_id}
              {...row}
              year={season.year}
              teamCount={season.settings.team_count}
              playoffTeamCount={playoffTeamCount}
              showPlayoffLine={!showFinal && sort.key === "record" && sort.direction === "descending"}
            />
          ))}
      </div>
      )}
      <p className="season-table-note">
        Use the sort controls{!showCards && " or a table header"} to sort.
        Switch between Table and Cards to change the layout. Rank numbers remain
        standings positions. Each form cell opens that week. Metrics describe
        completed regular-season games, even in the final-placement view.
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
        <h2 id="season-awards">{seasonComplete ? "Season highlights" : "Season so far"}</h2>
        <div>
          {awards.closestGame && closestWinner && closestLoser && (
            <SeasonAward
              kicker="Closest game"
              title={`${getManagerName(closestWinner)} ${awards.closestGame.winnerScore.toFixed(2)}, ${getManagerName(closestLoser)} ${awards.closestGame.loserScore.toFixed(2)}`}
              body={`Week ${awards.closestGame.week}, decided by ${awards.closestGame.margin.toFixed(2)} points.`}
              cta={closestGameBoxScore ? "See the box score" : "View week"}
              href={closestGameBoxScore
                ? `/seasons/${season.year}/weeks/${closestGameBoxScore.week}/matchups/${closestGameBoxScore.home_team_id}/${closestGameBoxScore.away_team_id}`
                : `/seasons/${season.year}/weeks/${awards.closestGame.week}`}
            />
          )}
          {awards.benchBlunder && benchTeam && (
            <SeasonAward
              kicker="Bench blunder"
              title={`${getManagerName(benchTeam)} benched ${awards.benchBlunder.benchedPlayer}`}
              body={`Week ${awards.benchBlunder.week}. ${awards.benchBlunder.benchedPlayer} scored ${awards.benchBlunder.benchPoints.toFixed(2)}; ${awards.benchBlunder.startedPlayer} scored ${awards.benchBlunder.starterPoints.toFixed(2)}.`}
              cta={benchBlunderGame ? "See the box score" : "View week"}
              href={benchBlunderGame
                ? `/seasons/${season.year}/weeks/${benchBlunderGame.week}/matchups/${benchBlunderGame.home_team_id}/${benchBlunderGame.away_team_id}`
                : `/seasons/${season.year}/weeks/${awards.benchBlunder.week}`}
              explanation="The largest eligible starter-to-bench points gap, identified in hindsight, not a judgment of the pregame decision."
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
              body={`${awards.draftSteal.position}${awards.draftSteal.positionRank} of ${awards.draftSteal.positionCount} with ${awards.draftSteal.totalPoints.toFixed(2)} points; ${awards.draftSteal.startedPoints.toFixed(2)} as a starter accounted for ${(awards.draftSteal.teamPointShare * 100).toFixed(1)}% of team scoring.`}
              cta="Draft tab coming soon"
              explanation="Among drafted QB, RB, WR, and TE players, draft value weighs scoring rank within position (45%), share of the drafting team's scoring compared with other drafted players at that position (25%), draft capital (20%), and how much of the player's production the manager used in the starting lineup (10%). Keepers, kickers, and defenses are excluded because their listed draft cost and streaming value are not meaningfully comparable."
            />
          )}
        </div>
      </section>
        </>
      )}
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
  showPlayoffLine,
}: StandingsRow & {
  year: number;
  teamCount: number;
  playoffTeamCount: number;
  showPlayoffLine: boolean;
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
        <td>
          <div className="season-power-cell">
            <strong>
              {metrics.power.rank === null ? "—" : `#${metrics.power.rank}`}
            </strong>
            <span>
              {metrics.power.score?.toFixed(1) ?? "—"}
              {metrics.power.rankChange !== null && (
                <i
                  className={
                    metrics.power.rankChange > 0
                      ? "positive"
                      : metrics.power.rankChange < 0
                        ? "negative"
                        : undefined
                  }
                  aria-label={
                    metrics.power.rankChange > 0
                      ? `up ${metrics.power.rankChange}`
                      : metrics.power.rankChange < 0
                        ? `down ${Math.abs(metrics.power.rankChange)}`
                        : "no change"
                  }
                >
                  {metrics.power.rankChange > 0
                    ? `▲${metrics.power.rankChange}`
                    : metrics.power.rankChange < 0
                      ? `▼${Math.abs(metrics.power.rankChange)}`
                      : "–"}
                </i>
              )}
            </span>
          </div>
        </td>
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
      {showPlayoffLine && rank === playoffTeamCount && (
        <tr className="season-playoff-cut">
          <td colSpan={10}>
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
  showPlayoffLine,
}: StandingsRow & {
  year: number;
  teamCount: number;
  playoffTeamCount: number;
  showPlayoffLine: boolean;
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
          <div className="season-mobile-standing-results">
            <strong>{formatRecord(metrics.record)}</strong>
            <span className="metric-label">
              Power #{metrics.power.rank ?? "—"} ·{" "}
              {metrics.power.score?.toFixed(1) ?? "—"}
              <MetricTooltip label="Power">{DERIVED_METRIC_EXPLANATIONS.power}</MetricTooltip>
            </span>
          </div>
        </div>
        <dl>
          <div>
            <dt>Points</dt>
            <dd>{metrics.pointsFor.toFixed(1)}</dd>
          </div>
          <div>
            <dt className="metric-label">
              All-play
              <MetricTooltip label="All-play">{DERIVED_METRIC_EXPLANATIONS.allPlay}</MetricTooltip>
            </dt>
            <dd>{formatRecord(metrics.allPlayRecord)}</dd>
          </div>
          <div>
            <dt className="metric-label">
              Schedule luck
              <MetricTooltip label="Schedule luck">{DERIVED_METRIC_EXPLANATIONS.luck}</MetricTooltip>
            </dt>
            <dd>
              {metrics.luck > 0 ? "+" : ""}
              {metrics.luck.toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="metric-label">
              Efficiency
              <MetricTooltip label="Lineup efficiency">{DERIVED_METRIC_EXPLANATIONS.efficiency}</MetricTooltip>
            </dt>
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
      {showPlayoffLine && rank === playoffTeamCount && (
        <div className="season-mobile-playoff-line">
          <span>Playoff line</span>
        </div>
      )}
    </>
  );
}

export default Season;
