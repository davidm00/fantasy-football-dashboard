import { describe, expect, it } from "vitest";
import type { Matchup, Team } from "../src/models/models";
import { getManagerGames } from "../src/utils/managerMetrics";
import { getScheduleComparison, getScheduleStrength } from "../src/utils/scheduleMetrics";
import { loadSeason } from "./fixtures";

const source = loadSeason(2026);
const teams: Team[] = ["A", "B", "C", "D"].map((name, index) => ({
  team_id: index + 1, team_name: name, owners: [{ id: name, name }],
}));
function fixture(matchups: Matchup[] = [
  { week: 1, status: "final", matchups: [
    { home_team_id: 1, away_team_id: 2, home_score: 100, away_score: 80 },
    { home_team_id: 3, away_team_id: 4, home_score: 120, away_score: 90 },
  ] },
  { week: 2, status: "final", matchups: [
    { home_team_id: 1, away_team_id: 3, home_score: 90, away_score: 110 },
    { home_team_id: 2, away_team_id: 4, home_score: 95, away_score: 70 },
  ] },
]) {
  return { ...source, teams, matchups, settings: { ...source.settings, regular_season_length: 2 } };
}

describe("strength of schedule", () => {
  it("ranks every schedule easiest to hardest against the same league baseline", () => {
    const result = getScheduleStrength(fixture());
    expect(result.coveredWeeks).toEqual([1, 2]);
    expect(result.finalizedWeeks).toBe(2);
    expect(result.leagueAverage).toBe(94.375);
    expect(result.rows.map(row => [row.teamId, row.rank, row.averageOpponentPoints])).toEqual([
      [2, 1, 85], [3, 2, 90], [1, 3, 95], [4, 4, 107.5],
    ]);
    expect(result.rows.map(row => row.differenceFromLeagueAverage)).toEqual([-9.375, -4.375, 0.625, 13.125]);
  });

  it("gives equal averages the same rank and skips occupied places", () => {
    const season = fixture();
    season.matchups[0].matchups[1].away_score = 100;
    expect(getScheduleStrength(season).rows.map(row => [row.teamId, row.rank, row.averageOpponentPoints])).toEqual([
      [2, 1, 85], [1, 2, 95], [3, 2, 95], [4, 4, 107.5],
    ]);
  });

  it("excludes incomplete league weeks uniformly instead of counting missing scores as zero", () => {
    const season = fixture();
    season.matchups[1].matchups[1].home_score = null;
    const result = getScheduleStrength(season);
    expect(result.coveredWeeks).toEqual([1]);
    expect(result.rows.map(row => row.averageOpponentPoints)).toEqual([80, 90, 100, 120]);
  });

  it("excludes future, in-progress, playoff, bye and non-finite observations", () => {
    const season = fixture();
    season.matchups.push({ ...season.matchups[0], week: 3 },
      { ...season.matchups[0], week: 4, status: "in_progress" },
      { ...season.matchups[0], week: 5, status: "not_started" });
    expect(getScheduleStrength(season).coveredWeeks).toEqual([1, 2]);
    season.matchups[1].matchups.pop();
    expect(getScheduleStrength(season).coveredWeeks).toEqual([1]);
    season.matchups[0].matchups[0].home_score = Number.NaN;
    expect(getScheduleStrength(season)).toMatchObject({ rows: [], leagueAverage: null, coveredWeeks: [] });
  });

  it("does not fabricate a league average without complete weeks", () => {
    expect(getScheduleStrength(fixture([]))).toMatchObject({ rows: [], leagueAverage: null });
    expect(getScheduleStrength({ ...fixture(), teams: [] })).toMatchObject({ rows: [], leagueAverage: null });
  });

  it("keeps observed zero and negative scores and preserves source data", () => {
    const season = fixture();
    season.matchups[0].matchups[0].home_score = -5;
    season.matchups[0].matchups[0].away_score = 0;
    const before = JSON.stringify(season.matchups);
    const result = getScheduleStrength(season);
    expect(result.rows.find(row => row.teamId === 2)?.averageOpponentPoints).toBe(32.5);
    expect(result.rows.find(row => row.teamId === 1)?.averageOpponentPoints).toBe(55);
    expect(JSON.stringify(season.matchups)).toBe(before);
  });
});

describe("borrowed schedules", () => {
  it("preserves head-to-head meetings without comparing a manager to themself", () => {
    const result = getScheduleComparison(fixture(), 1, 2);
    expect(result).toMatchObject({
      available: true, coveredWeeks: 2, actualRecord: { wins: 1, losses: 1, ties: 0 },
      comparedRecord: { wins: 2, losses: 0, ties: 0 }, changedResults: 1, winDifference: 1,
    });
    if (!result.available) throw new Error(result.reason);
    expect(result.rows[0]).toMatchObject({ opponentId: 2, opponentScore: 80, headToHead: true, actual: "W", compared: "W" });
    expect(result.rows[1]).toMatchObject({ opponentId: 4, score: 90, opponentScore: 70, compared: "W" });
  });

  it("reproduces actual records for every own schedule in the committed snapshot", () => {
    for (const team of source.teams) {
      const result = getScheduleComparison(source, team.team_id, team.team_id);
      if (!result.available) throw new Error(result.reason);
      const actual = getManagerGames(source, team.team_id).filter(game => !game.playoff);
      expect(result.coveredWeeks).toBe(actual.length);
      expect(result.actualRecord).toEqual(result.comparedRecord);
      expect(result.changedResults).toBe(0);
    }
  });

  it("checks every current-season pair and preserves every head-to-head result", () => {
    for (const manager of source.teams) for (const donor of source.teams) {
      const result = getScheduleComparison(source, manager.team_id, donor.team_id);
      if (!result.available) throw new Error(result.reason);
      for (const row of result.rows) {
        if (!row.available) throw new Error(row.reason);
        expect(row.opponentId).not.toBe(manager.team_id);
        if (row.headToHead) expect(row.compared).toBe(row.actual);
      }
    }
    const throughWeekEleven = { ...source, matchups: source.matchups.filter(({ week }) => week <= 11) };
    expect(getScheduleComparison(throughWeekEleven, 2, 10)).toMatchObject({
      actualRecord: { wins: 9, losses: 2, ties: 0 }, comparedRecord: { wins: 7, losses: 4, ties: 0 },
    });
  });

  it("keeps ties and limits both record summaries to covered weeks", () => {
    const season = fixture();
    season.matchups[1].matchups[1].away_score = 90;
    expect(getScheduleComparison(season, 1, 2)).toMatchObject({ comparedRecord: { wins: 1, losses: 0, ties: 1 } });
    season.matchups[1].matchups[1].away_score = null;
    const result = getScheduleComparison(season, 1, 2);
    expect(result).toMatchObject({
      coveredWeeks: 1, actualRecord: { wins: 1, losses: 0, ties: 0 }, comparedRecord: { wins: 1, losses: 0, ties: 0 },
    });
    if (!result.available) throw new Error(result.reason);
    expect(result.rows[1]).toMatchObject({ available: false });
  });

  it("reports unavailable selections and missing observations explicitly", () => {
    expect(getScheduleComparison(fixture(), 99, 1)).toMatchObject({ available: false, reason: expect.any(String) });
    const season = fixture();
    season.matchups[0].matchups[0].home_score = Number.NaN;
    const result = getScheduleComparison(season, 1, 2);
    if (!result.available) throw new Error(result.reason);
    expect(result.rows[0]).toMatchObject({ available: false, reason: expect.any(String) });
  });
});
