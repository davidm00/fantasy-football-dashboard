import { useState, useSyncExternalStore } from "react";
import "./App.css";
import { useLoadSeasonData } from "./hooks/useLoadSeasonData";
import { SeasonFile } from "./utils/seasonDataLoader";
import seasonsList from "./data/seasons.json";
import type { Matchup, MatchupResult, Team } from "./models/models";
import { getStanding } from "./utils/teamHelper";
import { reportsList } from "./data/reportsList";

const YEAR = new Date().getFullYear();
const MOBILE_REPORT_QUERY = "(max-width: 720px)";

const SEASON_FILES = [
  SeasonFile.Settings,
  SeasonFile.Teams,
  SeasonFile.Matchups,
];

type MatchupDetails = { team: Team; record: string };

const formatFileSize = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;

const subscribeToMobileReportLayout = (onChange: () => void) => {
  const mediaQuery = window.matchMedia(MOBILE_REPORT_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};

const getMobileReportLayout = () =>
  window.matchMedia(MOBILE_REPORT_QUERY).matches;

function App() {
  const [year, setYear] = useState<number>(YEAR);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const isMobileReportLayout = useSyncExternalStore(
    subscribeToMobileReportLayout,
    getMobileReportLayout,
    () => false,
  );
  const { state } = useLoadSeasonData(year, SEASON_FILES);

  const matchups = state.status === "success" ? state.data.matchups : [];
  const settings = state.status === "success" ? state.data.settings : undefined;
  const teams = state.status === "success" ? state.data.teams : [];
  const completedMatchups = matchups.filter(
    (matchup) => matchup.status === "final",
  );
  const latestMatchupWeek = completedMatchups.reduce(
    (latest, matchup) => Math.max(latest, matchup.week),
    1,
  );
  const week =
    selectedWeek !== null &&
    completedMatchups.some((matchup) => matchup.week === selectedWeek)
      ? selectedWeek
      : latestMatchupWeek;

  const records = getStanding(
    matchups,
    week,
    settings?.regular_season_length ?? week,
  );

  const currentMatchup = completedMatchups.find((m) => m.week === week);

  const reports = reportsList.filter((r) => r.season === year);
  const currentReport = reports.find((r) => r.week === week);
  const matchupWeeks = completedMatchups.map((matchup) => matchup.week);
  const firstWeek = matchupWeeks.length ? Math.min(...matchupWeeks) : week;
  const lastWeek = matchupWeeks.length ? Math.max(...matchupWeeks) : week;
  const isFirstWeek = week === firstWeek;
  const isLastWeek = week === lastWeek;
  const reportWeeks = reports
    .map((report) => report.week)
    .sort((a, b) => a - b);
  const alternateReportWeek = currentReport
    ? null
    : isFirstWeek
      ? (reportWeeks.find((reportWeek) => reportWeek > week) ?? reportWeeks[0])
      : isLastWeek
        ? ([...reportWeeks].reverse().find((reportWeek) => reportWeek < week) ??
          reportWeeks[reportWeeks.length - 1])
        : reportWeeks.reduce<number | null>((closest, reportWeek) => {
            if (closest === null) return reportWeek;
            return Math.abs(reportWeek - week) < Math.abs(closest - week)
              ? reportWeek
              : closest;
          }, null);

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setYear(Number(e.target.value));
    setSelectedWeek(null);
  };

  const handleWeekChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedWeek(Number(e.target.value));
  };

  const nextWeek = () => {
    let nxt = week + 1;
    setSelectedWeek(nxt);
  };

  const prevWeek = () => {
    let prv = week - 1;
    setSelectedWeek(prv);
  };

  const getTeam = (id: number): MatchupDetails => {
    return {
      team: teams.find((t) => t.team_id === id) ?? {
        team_id: id,
        team_name: "Unknown team",
        owners: [],
      },
      record: `${records[id].wins}-${records[id].losses}${records[id].ties ? `-${records[id].ties}` : ""}`,
    };
  };

  return (
    <>
      <header className="app-nav">
        <a
          className="app-brand"
          href="#scoreboard"
          aria-label="Ian Book Believers"
        >
          <span className="app-brand-mark" aria-hidden="true">
            IB
          </span>
          <span className="app-brand-copy">
            <span className="app-brand-name">Ian Book Believers</span>
            <span className="app-brand-subtitle">
              Scores, stories, and season history
            </span>
          </span>
        </a>
        <nav className="app-nav-links" aria-label="Primary navigation">
          <a href="#scoreboard">Scoreboard</a>
          <a href="#reports">Reports</a>
        </nav>
      </header>
      <main id="app">
        {state.status === "loading" && (
          <h1 className="status-message">Loading data...</h1>
        )}
        {state.status === "error" && (
          <h1 className="status-message status-message-error">
            There was an error: {state.error}
          </h1>
        )}

        {state.status === "success" && (
          <section id="scoreboard" className="match-ups-section">
            <div className="match-ups-header">
              <div className="match-ups-heading">
                <span className="match-ups-eyebrow">League scoreboard</span>
                <h1>
                  {year} <span>&bull;</span> Week {week} matchups
                </h1>
              </div>
              <div className="match-ups-controls">
                <select
                  className="btn-primary"
                  value={year}
                  onChange={handleYearChange}
                >
                  {seasonsList.map((yr: number) => {
                    return (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    );
                  })}
                </select>
                <button
                  className="btn-primary"
                  onClick={prevWeek}
                  disabled={week === 1}
                >
                  &larr;
                </button>
                <select
                  className="btn-primary"
                  value={week}
                  onChange={handleWeekChange}
                >
                  {completedMatchups.map((mu: Matchup) => {
                    return (
                      <option key={mu.week} value={mu.week}>
                        Week {mu.week}
                      </option>
                    );
                  })}
                </select>
                <button
                  className="btn-primary"
                  onClick={nextWeek}
                  disabled={week === lastWeek}
                >
                  &rarr;
                </button>
              </div>
            </div>
            <div className="match-ups-cards">
              {currentMatchup &&
                currentMatchup.matchups.map((m, ind) => {
                  return (
                    <MatchupCard
                      key={ind}
                      result={m}
                      home={getTeam(m.home_team_id)}
                      away={getTeam(m.away_team_id)}
                    />
                  );
                })}
            </div>
          </section>
        )}

        <section id="reports" className="reports-section">
          <article
            className={`report-container ${currentReport ? "report-container-document" : ""}`}
          >
            {reports.length === 0 ? (
              <div className="report-state">
                <div className="report-state-title">
                  No reports are available for the {year} season.
                </div>
                <div className="report-state-description">
                  Choose another season to read an edition.
                </div>
              </div>
            ) : !currentReport ? (
              <div className="report-state">
                <div className="report-state-title">
                  No report is available for Week {week}.
                </div>
                <div className="report-state-description">
                  {isFirstWeek
                    ? `The next available edition is from Week ${alternateReportWeek}.`
                    : isLastWeek
                      ? `Catch up with the Week ${alternateReportWeek} edition from earlier this season.`
                      : `The nearest available edition is from Week ${alternateReportWeek}.`}
                </div>
                {alternateReportWeek !== null && (
                  <button
                    className="btn-primary report-state-action"
                    onClick={() => setSelectedWeek(alternateReportWeek)}
                  >
                    Read the Week {alternateReportWeek} edition
                  </button>
                )}
              </div>
            ) : (
              <div className="report-current">
                <div className="report-document-header">
                  <div className="report-document-info">
                    <div className="report-document-title">
                      {currentReport.title}
                    </div>
                    <div className="report-document-meta">
                      <span>
                        {year} season &bull; Week {week}
                      </span>
                      <span>
                        {currentReport.pageCount}{" "}
                        {currentReport.pageCount === 1 ? "page" : "pages"}{" "}
                        &bull; {formatFileSize(currentReport.fileSize)}
                      </span>
                    </div>
                  </div>
                  <div className="report-document-actions">
                    <a
                      className="report-link report-link-primary"
                      href={currentReport.path}
                      target="_blank"
                      rel="noopener"
                      aria-label={`Read the Week ${week} report in a new tab`}
                    >
                      <span className="report-link-desktop">
                        Open full screen
                      </span>
                      <span className="report-link-mobile">Read report</span>
                    </a>
                    <a
                      className="report-link report-link-secondary"
                      href={currentReport.path}
                      download
                    >
                      Download
                    </a>
                  </div>
                </div>
                {!isMobileReportLayout && (
                  <iframe
                    className="report-frame"
                    src={currentReport.path}
                    title={`Week ${week} report`}
                  />
                )}
              </div>
            )}
          </article>
          {reports.length > 1 && (
            <article className="past-report-cont">
              {reports.map((r) => {
                return (
                  <div
                    className={`past-report-item ${r.week === week ? "past-report-item-active" : ""}`}
                    onClick={() => setSelectedWeek(r.week)}
                    key={r.week}
                  >
                    <span>Week {r.week}</span>
                    <span>Report</span>
                  </div>
                );
              })}
            </article>
          )}
        </section>
      </main>
    </>
  );
}

function MatchupCard({
  result,
  home,
  away,
}: {
  result: MatchupResult;
  home: MatchupDetails;
  away: MatchupDetails;
}) {
  const homeWin = result.home_score > result.away_score ? true : false;

  return (
    <div className="match-ups-card">
      <div className="match-ups-card-team">
        <div className="match-ups-card-team-name">
          <p className="card-title">{home.team.team_name}</p>
          <p className="card-subtitle">
            {home.team.owners[0].name} &bull; {home.record}
          </p>
        </div>
        <div
          className={`match-ups-card-team-score ${homeWin ? "match-ups-card-team-score-winner" : ""}`}
        >
          {result.home_score}
        </div>
      </div>
      <div className="match-ups-card-team">
        <div className="match-ups-card-team-name">
          <p className="card-title">{away.team.team_name}</p>
          <p className="card-subtitle">
            {away.team.owners[0].name} &bull; {away.record}
          </p>
        </div>
        <div
          className={`match-ups-card-team-score ${!homeWin ? "match-ups-card-team-score-winner" : ""}`}
        >
          {result.away_score}
        </div>
      </div>
    </div>
  );
}

export default App;
