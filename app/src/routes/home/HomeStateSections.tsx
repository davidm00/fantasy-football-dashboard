import { Link } from "react-router";
import type { MatchupResult, Team } from "../../models/models";
import MatchupCard from "../../components/MatchupCard";
import type {
  HomeLoaderState,
  HomeSeasonData,
} from "../loader";
import { getStanding } from "../../utils/teamHelper";
import HomeStateHeader from "../../components/home/HomeStateHeader";
import SeasonReportPanel from "../../components/home/SeasonReportPanel";
import StandingsPanel from "../../components/home/StandingsPanel";
import SeasonSuperlatives from "../../components/home/SeasonSuperlatives";
import BracketRoundColumn from "./BracketRoundColumn";
import {
  EMPTY_RECORD,
  formatRecord,
  getChampionshipDetails,
  getFinalSeasonStandings,
  getLatestReport,
  getSeasonStandings,
  getTeam,
} from "../../utils/homeViewUtils";

export function BetweenWeeksSection({
  season,
  state,
}: {
  season: HomeSeasonData;
  state: Extract<HomeLoaderState, { kind: "betweenWeeks" }>;
}) {
  const activeMatchup = season.matchups.find(
    (matchup) => matchup.week === state.upcomingWeek,
  );
  const finalizedMatchups = season.matchups.filter(
    (matchup) => matchup.status === "final",
  );
  const latestFinalizedMatchup = finalizedMatchups.reduce<
    (typeof finalizedMatchups)[number] | undefined
  >(
    (latest, matchup) =>
      !latest || matchup.week > latest.week ? matchup : latest,
    undefined,
  );
  const standingsWeek = latestFinalizedMatchup?.week ?? 0;
  const records = getStanding(
    season.matchups,
    standingsWeek,
    season.settings.regular_season_length,
  );
  const latestReport = [...season.reports]
    .filter((report) => report.week <= standingsWeek)
    .sort((left, right) => right.week - left.week)[0];

  return (
    <>
      <section className="home-hero" aria-labelledby="home-week-title">
        <span className="home-eyebrow">{season.year} · Regular season</span>
        <h1 id="home-week-title">Week {state.upcomingWeek} matchups</h1>
        <p className="home-summary">
          {activeMatchup?.status === "in_progress"
            ? "Games are in progress. Records reflect finalized games."
            : "Games have not started. Records reflect finalized games."}
        </p>
        <div className="home-pairings">
          {activeMatchup?.matchups.map((matchup) => (
            <MatchupCard
              key={`${matchup.home_team_id}-${matchup.away_team_id}`}
              matchup={matchup}
              status={activeMatchup.status}
              teams={season.teams}
              records={records}
            />
          ))}
        </div>
      </section>

      {latestFinalizedMatchup && (
        <section className="home-panel home-results">
          <div className="home-section-heading">
            <h2>Week {latestFinalizedMatchup.week} results</h2>
            <div className="home-section-actions">
              <span>Final</span>
              <Link
                className="section-route-link"
                to={`/seasons/${season.year}/weeks/${latestFinalizedMatchup.week}`}
              >
                View week {latestFinalizedMatchup.week} →
              </Link>
            </div>
          </div>
          <div className="home-results-grid">
            {latestFinalizedMatchup.matchups.map((matchup) => (
              <ResultLine
                key={`${matchup.home_team_id}-${matchup.away_team_id}`}
                matchup={matchup}
                teams={season.teams}
              />
            ))}
          </div>
        </section>
      )}

      <SeasonSuperlatives
        title={`${season.year} leaders`}
        items={[
          season.metrics.superlatives.mostPoints,
          season.metrics.superlatives.weeklyHighs,
          season.metrics.superlatives.luckiest,
          season.metrics.superlatives.lineupEfficiency,
        ]}
      />

      <div className="home-lower-grid">
        <SeasonReportPanel
          report={latestReport}
          eyebrow={
            latestReport
              ? `Latest report · Week ${latestReport.week}`
              : "Latest report"
          }
        />
        <StandingsPanel
          title="Standings"
          subtitle={`After Week ${standingsWeek}`}
          season={season}
        />
      </div>
    </>
  );
}

export function PlayoffsSection({
  season,
  state,
}: {
  season: HomeSeasonData;
  state: Extract<HomeLoaderState, { kind: "playoffs" }>;
}) {
  const round = Math.max(
    1,
    state.week - season.settings.regular_season_length,
  );
  const seeds = getSeasonStandings(season).slice(0, 6);

  return (
    <>
      <HomeStateHeader
        eyebrow={`${season.year} · Playoffs`}
        title={`Round ${round}: ${round === 1 ? "quarterfinals" : round === 2 ? "semifinals" : "championship"}`}
        description={`Week ${state.week} · playoff bracket and final regular-season seeds`}
      />
      <section className="home-panel home-bracket">
        <div className="home-section-heading">
          <h2>The bracket</h2>
          <span>Full bracket view coming soon</span>
        </div>
        <div className="home-bracket-grid">
          {[0, 1, 2].map((roundIndex) => (
            <BracketRoundColumn
              key={roundIndex}
              roundIndex={roundIndex}
              season={season}
              seeds={seeds.map(({ team }) => team)}
            />
          ))}
        </div>
        <p className="home-panel-note">
          Round 1 includes the opening games and byes. Later rounds show the
          teams already known or the matchup each winner advances into.
        </p>
      </section>
      <section className="home-panel home-consolation">
        <strong>Consolation games</strong>
        <span>Teams outside the championship bracket</span>
        <span aria-hidden="true">+</span>
      </section>
      <SeasonSuperlatives
        title="Regular-season superlatives"
        items={[
          season.metrics.superlatives.mostPoints,
          season.metrics.superlatives.topHalf,
          season.metrics.superlatives.allPlay,
          season.metrics.superlatives.lineupEfficiency,
        ]}
      />
      <div className="home-lower-grid">
        <SeasonReportPanel
          report={getLatestReport(season)}
          eyebrow="Latest report"
        />
        <StandingsPanel
          title="Seeds"
          subtitle="Final regular season"
          season={season}
          limit={6}
        />
      </div>
    </>
  );
}

export function SeasonOverSection({
  season,
  state,
}: {
  season: HomeSeasonData;
  state: Extract<HomeLoaderState, { kind: "seasonOver" }>;
}) {
  const champion = season.teams.find(
    (team) => team.team_id === state.championId,
  );
  const championship = getChampionshipDetails(season);
  const standings = getSeasonStandings(season);
  const finalStandings = getFinalSeasonStandings(season);
  const runnerUp = championship.runnerUp;
  const remaining = finalStandings.filter(
    ({ team }) =>
      team.team_id !== champion?.team_id &&
      team.team_id !== runnerUp?.team_id,
  );
  const finishers = [
    { label: "1st", team: champion, note: "Won the title game" },
    { label: "2nd", team: runnerUp, note: "Lost the title game" },
    { label: "3rd", team: remaining[0]?.team, note: "Top remaining finisher" },
    {
      label: "Last",
      team: remaining[remaining.length - 1]?.team,
      note: "Lowest regular-season record",
    },
  ];

  return (
    <>
      <section className="home-champion-banner">
        <div>
          <span className="home-eyebrow">{season.year} champion</span>
          <h1>{champion?.team_name ?? "Season champion"}</h1>
          <p>
            {champion?.owners[0]?.name ?? "Champion"} ·{" "}
            {champion
              ? formatRecord(
                  standings.find(
                    ({ team }) => team.team_id === champion.team_id,
                  )?.record ?? EMPTY_RECORD,
                )
              : "—"}{" "}
            in the regular season
          </p>
        </div>
        <div className="home-title-game">
          <span>Championship · Week {championship.week ?? "—"}</span>
          <strong>
            {champion?.team_name ?? "Champion"}{" "}
            <b>{championship.championScore ?? "—"}</b>
          </strong>
          <strong>
            {runnerUp?.team_name ?? "Runner-up"}{" "}
            <b>{championship.runnerUpScore ?? "—"}</b>
          </strong>
        </div>
      </section>
      <section className="home-finish-section">
        <h2>How it finished</h2>
        <div className="home-finish-grid">
          {finishers.map((finisher) => (
            <article key={finisher.label} className="home-finish-card">
              <span>{finisher.label}</span>
              <strong>{finisher.team?.team_name ?? "To be confirmed"}</strong>
              <small>{finisher.note}</small>
            </article>
          ))}
        </div>
      </section>
      <SeasonSuperlatives
        title={`${season.year} in numbers`}
        items={[
          season.metrics.superlatives.topScore,
          season.metrics.superlatives.mostPoints,
          season.metrics.superlatives.unluckiest,
          season.metrics.superlatives.benchPoints,
        ]}
      />
      <div className="home-lower-grid">
        <SeasonReportPanel
          report={getLatestReport(season)}
          eyebrow="Final report"
        />
        <StandingsPanel
          title="Final standings"
          subtitle="After the playoffs"
          season={season}
          final
        />
      </div>
    </>
  );
}

export function PreseasonSection({
  season,
  state,
}: {
  season: HomeSeasonData;
  state: Extract<HomeLoaderState, { kind: "preseason" }>;
}) {
  const previousSeason = state.previousSeason;
  const previousChampionId = previousSeason?.bracket.champion?.team_id;
  const previousChampion = previousSeason?.teams.find(
    (team) => team.team_id === previousChampionId,
  );
  const championship = previousSeason
    ? getChampionshipDetails(previousSeason)
    : null;

  return (
    <>
      <HomeStateHeader
        eyebrow={`${season.year} · Preseason`}
        title={`${season.year} is coming`}
        description="No games have been played yet. Draft and keeper details will appear here as the new season is finalized."
      />
      <div className="home-preseason-grid">
        <section className="home-panel home-draft-card">
          <span className="home-eyebrow">Draft</span>
          <h2>Draft date and time</h2>
          <p>
            Draft details have not been announced. This card will update when
            the new season&apos;s draft data is available.
          </p>
        </section>
        <section className="home-champion-banner home-defending-champion">
          <div>
            <span className="home-eyebrow">Defending champion</span>
            <h2>{previousChampion?.team_name ?? "To be announced"}</h2>
            <p>
              {previousChampion?.owners[0]?.name ?? "Champion"} · defeated{" "}
              {championship?.runnerUp?.team_name ?? "the runner-up"}
            </p>
            {previousSeason && (
              <Link
                className="section-route-link section-route-link-dark"
                to={`/seasons/${previousSeason.year}`}
              >
                Look back at {previousSeason.year} →
              </Link>
            )}
          </div>
        </section>
      </div>
      <section className="home-panel home-keepers">
        <h2>Keepers</h2>
        <p>
          Not declared yet. Keeper selections and their round costs will appear
          here when they are available.
        </p>
      </section>
      {previousSeason && (
        <SeasonSuperlatives
          title={`${previousSeason.year} superlatives`}
          items={[
            previousSeason.metrics.superlatives.topScore,
            previousSeason.metrics.superlatives.mostPoints,
            previousSeason.metrics.superlatives.allPlay,
            previousSeason.metrics.superlatives.lineupEfficiency,
          ]}
        />
      )}
      {previousSeason && (
        <div className="home-lower-grid">
          <SeasonReportPanel
            report={getLatestReport(previousSeason)}
            eyebrow={`Last report of ${previousSeason.year}`}
          />
          <StandingsPanel
            title={`How ${previousSeason.year} finished`}
            subtitle="Final standings"
            season={previousSeason}
            limit={4}
            final
          />
        </div>
      )}
    </>
  );
}

function ResultLine({
  matchup,
  teams,
}: {
  matchup: MatchupResult;
  teams: Team[];
}) {
  const home = getTeam(teams, matchup.home_team_id);
  const away = getTeam(teams, matchup.away_team_id);

  return (
    <div className="home-result-line">
      <span>
        <strong>{home?.owners[0]?.name ?? home?.team_name}</strong>{" "}
        {matchup.home_score ?? "—"}
      </span>
      <span>–</span>
      <span>
        {matchup.away_score ?? "—"}{" "}
        <strong>{away?.owners[0]?.name ?? away?.team_name}</strong>
      </span>
    </div>
  );
}
