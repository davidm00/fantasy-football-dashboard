import { useMemo, useState } from "react";
import {
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useRouteError,
} from "react-router";
import type { Lineup, Team } from "../models/models";
import {
  EMPTY_RECORD,
  formatRecord,
} from "../utils/homeViewUtils";
import type { OptimalLineupPlayer } from "../utils/metrics";
import type { MatchupDetailLoaderData } from "./loader";
import RouteErrorPage from "./RouteErrorPage";

type DisplayPlayer = Lineup & {
  displaySlot: string;
};

function getManagerName(team: Team | undefined) {
  return team?.owners.map(({ name }) => name).join(" & ") ||
    team?.team_name ||
    "Unknown manager";
}

function getStarterSlotOrder(rosterSlots: Record<string, number>) {
  return Object.entries(rosterSlots).flatMap(([slot, count]) =>
    slot === "BE" || slot === "IR" || slot === "ER"
      ? []
      : Array.from({ length: count }, () => slot)
  );
}

function getDisplayPlayers(
  lineup: Lineup[],
  optimal: OptimalLineupPlayer[],
  bestPossible: boolean,
  slotOrder: string[],
) {
  const players: DisplayPlayer[] = bestPossible
    ? optimal.map((player) => ({
        ...player,
        displaySlot: player.selectedSlot,
      }))
    : lineup
        .filter(
          ({ slot_position }) =>
            slot_position !== "BE" &&
            slot_position !== "IR" &&
            slot_position !== "ER",
        )
        .map((player) => ({
          ...player,
          displaySlot: player.slot_position,
        }));
  const remaining = [...players];
  const ordered = slotOrder.flatMap((slot) => {
    const index = remaining.findIndex(
      ({ displaySlot }) => displaySlot === slot,
    );
    return index < 0 ? [] : remaining.splice(index, 1);
  });

  return [...ordered, ...remaining];
}

function getBench(
  lineup: Lineup[],
  starters: DisplayPlayer[],
  bestPossible: boolean,
) {
  if (!bestPossible) {
    return lineup.filter(({ slot_position }) => slot_position === "BE");
  }

  const starterIds = new Set(starters.map(({ player_id }) => player_id));
  return lineup.filter(
    ({ player_id, slot_position }) =>
      !starterIds.has(player_id) &&
      slot_position !== "IR" &&
      slot_position !== "ER",
  );
}

function LineupPlayer({
  player,
  highlight,
  align,
}: {
  player: Lineup | undefined;
  highlight: boolean;
  align: "left" | "right";
}) {
  if (!player) return <span />;

  return (
    <span className={`matchup-lineup-player matchup-lineup-player-${align}`}>
      <strong>{player.name}</strong>
      <small>
        {player.position} {player.pro_team}
      </small>
      {highlight && <i aria-label="Decisive lineup decision" />}
    </span>
  );
}

function LineupRows({
  home,
  away,
  homeHighlightId,
  awayHighlightId,
  bench = false,
}: {
  home: Lineup[];
  away: Lineup[];
  homeHighlightId?: number;
  awayHighlightId?: number;
  bench?: boolean;
}) {
  return Array.from(
    { length: Math.max(home.length, away.length) },
    (_, index) => {
      const homePlayer = home[index];
      const awayPlayer = away[index];
      const slot =
        (homePlayer as DisplayPlayer | undefined)?.displaySlot ??
        (awayPlayer as DisplayPlayer | undefined)?.displaySlot ??
        "BE";

      return (
        <div className="matchup-lineup-row" key={`${slot}-${index}`}>
          <LineupPlayer
            player={homePlayer}
            highlight={homePlayer?.player_id === homeHighlightId}
            align="left"
          />
          <strong
            className={
              homePlayer?.player_id === homeHighlightId ? "highlight" : undefined
            }
          >
            {homePlayer?.points.toFixed(2) ?? "—"}
          </strong>
          <span>{bench ? "BE" : slot}</span>
          <strong
            className={
              awayPlayer?.player_id === awayHighlightId ? "highlight" : undefined
            }
          >
            {awayPlayer?.points.toFixed(2) ?? "—"}
          </strong>
          <LineupPlayer
            player={awayPlayer}
            highlight={awayPlayer?.player_id === awayHighlightId}
            align="right"
          />
        </div>
      );
    },
  );
}

export function MatchupErrorBoundary() {
  const error = useRouteError();
  const missing =
    isRouteErrorResponse(error) && error.status === 404;

  return (
    <RouteErrorPage
      code={missing ? "404" : "Error"}
      eyebrow={missing ? "Matchup unavailable" : "Unable to load matchup"}
      title={missing ? "That matchup was not found" : "Something went wrong"}
      description={
        missing
          ? "The requested matchup is not available for this season and week."
          : "We couldn't load this matchup right now."
      }
      linkTo="/seasons"
      linkLabel="Back to seasons"
    />
  );
}

function Matchup() {
  const data = useLoaderData() as MatchupDetailLoaderData;
  const [bestPossible, setBestPossible] = useState(false);
  const {
    season,
    week,
    matchup,
    boxScore,
    status,
    homePerformance,
    awayPerformance,
  } = data;
  const home = season.teams.find(
    ({ team_id }) => team_id === matchup.home_team_id,
  );
  const away = season.teams.find(
    ({ team_id }) => team_id === matchup.away_team_id,
  );
  const homeName = getManagerName(home);
  const awayName = getManagerName(away);
  const homeWon = boxScore.home_score > boxScore.away_score;
  const awayWon = boxScore.away_score > boxScore.home_score;
  const margin = Math.abs(boxScore.home_score - boxScore.away_score);
  const slotOrder = useMemo(
    () => getStarterSlotOrder(season.settings.roster_slots),
    [season.settings.roster_slots],
  );
  const homeStarters = getDisplayPlayers(
    boxScore.home_lineup,
    data.homeOptimalLineup,
    bestPossible,
    slotOrder,
  );
  const awayStarters = getDisplayPlayers(
    boxScore.away_lineup,
    data.awayOptimalLineup,
    bestPossible,
    slotOrder,
  );
  const homeBench = getBench(
    boxScore.home_lineup,
    homeStarters,
    bestPossible,
  );
  const awayBench = getBench(
    boxScore.away_lineup,
    awayStarters,
    bestPossible,
  );
  const homeActualIds = new Set(
    boxScore.home_lineup
      .filter(({ slot_position }) =>
        slot_position !== "BE" &&
        slot_position !== "IR" &&
        slot_position !== "ER"
      )
      .map(({ player_id }) => player_id),
  );
  const awayActualIds = new Set(
    boxScore.away_lineup
      .filter(({ slot_position }) =>
        slot_position !== "BE" &&
        slot_position !== "IR" &&
        slot_position !== "ER"
      )
      .map(({ player_id }) => player_id),
  );
  const homeDecisiveBench = data.homeOptimalLineup
    .filter(({ player_id }) => !homeActualIds.has(player_id))
    .sort((left, right) => right.points - left.points)[0];
  const awayDecisiveBench = data.awayOptimalLineup
    .filter(({ player_id }) => !awayActualIds.has(player_id))
    .sort((left, right) => right.points - left.points)[0];
  const selfInflictedHome =
    !homeWon &&
    homePerformance?.pointsLeftOnBench !== null &&
    (homePerformance?.score ?? 0) +
      (homePerformance?.pointsLeftOnBench ?? 0) >
      boxScore.away_score;
  const selfInflictedAway =
    !awayWon &&
    awayPerformance?.pointsLeftOnBench !== null &&
    (awayPerformance?.score ?? 0) +
      (awayPerformance?.pointsLeftOnBench ?? 0) >
      boxScore.home_score;
  const decisiveHomeId = selfInflictedHome
    ? homeDecisiveBench?.player_id
    : undefined;
  const decisiveAwayId = selfInflictedAway
    ? awayDecisiveBench?.player_id
    : undefined;
  const matchupWeek = season.matchups.find(({ week: itemWeek }) =>
    itemWeek === week
  );
  const previousMatchup = matchupWeek?.matchups[data.matchupIndex - 1];
  const nextMatchup = matchupWeek?.matchups[data.matchupIndex + 1];
  const matchupPath = (item: typeof matchup) =>
    `/seasons/${season.year}/weeks/${week}/matchups/${item.home_team_id}/${item.away_team_id}`;
  const statusLabel =
    status === "final"
      ? "Final"
      : status === "in_progress"
        ? "In progress"
        : "Not started";
  const selfInflictedManager = selfInflictedHome
    ? homeName
    : selfInflictedAway
      ? awayName
      : null;
  const decisivePlayer = selfInflictedHome
    ? homeDecisiveBench
    : selfInflictedAway
      ? awayDecisiveBench
      : undefined;

  return (
    <main className="matchup-detail">
      <div className="matchup-detail-topline">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to={`/seasons/${season.year}`}>{season.year}</Link>
          <span>/</span>
          <Link to={`/seasons/${season.year}/weeks/${week}`}>Week {week}</Link>
          <span>/</span>
          <span aria-current="page">{homeName} vs {awayName}</span>
        </nav>
        <nav aria-label="Other games this week">
          {previousMatchup ? (
            <Link to={matchupPath(previousMatchup)}>← Previous game</Link>
          ) : <span aria-disabled="true">← Previous game</span>}
          {nextMatchup ? (
            <Link to={matchupPath(nextMatchup)}>Next game →</Link>
          ) : <span aria-disabled="true">Next game →</span>}
        </nav>
      </div>

      <section className="matchup-scoreboard">
        <div>
          <small>{home?.team_name} · {formatRecord(data.records[matchup.home_team_id] ?? EMPTY_RECORD)}</small>
          <strong>{homeName}</strong>
          <b>{boxScore.home_score.toFixed(2)}</b>
          <span>{homePerformance ? `${homePerformance.rank} of ${season.settings.team_count} in points this week` : ""}</span>
        </div>
        <div>
          <span className={`home-status home-status-${status}`}>{statusLabel}</span>
          {status === "final" && <strong>by {margin.toFixed(2)}</strong>}
        </div>
        <div>
          <small>{away?.team_name} · {formatRecord(data.records[matchup.away_team_id] ?? EMPTY_RECORD)}</small>
          <strong>{awayName}</strong>
          <b>{boxScore.away_score.toFixed(2)}</b>
          <span>{awayPerformance ? `${awayPerformance.rank} of ${season.settings.team_count} in points this week` : ""}</span>
        </div>
      </section>

      {(data.closestGame || selfInflictedManager || data.matchupInsight) && (
        <section className="matchup-story">
          <div>
            {data.closestGame && <span>Closest game of {season.year}</span>}
            {selfInflictedManager && <span>Self-inflicted loss</span>}
          </div>
          <h1>
            {selfInflictedManager
              ? `${selfInflictedManager} lost by ${margin.toFixed(2)}${decisivePlayer ? ` with ${decisivePlayer.name} on the bench` : ""}.`
              : data.matchupInsight}
          </h1>
          <p>
            {selfInflictedManager
              ? `The best valid lineup would have scored ${
                  selfInflictedHome
                    ? homePerformance?.score &&
                      (
                        homePerformance.score +
                        (homePerformance.pointsLeftOnBench ?? 0)
                      ).toFixed(2)
                    : awayPerformance?.score &&
                      (
                        awayPerformance.score +
                        (awayPerformance.pointsLeftOnBench ?? 0)
                      ).toFixed(2)
                }, enough to change the result.`
              : "The largest position-group scoring difference in this matchup."}
          </p>
        </section>
      )}

      <section className="matchup-lineups">
        <header>
          <h2>Lineups</h2>
          <div role="group" aria-label="Lineup view">
            <button
              type="button"
              aria-pressed={!bestPossible}
              onClick={() => setBestPossible(false)}
            >
              As played
            </button>
            <button
              type="button"
              aria-pressed={bestPossible}
              onClick={() => setBestPossible(true)}
            >
              Best possible
            </button>
          </div>
        </header>
        <div className="matchup-lineup-heading">
          <strong>
            {homeName}
            {bestPossible && (
              <small>
                Best possible{" "}
                {getOptimalTotal(data.homeOptimalLineup).toFixed(2)}
              </small>
            )}
          </strong>
          <span>Pts</span>
          <span>Slot</span>
          <span>Pts</span>
          <strong>
            {awayName}
            {bestPossible && (
              <small>
                Best possible{" "}
                {getOptimalTotal(data.awayOptimalLineup).toFixed(2)}
              </small>
            )}
          </strong>
        </div>
        <LineupRows
          home={homeStarters}
          away={awayStarters}
          homeHighlightId={decisiveHomeId}
          awayHighlightId={decisiveAwayId}
        />
        <h3>Bench</h3>
        <LineupRows
          home={homeBench}
          away={awayBench}
          homeHighlightId={decisiveHomeId}
          awayHighlightId={decisiveAwayId}
          bench
        />
        <p>
          Orange marks the lineup decision with the largest impact on this
          result. Player names can support profile links in a future view.
        </p>
      </section>

      <section className="matchup-detail-metrics">
        <article>
          <span>Best possible lineups</span>
          <strong>
            {getOptimalTotal(data.homeOptimalLineup).toFixed(2)} vs{" "}
            {getOptimalTotal(data.awayOptimalLineup).toFixed(2)}
          </strong>
          <small>Optimal valid starters from each roster.</small>
        </article>
        <article>
          <span>Lineup efficiency</span>
          <strong>
            {homePerformance?.lineupEfficiency?.toFixed(1) ?? "—"}% vs{" "}
            {awayPerformance?.lineupEfficiency?.toFixed(1) ?? "—"}%
          </strong>
          <small>Points scored divided by best possible.</small>
        </article>
        <article>
          <span>All-play this week</span>
          <strong>
            {homePerformance ? formatRecord(homePerformance.allPlayRecord) : "—"} vs{" "}
            {awayPerformance ? formatRecord(awayPerformance.allPlayRecord) : "—"}
          </strong>
          <small>Record if each team played every league opponent.</small>
        </article>
      </section>
    </main>
  );
}

const getOptimalTotal = (lineup: OptimalLineupPlayer[]) =>
  lineup.reduce((total, player) => total + player.points, 0);

export default Matchup;
