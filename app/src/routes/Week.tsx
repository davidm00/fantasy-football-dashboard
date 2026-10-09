import {
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useParams,
  useRouteError,
} from "react-router";
import MatchupCard from "../components/shared/MatchupCard";
import SeasonReportPanel from "../components/shared/SeasonReportPanel";
import StandingsPanel from "../components/shared/StandingsPanel";
import WeekMetricsPanel from "../components/week/WeekMetricsPanel";
import seasonList from "../data/seasons.json";
import { getStanding } from "../utils/teamHelper";
import RouteErrorPage from "./RouteErrorPage";
import type { WeekLoaderData } from "./loader";

export function WeekErrorBoundary() {
  const error = useRouteError();
  const { season } = useParams();
  const newestSeason = Math.max(...seasonList);
  const seasonPath = season ? `/seasons/${season}` : "/";
  const isMissingSeason =
    isRouteErrorResponse(error) &&
    error.status === 404 &&
    error.statusText === "Season not found" &&
    typeof error.data === "string";
  const isMissingWeek =
    isRouteErrorResponse(error) &&
    error.status === 404 &&
    typeof error.data === "string";

  if (isMissingSeason) {
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

  if (!isMissingWeek) {
    return (
      <RouteErrorPage
        code="Error"
        eyebrow="Unable to load week"
        title="Something went wrong"
        description="We couldn't load this week right now. Return to the season overview and try again."
        linkTo={seasonPath}
        linkLabel={season ? `Back to the ${season} season` : "Back to home"}
      />
    );
  }

  return (
    <RouteErrorPage
      code="404"
      eyebrow="Week unavailable"
      title={`No week ${error.data}`}
      description="We don't have league data for that week. Return to the season overview to choose an available week."
      linkTo={seasonPath}
      linkLabel={season ? `Back to the ${season} season` : "Back to home"}
    />
  );
}

function Week() {
  const { season, week, weekMetrics } =
    useLoaderData() as WeekLoaderData;
  const matchup = season.matchups.find((item) => item.week === week);
  const status = season.settings.week_status[String(week)];
  const records = getStanding(
    season.matchups,
    week,
    season.settings.regular_season_length,
  );
  const weekNumbers = Object.keys(season.settings.week_status)
    .map(Number)
    .sort((left, right) => left - right);
  const weekIndex = weekNumbers.indexOf(week);
  const previousWeek = weekNumbers[weekIndex - 1];
  const nextWeek = weekNumbers[weekIndex + 1];
  const report = season.reports.find((item) => item.week === week);
  const statusLabel =
    status === "in_progress"
      ? "In progress"
      : status === "final"
        ? "Final"
        : "Not started";

  return (
    <main id="app" className="week-dashboard">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to={`/seasons/${season.year}`}>{season.year}</Link>
        <span className="breadcrumb-separator" aria-hidden="true">
          /
        </span>
        <span>Weeks</span>
        <span className="breadcrumb-separator" aria-hidden="true">
          /
        </span>
        <span aria-current="page">Week {week}</span>
      </nav>

      <header className="week-header">
        <div>
          <span className="home-eyebrow">
            {season.year} · Regular season
          </span>
          <div className="week-title-row">
            <h1>Week {week}</h1>
            <span className={`home-status home-status-${status}`}>
              {statusLabel}
            </span>
          </div>
          <p>
            Matchup scores and standings reflect the data available for this
            week.
          </p>
        </div>
        <nav className="week-navigation" aria-label="Adjacent weeks">
          {previousWeek ? (
            <Link to={`/seasons/${season.year}/weeks/${previousWeek}`}>
              ← Week {previousWeek}
            </Link>
          ) : (
            <span aria-disabled="true">← Previous</span>
          )}
          {nextWeek ? (
            <Link to={`/seasons/${season.year}/weeks/${nextWeek}`}>
              Week {nextWeek} →
            </Link>
          ) : (
            <span aria-disabled="true">Next →</span>
          )}
        </nav>
      </header>

      <section className="week-matchups" aria-labelledby="week-matchups-title">
        <div className="home-section-heading">
          <h2 id="week-matchups-title">Week {week} matchups</h2>
          <span>{statusLabel}</span>
        </div>
        {matchup ? (
          <div className="week-matchup-grid">
            {matchup.matchups.map((result) => (
              <MatchupCard
                key={`${result.home_team_id}-${result.away_team_id}`}
                matchup={result}
                status={matchup.status}
                teams={season.teams}
                records={records}
                insight={
                  weekMetrics.matchupInsights.find(
                    (insight) =>
                      insight.homeTeamId === result.home_team_id &&
                      insight.awayTeamId === result.away_team_id,
                  )?.text
                }
                detailTo={
                  result.home_score !== null &&
                    result.away_score !== null &&
                    season.teams.some(
                      ({ team_id }) => team_id === result.home_team_id,
                    ) &&
                    season.teams.some(
                      ({ team_id }) => team_id === result.away_team_id,
                    )
                    ? `/seasons/${season.year}/weeks/${week}/matchups/${result.home_team_id}/${result.away_team_id}`
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <p className="week-empty">
            Matchup pairings are not available for this week.
          </p>
        )}
      </section>

      <WeekMetricsPanel metrics={weekMetrics} teams={season.teams} />

      <div className="home-lower-grid">
        <SeasonReportPanel
          report={report}
          eyebrow={`Week ${week} report`}
        />
        <StandingsPanel
          title="Standings"
          subtitle={`Through Week ${week}`}
          season={season}
          throughWeek={week}
        />
      </div>
    </main>
  );
}

export default Week;
