import { describe, expect, it } from "vitest";
import type { Lineup, Matchup, Settings, Team } from "../src/models/models";
import { calculateSeasonMatchupWeeks, calculateWeekMetrics, getOptimalLineup } from "../src/utils/metrics";
import { getLineupChanges } from "../src/utils/lineupChanges";
import { getPlayoffRounds } from "../src/utils/playoffRounds";
import { loadSeason } from "./fixtures";

describe("provisional weekly metrics", () => {
  const season = loadSeason(2026, { "5": "in_progress", "6": "not_started" });

  it("shows current leads, not completed wins or losses", () => {
    const metrics = calculateWeekMetrics(season, 5, [100, 150, 200]);
    expect(metrics.status).toBe("in_progress");
    expect(metrics.performances.length).toBeGreaterThan(0);
    expect(metrics.performances.every(({ result }) => ["Leading", "Trailing", "Tied"].includes(result))).toBe(true);
    expect(metrics.cards.some(({ label }) =>
      ["Schedule robbery", "Brutal beat", "Self-inflicted loss", "Star performance wasted"].includes(label),
    )).toBe(false);
    expect(metrics.matchupInsights.every(({ text }) => text.includes("currently has"))).toBe(true);
  });

  it("preserves final W/L/T results and outcome awards", () => {
    const finalSeason = {
      ...season,
      matchups: season.matchups.map((week): Matchup => ({ ...week, status: "final" })),
    };
    const metrics = calculateWeekMetrics(finalSeason, 5);
    expect(metrics.performances.every(({ result }) => ["W", "L", "T"].includes(result))).toBe(true);
    expect(metrics.cards.some(({ label }) => label === "Self-inflicted loss")).toBe(true);
    expect(metrics.performances.every(({ lineupEfficiency, pointsLeftOnBench }) =>
      lineupEfficiency !== null && pointsLeftOnBench !== null,
    )).toBe(true);
  });

  it("withholds hindsight lineup metrics and awards until final", () => {
    const metrics = calculateWeekMetrics(season, 5);
    expect(metrics.performances.length).toBeGreaterThan(0);
    expect(metrics.performances.every(({ lineupEfficiency, pointsLeftOnBench }) =>
      lineupEfficiency === null && pointsLeftOnBench === null,
    )).toBe(true);
    expect(metrics.cards.some(({ label }) =>
      label === "Biggest lineup swing" || label === "Self-inflicted loss",
    )).toBe(false);
  });

  it("does not create loss narratives for tied games", () => {
    const tiedSeason = {
      ...season,
      matchups: season.matchups.map((week): Matchup => ({
        ...week, status: "final",
        matchups: week.matchups.map((game) => ({ ...game, home_score: 100, away_score: 100 })),
      })),
      box_scores: season.box_scores.map((game) => ({ ...game, home_score: 100, away_score: 100 })),
    };
    const metrics = calculateWeekMetrics(tiedSeason, 5);
    expect(metrics.performances.every(({ result }) => result === "T")).toBe(true);
    expect(metrics.cards.some(({ label }) =>
      label === "Star performance wasted" || label === "Self-inflicted loss" || label === "Schedule robbery",
    )).toBe(false);
  });

  it("hides metrics for not-started weeks, including zero scores", () => {
    expect(calculateWeekMetrics(season, 6)).toEqual({
      status: "not_started", performances: [], cards: [], matchupInsights: [],
    });
  });

  it("does not claim a historical benchmark without historical data", () => {
    expect(calculateWeekMetrics(season, 4).cards.some(({ label }) => label === "Historic heat")).toBe(false);
  });

  it("does not compare bye teams with a fictitious opponent", () => {
    const playoffSeason = loadSeason(2025);
    const metrics = calculateWeekMetrics(playoffSeason, 15);
    expect(metrics.cards.every(({ note }) => !note.includes("Unknown manager"))).toBe(true);
    expect(metrics.matchupInsights.every(({ awayTeamId }) => awayTeamId !== null)).toBe(true);
  });
});

describe("schedule robbery selection", () => {
  it("chooses Joey rather than Cesar as the lowest-scoring Week 5 winner", () => {
    const season = loadSeason(2026, { "5": "final" });
    const metrics = calculateWeekMetrics(season, 5);
    const winners = metrics.performances.filter(({ result }) => result === "W");
    const robbery = metrics.cards.find(({ label }) => label === "Schedule robbery");

    expect(winners.some(({ teamId, rank }) => teamId === 7 && rank === 8)).toBe(true);
    expect(winners.find(({ teamId }) => teamId === 10)).toMatchObject({
      score: 112.5, rank: 11, result: "W",
    });
    expect(robbery).toMatchObject({
      value: "Joey",
      note: "Won while ranking 11 of 12 in points",
    });
    expect(metrics.performances.map(({ rank }) => rank)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
  });

  it("does not award schedule robbery when all winners score in the top half", () => {
    const season = loadSeason(2026, { "5": "final" });
    const metrics = calculateWeekMetrics({
      ...season,
      box_scores: [],
      matchups: [{
        week: 5,
        status: "final",
        matchups: [
          { home_team_id: 1, away_team_id: 2, home_score: 200, away_score: 90 },
          { home_team_id: 3, away_team_id: 4, home_score: 190, away_score: 100 },
        ],
      }],
    }, 5);

    expect(metrics.cards.some(({ label }) => label === "Schedule robbery")).toBe(false);
    expect(metrics.performances.filter(({ result }) => result === "W").map(({ rank }) => rank)).toEqual([1, 2]);
  });
});

describe("hindsight substitutions", () => {
  const player = (id: number, slot: string, points: number): Lineup => ({
    player_id: id, name: `Player ${id}`, slot_position: slot,
    points, position: "RB", pro_team: "NYG",
  });
  const settings: Settings = {
    team_count: 2, regular_season_length: 1, playoff_weeks: [],
    current_week: 1, week_status: { "1": "final" }, roster_slots: { RB: 2 },
  };

  it("identifies every added and displaced player, not just the highest scorer", () => {
    const lineup = [
      player(1, "RB", 1), player(2, "RB", 2),
      player(3, "BE", 10), player(4, "BE", 20), player(5, "IR", 100),
    ];
    const optimal = getOptimalLineup(lineup, settings).players;
    const changes = getLineupChanges(lineup, optimal);
    expect([...changes.addedIds].sort()).toEqual([3, 4]);
    expect([...changes.removedIds].sort()).toEqual([1, 2]);
    expect(changes.addedIds.has(5)).toBe(false);
  });

  it("does not mark a retained starter moving into a flex slot as a substitution", () => {
    const lineup = [player(1, "RB", 20), player(2, "RB", 10)];
    const changes = getLineupChanges(lineup, lineup.map((item) => ({ ...item, selectedSlot: "RB/WR/TE" })));
    expect(changes.added).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it.each([
    { points: -3, selected: false },
    { points: 0, selected: false },
    { points: 3, selected: true },
  ])("$points-point defense selected: $selected", ({ points, selected }) => {
    const defense = {
      ...player(2, "D/ST", points),
      position: "D/ST",
    };
    const result = getOptimalLineup(
      [player(1, "RB", 10), defense],
      { ...settings, roster_slots: { RB: 1, "D/ST": 1 } },
    );

    expect(result.players.some(({ player_id }) => player_id === defense.player_id)).toBe(selected);
    expect(result.points).toBe(10 + (selected ? points : 0));
  });

  it("treats Devon's unused Week 5 defense as an empty optimal slot", () => {
    const season = loadSeason(2026);
    const game = season.box_scores.find(
      ({ week, home_team_id, away_team_id }) =>
        week === 5 && (home_team_id === 2 || away_team_id === 2),
    );
    expect(game).toBeDefined();
    const lineup = game?.home_team_id === 2
      ? game.home_lineup
      : game?.away_lineup ?? [];
    const optimal = getOptimalLineup(lineup, season.settings);

    expect(optimal.players.some(({ position }) => position === "D/ST")).toBe(false);
  });
});

describe("historical playoff and record context", () => {
  it.each([2022, 2023])("renders only the two real playoff rounds in %s", (year) => {
    const season = loadSeason(year);
    expect(getPlayoffRounds(season.settings, season.bracket)).toEqual([
      { week: 15, label: "Semifinals" }, { week: 16, label: "Championship" },
    ]);
  });

  it("preserves three-round formats", () => {
    const season = loadSeason(2025);
    expect(getPlayoffRounds(season.settings, season.bracket)).toEqual([
      { week: 15, label: "Quarterfinals" }, { week: 16, label: "Semifinals" },
      { week: 17, label: "Championship" },
    ]);
  });

  it("adds final results only and freezes regular-season records during playoffs", () => {
    const teams: Team[] = [1, 2].map((id) => ({ team_id: id, team_name: String(id), owners: [] }));
    const matchups: Matchup[] = [
      { week: 1, status: "final", matchups: [{ home_team_id: 1, away_team_id: 2, home_score: 10, away_score: 0 }] },
      { week: 2, status: "in_progress", matchups: [{ home_team_id: 1, away_team_id: 2, home_score: 0, away_score: 10 }] },
      { week: 3, status: "final", matchups: [{ home_team_id: 1, away_team_id: 2, home_score: 0, away_score: 10 }] },
    ];
    const weeks = calculateSeasonMatchupWeeks(matchups, teams, 2);
    expect(weeks.map(({ recordsThroughWeek }) => recordsThroughWeek)).toEqual([1, 1, 1]);
    expect(weeks[2].records[1]).toEqual({ wins: 1, losses: 0, ties: 0 });
    expect(weeks[0].records[1]).toEqual({ wins: 1, losses: 0, ties: 0 });
  });
});
