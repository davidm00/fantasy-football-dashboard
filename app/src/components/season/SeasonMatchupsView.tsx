import { useState } from "react";
import { Link } from "react-router";
import type { Report } from "../../data/reportsList";
import type { MatchupResult, Team, WeekStatus } from "../../models/models";
import type { SeasonMatchupWeek } from "../../utils/metrics";
import {
  EMPTY_RECORD,
  formatRecord,
  type TeamRecord,
} from "../../utils/homeViewUtils";

function getManagerName(team: Team | undefined) {
  return team?.owners.map(({ name }) => name).join(" & ") ||
    team?.team_name ||
    "Unknown manager";
}

function getWeekSummary(week: SeasonMatchupWeek, teams: Team[]) {
  const scores = week.matchups.flatMap((matchup) => [
    { teamId: matchup.home_team_id, score: matchup.home_score },
    { teamId: matchup.away_team_id, score: matchup.away_score },
  ]).filter(
    (entry): entry is { teamId: number; score: number } =>
      typeof entry.teamId === "number" &&
      entry.score !== null &&
      (week.status === "final" || entry.score > 0),
  );
  const high = [...scores].sort((left, right) => right.score - left.score)[0];
  const low = [...scores].sort((left, right) => left.score - right.score)[0];
  const closest = week.matchups.flatMap((matchup) => {
    if (matchup.home_score === null || matchup.away_score === null) return [];
    if (
      week.status !== "final" &&
      (matchup.home_score <= 0 || matchup.away_score <= 0)
    ) {
      return [];
    }

    const homeWon = matchup.home_score >= matchup.away_score;
    return [{
      winnerId: homeWon ? matchup.home_team_id : matchup.away_team_id,
      margin: Math.abs(matchup.home_score - matchup.away_score),
    }];
  }).sort((left, right) => left.margin - right.margin)[0];
  const findTeam = (teamId: number) =>
    teams.find(({ team_id: id }) => id === teamId);

  return {
    high: high
      ? `${getManagerName(findTeam(high.teamId))} ${high.score.toFixed(2)}`
      : null,
    low: low
      ? `${getManagerName(findTeam(low.teamId))} ${low.score.toFixed(2)}`
      : null,
    closest: closest
      ? `${getManagerName(findTeam(closest.winnerId))} by ${closest.margin.toFixed(2)}`
      : null,
  };
}

function CompactMatchupCard({
  year,
  week,
  matchup,
  records,
  status,
  teams,
  highlightedTeamId,
}: {
  year: number;
  week: number;
  matchup: MatchupResult;
  records: Record<number, TeamRecord>;
  status: WeekStatus;
  teams: Team[];
  highlightedTeamId: number | null;
}) {
  const home = teams.find(({ team_id }) => team_id === matchup.home_team_id);
  const away = teams.find(({ team_id }) => team_id === matchup.away_team_id);
  const highlighted =
    highlightedTeamId === matchup.home_team_id ||
    highlightedTeamId === matchup.away_team_id;
  const homeWon =
    status === "final" &&
    matchup.home_score !== null &&
    matchup.away_score !== null &&
    matchup.home_score > matchup.away_score;
  const awayWon =
    status === "final" &&
    matchup.home_score !== null &&
    matchup.away_score !== null &&
    matchup.away_score > matchup.home_score;
  const hasDetail =
    Boolean(home && away) &&
    matchup.home_score !== null &&
    matchup.away_score !== null;
  const content = (
    <>
      <CompactTeamLine
        team={home}
        score={matchup.home_score}
        record={records[matchup.home_team_id] ?? EMPTY_RECORD}
        winner={homeWon}
      />
      {away && (
        <CompactTeamLine
          team={away}
          score={matchup.away_score}
          record={records[matchup.away_team_id] ?? EMPTY_RECORD}
          winner={awayWon}
        />
      )}
    </>
  );

  return (
    <article
      className={`season-matchup-card${highlighted ? " season-matchup-card-highlighted" : ""}`}
    >
      {hasDetail ? (
        <Link
          className="season-matchup-card-link"
          to={`/seasons/${year}/weeks/${week}/matchups/${matchup.home_team_id}/${matchup.away_team_id}`}
          aria-label={`View ${getManagerName(home)} versus ${getManagerName(away)}`}
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </article>
  );
}

function CompactTeamLine({
  team,
  score,
  record,
  winner,
}: {
  team: Team | undefined;
  score: number | null;
  record: TeamRecord;
  winner: boolean;
}) {
  return (
    <div className={winner ? "winner" : undefined}>
      <span>
        <strong>{getManagerName(team)}</strong>
        <small>{formatRecord(record)}</small>
      </span>
      <strong>{score === null ? "—" : score.toFixed(2)}</strong>
    </div>
  );
}

function SeasonMatchupsView({
  year,
  teams,
  weeks,
  reports,
  regularSeasonLength,
  defaultTeamId,
  highlightedTeamId,
  onHighlight,
}: {
  year: number;
  teams: Team[];
  weeks: SeasonMatchupWeek[];
  reports: Report[];
  regularSeasonLength: number;
  defaultTeamId: number;
  highlightedTeamId: number | null;
  onHighlight: (teamId: number | null) => void;
}) {
  const visibleWeeks = [...weeks]
    .filter(({ status }) => status !== "not_started")
    .sort((left, right) => right.week - left.week);
  const futureWeeks = weeks.filter(
    ({ status, week }) =>
      status === "not_started" && week <= regularSeasonLength,
  );
  const hasFuturePlayoffs = weeks.some(
    ({ status, week }) =>
      status === "not_started" && week > regularSeasonLength,
  );
  const sortedWeeks = weeks
    .filter(({ week }) => week <= regularSeasonLength)
    .sort((left, right) => left.week - right.week);
  const latestVisibleWeek = visibleWeeks[0]?.week ?? 1;
  const [selectedTeamId, setSelectedTeamId] = useState(
    highlightedTeamId ?? defaultTeamId,
  );
  const [activeWeek, setActiveWeek] = useState(latestVisibleWeek);
  const selectedManagerId = highlightedTeamId ?? selectedTeamId;

  const jumpToWeek = (week: number) => {
    setActiveWeek(week);
    const target = document.getElementById(`season-matchups-week-${week}`);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#season-matchups-week-${week}`,
    );
  };

  return (
    <section className="season-matchups-view">
      <p className="season-matchups-intro">
        Every game of the season, newest first. Records on each card are
        <strong> as of that week</strong>, so you can revisit the race at any
        point.
      </p>

      <div className="season-matchups-controls">
        <div className="season-week-jump">
          <span>Jump to week</span>
          <nav aria-label="Jump to week">
            {sortedWeeks.map((week) =>
              week.status === "not_started" ? (
                <span key={week.week} aria-disabled="true">
                  W{week.week}
                </span>
              ) : (
                <button
                  key={week.week}
                  type="button"
                  className={activeWeek === week.week ? "active" : undefined}
                  aria-pressed={activeWeek === week.week}
                  onClick={() => jumpToWeek(week.week)}
                >
                  W{week.week}
                </button>
              ),
            )}
          </nav>
        </div>
        <div className="season-highlight-control">
          <label>
            <span>Manager</span>
            <select
              value={selectedManagerId}
              onChange={(event) => {
                const teamId = Number(event.currentTarget.value);
                setSelectedTeamId(teamId);
                onHighlight(teamId);
              }}
            >
              {[...teams]
                .sort((left, right) =>
                  getManagerName(left).localeCompare(getManagerName(right)),
                )
                .map((team) => (
                  <option key={team.team_id} value={team.team_id}>
                    {getManagerName(team)}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="season-highlight-toggle"
            aria-pressed={highlightedTeamId !== null}
            onClick={() =>
              onHighlight(
                highlightedTeamId === null ? selectedManagerId : null,
              )
            }
          >
            Highlight {highlightedTeamId === null ? "off" : "on"}
          </button>
        </div>
      </div>

      <div className="season-matchup-weeks">
        {visibleWeeks.map((week) => {
          const summary = getWeekSummary(week, teams);
          const report = reports.find(({ week: reportWeek }) =>
            reportWeek === week.week
          );

          return (
            <section
              id={`season-matchups-week-${week.week}`}
              className="season-matchup-week"
              key={week.week}
            >
              <header>
                <div>
                  <h2>Week {week.week}</h2>
                  <span
                    className={`home-status home-status-${week.status}`}
                  >
                    {week.status === "final" ? "Final" : "In progress"}
                  </span>
                </div>
                <p>
                  {summary.high && <>High: {summary.high}</>}
                  {summary.low && <> · Low: {summary.low}</>}
                  {summary.closest && <> · Closest: {summary.closest}</>}
                  {" "}
                  <Link to={`/seasons/${year}/weeks/${week.week}`}>
                    Week {week.week} page{report ? ", with its report" : ""} →
                  </Link>
                </p>
              </header>
              <div className="season-matchup-grid">
                {week.matchups.map((matchup, index) => (
                  <CompactMatchupCard
                    key={`${week.week}-${matchup.home_team_id}-${matchup.away_team_id}-${index}`}
                    matchup={matchup}
                    year={year}
                    week={week.week}
                    records={week.records}
                    status={week.status}
                    teams={teams}
                    highlightedTeamId={highlightedTeamId}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {(futureWeeks.length > 0 || hasFuturePlayoffs) && (
        <div className="season-matchups-upcoming">
          <strong>
            {futureWeeks.length > 0
              ? `Weeks ${futureWeeks[0].week} to ${futureWeeks[futureWeeks.length - 1].week}`
              : "Upcoming games"}
            {hasFuturePlayoffs ? " and the playoffs" : ""}
          </strong>
          <span>
            Not played yet. Upcoming weeks will appear here when scores are
            available.
          </span>
        </div>
      )}
    </section>
  );
}

export default SeasonMatchupsView;
