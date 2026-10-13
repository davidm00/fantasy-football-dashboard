import { useMemo, useState } from "react";
import {
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useRouteError,
} from "react-router";
import type { Lineup } from "../models/models";
import {
  EMPTY_RECORD,
  formatRecord,
  getManagerName,
} from "../utils/homeViewUtils";
import type { OptimalLineupPlayer } from "../utils/metrics";
import { getLineupChanges } from "../utils/lineupChanges";
import type { MatchupDetailLoaderData } from "./loader";
import RouteErrorPage from "./RouteErrorPage";

type DisplayPlayer = Lineup & {
  displaySlot: string;
};

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
  substituted,
  removed,
  align,
  empty = false,
}: {
  player: Lineup | undefined;
  substituted: boolean;
  removed: boolean;
  align: "left" | "right";
  empty?: boolean;
}) {
  if (!player) {
    return empty ? (
      <span className={`matchup-lineup-player matchup-lineup-player-${align} matchup-lineup-empty`}>
        <strong>Empty</strong>
        <small>No player used</small>
      </span>
    ) : <span />;
  }

  return (
    <span className={`matchup-lineup-player matchup-lineup-player-${align}`}>
      <strong className={substituted ? "substituted" : undefined}>
        {player.name}
      </strong>
      <small>
        {player.position} {player.pro_team}
        {substituted && <em> · Subbed in</em>}
        {removed && <em> · Subbed out</em>}
      </small>
      {substituted && <i aria-label="Added to hindsight-optimal lineup" />}
    </span>
  );
}

function LineupRows({
  home,
  away,
  homeSubstitutionIds,
  awaySubstitutionIds,
  homeRemovedIds,
  awayRemovedIds,
  bench = false,
  slotOrder,
  showEmptySlots = false,
}: {
  home: (Lineup & { displaySlot?: string })[];
  away: (Lineup & { displaySlot?: string })[];
  homeSubstitutionIds?: ReadonlySet<number>;
  awaySubstitutionIds?: ReadonlySet<number>;
  homeRemovedIds?: ReadonlySet<number>;
  awayRemovedIds?: ReadonlySet<number>;
  bench?: boolean;
  slotOrder?: string[];
  showEmptySlots?: boolean;
}) {
  const rows = slotOrder
    ? (() => {
        const remainingHome = [...home];
        const remainingAway = [...away];
        const slotRows = slotOrder.map((slot) => {
          const takePlayer = (players: typeof home) => {
          const index = players.findIndex(
            ({ displaySlot }) => displaySlot === slot,
          );
          return index < 0 ? undefined : players.splice(index, 1)[0];
        };
          return {
            slot,
            homePlayer: takePlayer(remainingHome),
            awayPlayer: takePlayer(remainingAway),
          };
        });
        const remainingRows = Array.from(
          { length: Math.max(remainingHome.length, remainingAway.length) },
          (_, index) => ({
            slot:
              remainingHome[index]?.displaySlot ??
              remainingAway[index]?.displaySlot ??
              "—",
            homePlayer: remainingHome[index],
            awayPlayer: remainingAway[index],
          }),
        );
        return [...slotRows, ...remainingRows];
      })()
    : Array.from(
        { length: Math.max(home.length, away.length) },
        (_, index) => ({
          slot: "BE",
          homePlayer: home[index],
          awayPlayer: away[index],
        }),
      );

  return rows.map(
    ({ slot, homePlayer, awayPlayer }, index) => {
      return (
        <div className="matchup-lineup-row" key={`${slot}-${index}`}>
          <LineupPlayer
            player={homePlayer}
            substituted={
              homePlayer !== undefined &&
              (homeSubstitutionIds?.has(homePlayer.player_id) ?? false)
            }
            removed={
              homePlayer !== undefined &&
              (homeRemovedIds?.has(homePlayer.player_id) ?? false)
            }
            align="left"
            empty={showEmptySlots}
          />
          <strong
            className={
              homePlayer && homeSubstitutionIds?.has(homePlayer.player_id)
                ? "highlight" : undefined
            }
          >
            {homePlayer?.points.toFixed(2) ?? "—"}
          </strong>
          <span>{bench ? "BE" : slot}</span>
          <strong
            className={
              awayPlayer && awaySubstitutionIds?.has(awayPlayer.player_id)
                ? "highlight" : undefined
            }
          >
            {awayPlayer?.points.toFixed(2) ?? "—"}
          </strong>
          <LineupPlayer
            player={awayPlayer}
            substituted={
              awayPlayer !== undefined &&
              (awaySubstitutionIds?.has(awayPlayer.player_id) ?? false)
            }
            removed={
              awayPlayer !== undefined &&
              (awayRemovedIds?.has(awayPlayer.player_id) ?? false)
            }
            align="right"
            empty={showEmptySlots}
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
      retry={!missing}
    />
  );
}

function Matchup() {
  const data = useLoaderData() as MatchupDetailLoaderData;
  const [bestPossibleSelected, setBestPossible] = useState(false);
  const {
    season,
    week,
    matchup,
    boxScore,
    status,
    homePerformance,
    awayPerformance,
  } = data;
  const bestPossibleAvailable = status === "final";
  const bestPossible = bestPossibleAvailable && bestPossibleSelected;
  const home = season.teams.find(
    ({ team_id }) => team_id === matchup.home_team_id,
  );
  const away = season.teams.find(
    ({ team_id }) => team_id === matchup.away_team_id,
  );
  const homeName = getManagerName(home);
  const awayName = getManagerName(away);
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
  const homeChanges = getLineupChanges(boxScore.home_lineup, data.homeOptimalLineup);
  const awayChanges = getLineupChanges(boxScore.away_lineup, data.awayOptimalLineup);
  const homeOptimalTotal = getOptimalTotal(data.homeOptimalLineup);
  const awayOptimalTotal = getOptimalTotal(data.awayOptimalLineup);
  const selfInflictedHome =
    status === "final" &&
    boxScore.home_score < boxScore.away_score &&
    homeOptimalTotal > boxScore.away_score;
  const selfInflictedAway =
    status === "final" &&
    boxScore.away_score < boxScore.home_score &&
    awayOptimalTotal > boxScore.home_score;
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
          {status === "final" && (
            <strong>{margin === 0 ? "Tied" : `by ${margin.toFixed(2)}`}</strong>
          )}
        </div>
        <div>
          <small>{away?.team_name} · {formatRecord(data.records[matchup.away_team_id] ?? EMPTY_RECORD)}</small>
          <strong>{awayName}</strong>
          <b>{boxScore.away_score.toFixed(2)}</b>
          <span>{awayPerformance ? `${awayPerformance.rank} of ${season.settings.team_count} in points this week` : ""}</span>
        </div>
      </section>
      <p className="matchup-record-context">
        {data.recordsThroughWeek === 0
          ? "No finalized regular-season games yet."
          : week > season.settings.regular_season_length
            ? "Records are final regular-season records."
            : status === "final"
              ? `Regular-season records through Week ${data.recordsThroughWeek}.`
              : `Records entering Week ${week}, through finalized Week ${data.recordsThroughWeek}.`}
        {status !== "final" && " Scores are provisional."}
      </p>

      {(data.closestGame || selfInflictedManager || data.matchupInsight) && (
        <section className="matchup-story">
          <div>
            {data.closestGame && <span>Closest game of {season.year}</span>}
            {selfInflictedManager && <span>Hindsight lineup swing</span>}
          </div>
          <h1>
            {selfInflictedManager
              ? `${selfInflictedManager}'s optimal lineup could have changed the result.`
              : data.matchupInsight}
          </h1>
          <p>
            {selfInflictedManager
              ? `With the opponent's lineup held unchanged, the hindsight-optimal lineup would have scored ${(selfInflictedHome ? homeOptimalTotal : awayOptimalTotal).toFixed(2)}, enough to turn the loss into a win.`
              : `The largest position-group scoring difference in this matchup${status === "final" ? "." : " so far; provisional until final."}`}
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
              disabled={!bestPossibleAvailable}
              aria-describedby="matchup-lineup-explanation"
              onClick={() => setBestPossible(true)}
            >
              Best possible
            </button>
          </div>
        </header>
        <p id="matchup-lineup-explanation">
          {bestPossibleAvailable
            ? "Hindsight-optimal lineups use final scores, not pregame projections. They do not judge whether a decision was reasonable before kickoff."
            : "Best possible is available after the week is final. Actual lineups stay visible while games are pending or in progress, so players awaiting kickoff are not treated as missed opportunities."}
        </p>
        {bestPossible && (
          <div className="matchup-substitutions">
            {[
              { name: homeName, changes: homeChanges, total: homeOptimalTotal,
                score: boxScore.home_score, changesResult: selfInflictedHome },
              { name: awayName, changes: awayChanges, total: awayOptimalTotal,
                score: boxScore.away_score, changesResult: selfInflictedAway },
            ].map(({ name, changes, total, score, changesResult }, index) => (
              <article key={index}>
                <strong>{name}</strong>
                {changes.added.length || changes.removed.length ? (
                  <>
                    <p><b>In:</b> {changes.added.map(({ name }) => name).join(", ") || "No additions"}</p>
                    <p><b>Out:</b> {changes.removed.map(({ name }) => name).join(", ") || "No removals"}</p>
                    <span>Lineup gain: +{Math.max(0, total - score).toFixed(2)} points</span>
                    {changesResult && (
                      <span className="matchup-result-impact">
                        Together, these changes turn the final loss into a win
                        against the opponent's actual lineup.
                      </span>
                    )}
                  </>
                ) : (
                  <p>No substitutions needed.</p>
                )}
              </article>
            ))}
          </div>
        )}
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
          homeSubstitutionIds={bestPossible ? homeChanges.addedIds : undefined}
          awaySubstitutionIds={bestPossible ? awayChanges.addedIds : undefined}
          slotOrder={slotOrder}
          showEmptySlots={bestPossible}
        />
        <h3>Bench</h3>
        <LineupRows
          home={homeBench}
          away={awayBench}
          homeRemovedIds={bestPossible ? homeChanges.removedIds : undefined}
          awayRemovedIds={bestPossible ? awayChanges.removedIds : undefined}
          bench
        />
        <p>
          {bestPossible
            ? "Orange markers and underlined names identify every player added to the starting lineup. \"Subbed out\" identifies displaced starters. Teal labels mark a result-changing lineup as a whole."
            : bestPossibleAvailable
              ? "Select Best possible to see every hindsight substitution."
              : "Actual lineups are shown until the week is final."}
        </p>
      </section>

      <section className="matchup-detail-metrics">
        <article>
          <span>Best possible lineups</span>
          <strong>
            {bestPossibleAvailable
              ? `${homeOptimalTotal.toFixed(2)} vs ${awayOptimalTotal.toFixed(2)}`
              : "Available after the week is final"}
          </strong>
          <small>Hindsight-optimal valid starters, using final scores.</small>
        </article>
        <article>
          <span>Lineup efficiency</span>
          <strong>
            {bestPossibleAvailable
              ? `${formatEfficiency(homePerformance?.lineupEfficiency)} vs ${formatEfficiency(awayPerformance?.lineupEfficiency)}`
              : "Available after the week is final"}
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

const formatEfficiency = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;

export default Matchup;
