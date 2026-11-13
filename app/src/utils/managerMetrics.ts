import type { Lineup, Team, Trade } from "../models/models";
import type { SeasonLoaderData } from "../routes/loader";
import { getOptimalLineup, type OptimalLineupPlayer } from "./metrics";
import { playerCanFillSlot } from "./metrics/seasonMetrics";

export const recordText = (record: { wins: number; losses: number; ties: number }) =>
  `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;
export const resultOf = (score: number, opponent: number) =>
  score > opponent ? "W" : score < opponent ? "L" : "T";
export const isStarter = (player: Lineup) =>
  !["BE", "IR", "ER"].includes(player.slot_position);

export function getManagers(seasons: SeasonLoaderData[]) {
  const managers = new Map<string, {
    id: string;
    name: string;
    entries: { season: SeasonLoaderData; team: Team }[];
  }>();
  for (const season of [...seasons].sort((a, b) => a.year - b.year)) {
    for (const team of season.teams) {
      for (const owner of team.owners) {
        const manager = managers.get(owner.id) ?? {
          id: owner.id, name: owner.name, entries: [],
        };
        manager.name = owner.name;
        manager.entries.push({ season, team });
        managers.set(owner.id, manager);
      }
    }
  }
  const latest = Math.max(...seasons.map(({ year }) => year));
  return [...managers.values()].map((manager) => {
    const record = { wins: 0, losses: 0, ties: 0 };
    let points = 0;
    let games = 0;
    const titleYears: number[] = [];
    const finishes: number[] = [];
    let playoffSeasons = 0;
    let luck = 0;
    let lineupActualPoints = 0;
    let lineupOptimalPoints = 0;
    for (const { season, team } of manager.entries) {
      const metrics = season.metrics.teams[team.team_id];
      if (metrics) {
        record.wins += metrics.record.wins;
        record.losses += metrics.record.losses;
        record.ties += metrics.record.ties;
        points += metrics.pointsFor;
        games += metrics.weeksPlayed;
        luck += metrics.luck;
        lineupActualPoints += metrics.lineupActualPoints;
        lineupOptimalPoints += metrics.lineupOptimalPoints;
      }
      if (season.bracket.champion !== null) {
        if (season.bracket.champion.team_id === team.team_id) titleYears.push(season.year);
        const finish = season.standings.find(({ team_id }) => team_id === team.team_id)?.final_standing;
        if (finish && finish > 0) finishes.push(finish);
      }
      if (season.bracket.rounds.some(({ games: bracketGames }) =>
        bracketGames.some((game) => game.tier === "WINNERS_BRACKET" &&
          (game.home_team_id === team.team_id || game.away_team_id === team.team_id)),
      )) playoffSeasons++;
    }
    return {
      ...manager, record, games, titles: titleYears.length, titleYears, playoffSeasons, luck,
      lineupEfficiency: lineupOptimalPoints > 0 ? lineupActualPoints / lineupOptimalPoints * 100 : null,
      active: manager.entries.some(({ season }) => season.year === latest),
      winRate: games ? (record.wins + record.ties / 2) / games : null,
      pointsPerGame: games ? points / games : null,
      averageFinish: finishes.length ? finishes.reduce((a, b) => a + b, 0) / finishes.length : null,
      completedSeasons: finishes.length,
    };
  }).sort((a, b) =>
    (b.winRate ?? -1) - (a.winRate ?? -1) || b.games - a.games || a.name.localeCompare(b.name),
  );
}

export type Manager = ReturnType<typeof getManagers>[number];

export function getManagerGames(season: SeasonLoaderData, teamId: number) {
  return season.matchups.filter(({ status }) => status === "final")
    .flatMap(({ week, matchups }) => matchups.flatMap((game) => {
      if (game.home_score === null || game.away_score === null) return [];
      if (!season.teams.some(({ team_id }) => team_id === game.home_team_id) ||
          !season.teams.some(({ team_id }) => team_id === game.away_team_id)) return [];
      const home = game.home_team_id === teamId;
      if (!home && game.away_team_id !== teamId) return [];
      return [{
        week,
        opponentId: home ? game.away_team_id : game.home_team_id,
        score: home ? game.home_score : game.away_score,
        opponentScore: home ? game.away_score : game.home_score,
        result: resultOf(home ? game.home_score : game.away_score, home ? game.away_score : game.home_score),
        playoff: week > season.settings.regular_season_length,
        path: `/seasons/${season.year}/weeks/${week}/matchups/${game.home_team_id}/${game.away_team_id}`,
      }];
    }));
}

export function getManagerRivals(entries: { season: SeasonLoaderData; team: Team }[], includePlayoffs = true) {
  const rivals = new Map<string, {
    id: string; name: string; wins: number; losses: number; ties: number;
    games: number; totalMargin: number; playoffGames: number; trades: number;
  }>();
  for (const { season, team } of entries) {
    for (const game of getManagerGames(season, team.team_id)) {
      if (!includePlayoffs && game.playoff) continue;
      const opponent = season.teams.find(({ team_id }) => team_id === game.opponentId);
      for (const owner of opponent?.owners ?? []) {
        const rival = rivals.get(owner.id) ?? { ...owner, wins: 0, losses: 0, ties: 0, games: 0, totalMargin: 0, playoffGames: 0, trades: 0 };
        rival.games++;
        rival.totalMargin += Math.abs(game.score - game.opponentScore);
        if (game.playoff) rival.playoffGames++;
        if (game.result === "W") rival.wins++; else if (game.result === "L") rival.losses++; else rival.ties++;
        rivals.set(owner.id, rival);
      }

    }
    for (const trade of season.trades.filter(({ team_ids }) => team_ids.includes(team.team_id))) {
      for (const opponent of season.teams.filter(({ team_id }) => team_id !== team.team_id && trade.team_ids.includes(team_id))) {
        for (const owner of opponent.owners) {
          const rival = rivals.get(owner.id);
          if (rival) rival.trades++;
        }
      }
    }
  }
  return [...rivals.values()].map((rival) => ({ ...rival, averageMargin: rival.games ? rival.totalMargin / rival.games : null }));
}

export function getRivalryMeetings(entries: { season: SeasonLoaderData; team: Team }[], opponentId: string, includePlayoffs = true) {
  return entries.flatMap(({ season, team }) => getManagerGames(season, team.team_id)
    .filter((game) => (includePlayoffs || !game.playoff) &&
      season.teams.find(({ team_id }) => team_id === game.opponentId)?.owners.some(({ id }) => id === opponentId))
    .map((game) => ({ ...game, year: season.year })))
    .sort((a, b) => b.year - a.year || b.week - a.week);
}

export function getTradeReceipts(season: SeasonLoaderData, trade: Trade) {
  return trade.team_ids.map((teamId) => {
    const players = trade.items.filter(({ to_team_id }) => to_team_id === teamId);
    let points = 0;
    let covered = 0;
    const games = getManagerGames(season, teamId).filter(({ week, playoff }) => week > trade.week && !playoff);
    for (const game of games) {
      const box = season.box_scores.find((box) => box.week === game.week &&
        (box.home_team_id === teamId || box.away_team_id === teamId));
      if (box?.status !== "final") continue;
      const lineup = box ? box.home_team_id === teamId ? box.home_lineup : box.away_lineup : [];
      if (!lineup.length) continue;
      covered++;
      points += lineup.filter((player) => isStarter(player) && players.some(({ player_id }) => player_id === player.player_id))
        .reduce((sum, player) => sum + player.points, 0);
    }
    return { teamId, points: covered ? points : null, covered, weeks: games.length };
  });
}

export function getDraftUsage(season: SeasonLoaderData) {
  return season.draft.picks.map((pick) => {
    let starts = 0;
    let starterPoints = 0;
    let observedPoints = 0;
    let observedWeeks = 0;
    let position: string | null = null;
    for (const game of season.box_scores.filter((box) =>
      box.status === "final" && !box.is_playoff &&
      box.week <= season.settings.regular_season_length,
    )) {
      const player = [...game.home_lineup, ...game.away_lineup].find(
        ({ player_id }) => player_id === pick.player_id,
      );
      if (player) {
        observedPoints += player.points;
        observedWeeks++;
        position = player.position;
      }
      const own = game.home_team_id === pick.team_id ? game.home_lineup
        : game.away_team_id === pick.team_id ? game.away_lineup : [];
      const starter = own.find((p) => p.player_id === pick.player_id && isStarter(p));
      if (starter) { starts++; starterPoints += starter.points; }
    }
    return { ...pick, position, starts, starterPoints, observedPoints, observedWeeks };
  });
}

export function getTradeScenario(season: SeasonLoaderData, trade: Trade, teamId: number) {
  if (!trade.team_ids.includes(teamId)) throw new Error("Selected team did not participate in this trade.");
  const outgoing = trade.items.filter(({ from_team_id }) => from_team_id === teamId);
  const incoming = new Set(trade.items.filter(({ to_team_id }) => to_team_id === teamId).map(({ player_id }) => player_id));
  const outgoingIds = new Set(outgoing.map(({ player_id }) => player_id));
  const laterTrades = season.trades.filter((other) =>
    other.id !== trade.id && other.date > trade.date &&
    other.items.some(({ player_id }) => incoming.has(player_id) || outgoingIds.has(player_id)),
  );
  const weeks = getManagerGames(season, teamId).filter(
    ({ week, playoff }) => week > trade.week && !playoff,
  ).map((game) => {
    const box = season.box_scores.find((item) =>
      item.week === game.week && (item.home_team_id === teamId || item.away_team_id === teamId),
    );
    const issues: string[] = [];
    if (!box || box.status !== "final") {
      return {
        ...game, actualOptimal: null, keptOptimal: null, collision: [],
        actualLineup: [], keptRoster: [], keptLineup: [],
        issues: ["Finalized lineup snapshot unavailable."],
      };
    }
    const actual = box.home_team_id === teamId ? box.home_lineup : box.away_lineup;
    const opponent = box.home_team_id === teamId ? box.away_lineup : box.home_lineup;
    const weekPlayers = season.box_scores.filter(({ week }) => week === game.week)
      .flatMap((item) => [...item.home_lineup, ...item.away_lineup]);
    const pool = actual.filter(({ player_id }) => !incoming.has(player_id) && !outgoingIds.has(player_id));
    for (const item of outgoing) {
      const current = weekPlayers.find(({ player_id }) => player_id === item.player_id);
      const metadata = current ?? season.box_scores.flatMap(
        (item) => [...item.home_lineup, ...item.away_lineup],
      ).find(({ player_id }) => player_id === item.player_id);
      const points = current?.points ?? season.traded_player_points.players[String(item.player_id)]?.weekly_points[String(game.week)];
      if (!metadata || points === undefined || !Number.isFinite(points)) {
        issues.push(`${item.player_name}: weekly score or position unavailable.`);
        continue;
      }
      pool.push({
        ...metadata, points,
        slot_position: current && ["IR", "ER"].includes(current.slot_position) ? current.slot_position : "BE",
      });
    }
    const base = getOptimalLineup(actual, season.settings);
    const kept = getOptimalLineup(pool, season.settings);
    const requiredSlots = Object.entries(season.settings.roster_slots).filter(
      ([slot, count]) => count > 0 && !["BE", "IR", "ER", "D/ST"].includes(slot),
    );
    for (const [slot, count] of requiredSlots) {
      if (base.players.filter(({ selectedSlot }) => selectedSlot === slot).length < count ||
          kept.players.filter(({ selectedSlot }) => selectedSlot === slot).length < count) {
        issues.push(`Incomplete eligible ${slot} coverage.`);
      }
    }
    return {
      ...game, issues,
      actualLineup: actual,
      keptRoster: pool,
      keptLineup: kept.players,
      collision: outgoing.filter(({ player_id }) => opponent.some((p) => p.player_id === player_id)).map(({ player_name }) => player_name),
      actualOptimal: issues.length ? null : base.points,
      keptOptimal: issues.length ? null : kept.points,
    };
  });
  const record = (mode: "score" | "actualOptimal" | "keptOptimal") => {
    const totals = { wins: 0, losses: 0, ties: 0 };
    for (const game of weeks) {
      if (game.actualOptimal === null || game.keptOptimal === null) continue;
      const points = game[mode];
      if (points === null) continue;
      const result = resultOf(points, game.opponentScore);
      if (result === "W") totals.wins++;
      else if (result === "L") totals.losses++;
      else totals.ties++;
    }
    return totals;
  };
  return {
    weeks, laterTrades,
    covered: weeks.filter(({ keptOptimal }) => keptOptimal !== null).length,
    actualRecord: record("score"),
    actualOptimalRecord: record("actualOptimal"),
    keptRecord: record("keptOptimal"),
  };
}

export function getScenarioSlots(season: SeasonLoaderData) {
  return Object.entries(season.settings.roster_slots).flatMap(([slot, count]) =>
    ["BE", "IR", "ER"].includes(slot) ? [] : Array.from({ length: count }, () => slot),
  );
}

export function lineupSelections(slots: string[], players: OptimalLineupPlayer[]) {
  const remaining = [...players];
  return slots.map((slot) => {
    const index = remaining.findIndex(({ selectedSlot }) => selectedSlot === slot);
    return index < 0 ? null : remaining.splice(index, 1)[0].player_id;
  });
}

export function getOriginalPlayerUsage(season: SeasonLoaderData, trade: Trade, teamId: number) {
  return trade.items.filter(({ from_team_id }) => from_team_id === teamId).map((item) => {
    let rosterWeeks = 0;
    let starts = 0;
    let points = 0;
    for (const box of season.box_scores.filter((game) =>
      game.status === "final" && !game.is_playoff && game.week < trade.week,
    )) {
      const roster = box.home_team_id === teamId ? box.home_lineup
        : box.away_team_id === teamId ? box.away_lineup : [];
      const player = roster.find(({ player_id }) => player_id === item.player_id);
      if (!player) continue;
      rosterWeeks++;
      if (isStarter(player)) { starts++; points += player.points; }
    }
    return { ...item, rosterWeeks, starts, starterPoints: points };
  });
}

export function suggestedSelections(
  season: SeasonLoaderData,
  trade: Trade,
  teamId: number,
  actual: Lineup[],
  pool: Lineup[],
) {
  const slots = getScenarioSlots(season);
  const remaining = actual.filter(isStarter);
  const used = new Set<number>();
  const originals = getOriginalPlayerUsage(season, trade, teamId).sort(
    (a, b) => b.starts - a.starts || a.player_id - b.player_id,
  );
  const eligible = (player: Lineup, slot: string) =>
    !used.has(player.player_id) && !["IR", "ER"].includes(player.slot_position) &&
    playerCanFillSlot(player.position, slot);
  const selections = slots.map((slot) => {
    const index = remaining.findIndex(({ slot_position }) => slot_position === slot);
    const starter = index < 0 ? undefined : remaining.splice(index, 1)[0];
    const retained = starter && pool.find(({ player_id }) => player_id === starter.player_id);
    if (retained && eligible(retained, slot)) {
      used.add(retained.player_id);
      return retained.player_id;
    }
    return null;
  });
  return selections.map((selected, index) => {
    if (selected !== null) return selected;
    for (const original of originals) {
      const replacement = pool.find(({ player_id }) => player_id === original.player_id);
      if (replacement && eligible(replacement, slots[index])) {
        used.add(replacement.player_id);
        return replacement.player_id;
      }
    }
    return null;
  });
}

export function validateScenarioSelections(encoded: string, slots: string[], pool: Lineup[]) {
  const tokens = encoded.split(",");
  const issues: string[] = [];
  if (tokens.length !== slots.length) issues.push("The shared lineup does not match this season's roster slots.");
  const used = new Set<number>();
  const selections = tokens.map((token, index) => {
    if (token === "_") return null;
    if (!/^-?\d+$/.test(token)) {
      issues.push("The shared lineup contains an invalid player ID.");
      return null;
    }
    const id = Number(token);
    if (!Number.isSafeInteger(id)) issues.push("The shared lineup contains an invalid player ID.");
    const player = pool.find(({ player_id }) => player_id === id);
    if (!player || ["IR", "ER"].includes(player.slot_position) ||
        !playerCanFillSlot(player.position, slots[index]) || used.has(id)) {
      issues.push("A selected player is unavailable, ineligible, or assigned more than once.");
    }
    used.add(id);
    return id;
  });
  return { selections, issues };
}

export function getScenarioMove(
  playerId: number,
  destination: number | null,
  selections: (number | null)[],
  slots: string[],
  pool: Lineup[],
) {
  const current = validateScenarioSelections(
    selections.map((id) => id === null ? "_" : String(id)).join(","), slots, pool,
  );
  if (current.issues.length) return current;
  const player = pool.find(({ player_id }) => player_id === playerId);
  const source = selections.indexOf(playerId);
  if (!player || ["IR", "ER"].includes(player.slot_position)) {
    return { selections, issues: ["This player is unavailable for the starting lineup."] };
  }
  if (destination === null) {
    if (source < 0) return { selections, issues: ["This player is already on the bench."] };
    return { selections: selections.map((id) => id === playerId ? null : id), issues: [] };
  }
  if (!Number.isInteger(destination) || destination < 0 || destination >= slots.length) {
    return { selections, issues: ["This roster spot is unavailable."] };
  }
  if (!playerCanFillSlot(player.position, slots[destination])) {
    return { selections, issues: [`${player.position} cannot play ${slots[destination]}.`] };
  }
  const displaced = pool.find(({ player_id }) => player_id === selections[destination]);
  if (source >= 0 && displaced && !playerCanFillSlot(displaced.position, slots[source])) {
    return { selections, issues: [`${displaced.name} cannot swap into ${slots[source]}.`] };
  }
  const next = [...selections];
  if (source >= 0) next[source] = selections[destination];
  next[destination] = playerId;
  return validateScenarioSelections(next.map((id) => id === null ? "_" : String(id)).join(","), slots, pool);
}
