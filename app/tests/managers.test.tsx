import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { BoxScore, Lineup, Trade } from "../src/models/models";
import { getDraftUsage, getManagers, getManagerGames, getManagerRivals, getRivalryMeetings, getTradeReceipts, getTradeScenario, getScenarioMove, suggestedSelections, validateScenarioSelections } from "../src/utils/managerMetrics";
import RosterTable from "../src/components/shared/RosterTable";
import SelectField from "../src/components/shared/SelectField";
import { getAvailableWeeks, isSeasonInProgress } from "../src/utils/homeViewUtils";
import { compareTableValues } from "../src/hooks/useTableSort";
import { getDraftColumn, getDraftHeat, getFaabLedger } from "../src/utils/activityMetrics";
import Managers from "../src/routes/Managers";
import ManagerPage from "../src/routes/Manager";
import TradePage from "../src/routes/Trade";
import Rivalries from "../src/routes/Rivalries";
import TrendChart from "../src/components/shared/TrendChart";
import Season from "../src/routes/Season";
import type { SeasonLoaderData } from "../src/routes/loader";
import { loadSeason, renderRoute } from "./fixtures";

const player = (id: number, points: number, slot = "RB"): Lineup => ({
  player_id: id, name: `Player ${id}`, position: "RB", pro_team: "TEST", slot_position: slot, points,
});

it("offers all-time profile scope, preserving it across section links without unrelated back arrows", () => {
  const markup = renderRoute(ManagerPage, { seasons: [loadSeason(2025), loadSeason(2026)], managerId: "m02" }, "/managers/m02?season=all");
  expect(markup).toContain("All-time regular-season record");
  expect(markup).toContain("All-time finalized games");
  expect(markup).toContain("?season=all&amp;tab=trades");
  expect(markup).toContain("All time");
  expect(markup).not.toContain("Other manager profiles");
  expect(markup).toContain("2025 Week");
  expect(markup).toContain("2026 Week");
});

it("includes all available seasons in all-time draft and moves views", () => {
  const data = { seasons: [loadSeason(2025), loadSeason(2026)], managerId: "m02" };
  for (const tab of ["draft", "moves", "trades"]) {
    const markup = renderRoute(ManagerPage, data, `/managers/m02?season=all&tab=${tab}`);
    expect(markup).toContain(`All-time ${tab}`);
    expect(markup).toContain("2025");
    expect(markup).toContain("2026");
    expect(markup.match(new RegExp(`>All-time ${tab}</h2>`, "g"))).toHaveLength(1);
    if (tab === "draft") {
      expect(markup.match(/How draft production is counted/g)).toHaveLength(1);
      expect(markup.match(/>Keepers only<\/label>/g)).toHaveLength(1);
      expect(markup).toContain("/seasons/2025?tab=draft");
      expect(markup).toContain("/seasons/2026?tab=draft");
    } else {
      expect(markup.match(/Only executed moves and recorded trades/g)).toHaveLength(1);
      expect(markup.match(/class="control-label">Week<\/span>/g)).toHaveLength(1);
    }
  }
});
const trade: Trade = {
  id: "test-trade", week: 1, date: 100, source: "espn", team_ids: [1, 2],
  items: [
    { player_id: 1, player_name: "Original", from_team_id: 1, to_team_id: 2 },
    { player_id: 2, player_name: "Received", from_team_id: 2, to_team_id: 1 },
  ],
};
function scenarioSeason(): SeasonLoaderData {
  const season = loadSeason(2026);
  const box: BoxScore = {
    week: 2, status: "final", is_playoff: false,
    home_team_id: 1, away_team_id: 2, home_score: 10, away_score: 15,
    home_lineup: [player(2, 10), player(3, 12, "BE")],
    away_lineup: [player(1, 20), player(4, 15)],
  };
  return {
    ...season, trades: [trade],
    settings: { ...season.settings, roster_slots: { RB: 1 } },
    box_scores: [box],
    matchups: [{ week: 2, status: "final" as const, matchups: [{
      home_team_id: 1, away_team_id: 2, home_score: 10, away_score: 15,
    }] }],
    traded_player_points: { players: {} },
  };
}

describe("mock-inspired receipts and rivalries", () => {
  it("attributes opponent records by season owner and credits co-managers equally", () => {
    const source = scenarioSeason();
    const team = source.teams.find(({ team_id }) => team_id === 1)!;
    const opponent = source.teams.find(({ team_id }) => team_id === 2)!;
    const first = { ...source, teams: [team, { ...opponent, owners: [{ id: "old", name: "Old" }, { id: "co", name: "Co" }] }] };
    const second = { ...source, year: 2027, teams: [team, { ...opponent, owners: [{ id: "new", name: "New" }] }] };
    const rivals = getManagerRivals([{ season: first, team }, { season: second, team }]);
    expect(rivals.map(({ id }) => id).sort()).toEqual(["co", "new", "old"]);
    for (const rival of rivals) expect(rival).toMatchObject({ losses: 1, wins: 0, games: 1, averageMargin: 5, trades: 1 });
  });

  it("uses actual received-player starts, distinguishing bench zero from missing coverage", () => {
    const source = scenarioSeason();
    expect(getTradeReceipts(source, trade)).toEqual([
      { teamId: 1, points: 10, covered: 1, weeks: 1 },
      { teamId: 2, points: 20, covered: 1, weeks: 1 },
    ]);
    const benched = { ...source, box_scores: [{ ...source.box_scores[0], home_lineup: [player(2, 10, "BE")] }] };
    expect(getTradeReceipts(benched, trade)[0]).toMatchObject({ points: 0, covered: 1 });
    expect(getTradeReceipts({ ...source, box_scores: [] }, trade)[0]).toMatchObject({ points: null, covered: 0, weeks: 1 });
    expect(getTradeReceipts(source, { ...trade, week: 2 })[0]).toMatchObject({ points: null, weeks: 0 });
  });

  it("never guesses FAAB budgets or counts failed bids, and exposes overspend", () => {
    const source = loadSeason(2026);
    const move = { ...source.transactions[0], team_id: 1, status: "EXECUTED", bid_amount: 10 };
    const season = { ...source, settings: { ...source.settings, waiver_type: "faab", faab_budget: 5 },
      transactions: [move, { ...move, status: "FAILED_BID", bid_amount: 40 }] };
    expect(getFaabLedger([{ season, teamId: 1 }])[0]).toMatchObject({ spent: 10, budget: 5, remaining: -5 });
    const unknown = { ...season, settings: { ...season.settings, faab_budget: undefined } };
    expect(getFaabLedger([{ season: unknown, teamId: 1 }])[0]).toMatchObject({ spent: 10, budget: null, remaining: null });
    const older = { ...season, year: 2025, settings: { ...season.settings, faab_budget: 100 } };
    expect(getFaabLedger([{ season: older, teamId: 1 }, { season, teamId: 1 }]).map(({ remaining }) => remaining)).toEqual([90, -5]);
  });

  it("renders the sortable linked grid and an exclusive manager list", () => {
    const seasons = [loadSeason(2022), loadSeason(2026)];
    const grid = renderRoute(Rivalries, seasons, "/managers/rivalries");
    expect(grid).not.toContain("Jericho");
    expect(grid).toContain("rivalry-grid-shell");
    expect(grid).toContain("manager=m01&amp;opponent=");
    expect(grid.match(/aria-sort="/g)).toHaveLength(getManagers(seasons).filter(({ active }) => active).length + 1);
    expect(grid).not.toContain('class="breadcrumbs"');
    expect(grid).toContain("Manager directory views");
    const former = renderRoute(Rivalries, seasons, "/managers/rivalries?managers=all");
    expect(former).toContain("Jericho");
    const current = renderRoute(Rivalries, seasons, "/managers/rivalries?season=2026");
    expect(current).not.toContain("Jericho");
    const list = renderRoute(Rivalries, seasons, "/managers/rivalries?layout=list&manager=m05&opponent=m02");
    expect(list).not.toContain("rivalry-grid-shell");
    expect(list).toContain("Jhajuan vs");
    expect(list).toContain("<strong>Devon</strong>");
    expect(list).not.toContain("<strong>vs Devon</strong>");
  });

  it("prefixes opponent names with vs only in manager-specific rivalry lists", () => {
    const data = { seasons: [loadSeason(2025), loadSeason(2026)], managerId: "m05" };
    for (const scope of ["all", "2026"]) {
      const markup = renderRoute(ManagerPage, data, `/managers/m05?tab=rivals&season=${scope}`);
      expect(markup).toContain("<strong>vs Devon</strong>");
      expect(markup).not.toContain("<strong>Devon</strong>");
    }
  });

  it("keeps single-season rivalry records and receipts regular-season-only", () => {
    const season = loadSeason(2025);
    const managers = getManagers([season]);
    const manager = managers.find((manager) => getManagerRivals(manager.entries).some(({ playoffGames }) => playoffGames > 0))!;
    const rival = getManagerRivals(manager.entries).find(({ playoffGames }) => playoffGames > 0)!;
    const career = getRivalryMeetings(manager.entries, rival.id);
    const regular = getRivalryMeetings(manager.entries, rival.id, false);
    expect(career.some(({ playoff }) => playoff)).toBe(true);
    expect(regular.every(({ playoff }) => !playoff)).toBe(true);
    expect(getManagerRivals(manager.entries, false).find(({ id }) => id === rival.id)?.playoffGames ?? 0).toBe(0);
    for (const Component of [Rivalries, ManagerPage]) {
      const data = Component === Rivalries ? [season] : { seasons: [season], managerId: manager.id };
      const path = Component === Rivalries ? `/managers/rivalries?season=2025&manager=${manager.id}&opponent=${rival.id}`
        : `/managers/${manager.id}?season=2025&tab=rivals&opponent=${rival.id}`;
      const markup = renderRoute(Component, data, path);
      expect(markup).toContain("regular season");
      expect(markup).not.toContain("Playoff meetings");
      expect(markup).not.toContain("A playoff grudge");
    }
  });

  it("shows career season history without a season picker and replaces annual single-season charts", () => {
    const data = { seasons: [loadSeason(2025), loadSeason(2026)], managerId: "m05" };
    const history = renderRoute(ManagerPage, data, "/managers/m05?tab=seasons&season=2026");
    expect(history).toContain("/seasons/2025");
    expect(history).toContain("/seasons/2026");
    expect(history).not.toContain('class="control-label">Season</span>');
    const overview = renderRoute(ManagerPage, data, "/managers/m05?season=2026");
    expect(overview).toContain("2026 weekly scoring rank");
    expect(overview).not.toContain("Points rank vs final finish");
    expect(overview).toContain("2026 all-play record");
  });

  it("uses a snapshot instead of drawing a one-point line and labels only the current unfinished season so far", () => {
    const markup = renderToString(<TrendChart label="One week" labels={["W5"]} series={[{ name: "Actual", values: [14] }]} />);
    expect(markup).toContain("14.00");
    expect(markup).toContain("W5");
    expect(markup).not.toContain("<svg");
    expect(isSeasonInProgress(loadSeason(2025))).toBe(false);
    expect(isSeasonInProgress(loadSeason(2026))).toBe(true);
  });

  it("keeps missing chart weeks as gaps and genuine zero as an observed point", () => {
    const markup = renderToString(<TrendChart label="Coverage" labels={["W1", "W2", "W3"]}
      series={[{ name: "Actual", values: [0, null, 20] }]} />);
    expect(markup.match(/<polyline/g)).toHaveLength(2);
    expect(markup).toContain("W2 unavailable");
    expect(markup).toContain('cy="102"');
    const rank = renderToString(<TrendChart label="Rank" labels={["2025", "2026"]} rankCount={12}
      series={[{ name: "Points rank", values: [1, 12] }]} />);
    expect(rank).toContain('cx="12" cy="14"');
    expect(rank).toContain('cx="308" cy="102"');
  });
});

describe("manager history", () => {
  it("excludes playoff byes from scoring histories and never links a null opponent", () => {
    for (const year of [2024, 2025]) {
      const season = loadSeason(year);
      const byes = season.bracket.rounds.flatMap(({ week, games }) =>
        games.filter(({ is_bye }) => is_bye).map((game) => ({ week, teamId: game.home_team_id })));
      expect(byes.length).toBeGreaterThan(0);
      for (const { week, teamId } of byes) {
        const games = getManagerGames(season, teamId!);
        expect(games.some((game) => game.week === week)).toBe(false);
        expect(games.every((game) => season.teams.some(({ team_id }) => team_id === game.opponentId))).toBe(true);
        const owner = season.teams.find(({ team_id }) => team_id === teamId)!.owners[0];
        const markup = renderRoute(ManagerPage, { seasons: [season], managerId: owner.id },
          `/managers/${owner.id}?season=all`);
        expect(markup).not.toContain("/null");
      }
    }
  });

  it("keeps managers with different owner IDs on the same franchise separate", () => {
    const managers = getManagers([loadSeason(2022), loadSeason(2024), loadSeason(2026)]);
    const former = managers.find(({ id }) => id === "m07");
    const current = managers.find(({ id }) => id === "m11");
    expect(former).toMatchObject({ name: "Jericho", active: false });
    expect(current).toMatchObject({ name: "Cesar", active: true });
    expect(former?.entries.map(({ season }) => season.year)).toEqual([2022]);
    expect(current?.entries.map(({ season }) => season.year)).toEqual([2024, 2026]);
  });

  it("does not credit unfinished season titles or final finishes", () => {
    const season = loadSeason(2026);
    const manager = getManagers([{ ...season, bracket: { ...season.bracket, champion: null } }])[0];
    expect(manager.titles).toBe(0);
    expect(manager.titleYears).toEqual([]);
    expect(manager.averageFinish).toBeNull();
  });

  it("shows championship-year crowns across profile tabs, linked to completed brackets", () => {
    const finished = loadSeason(2025);
    const current = loadSeason(2026);
    const champion = finished.teams.find(({ team_id }) => team_id === finished.bracket.champion?.team_id)!;
    const managerId = champion.owners[0].id;
    expect(getManagers([finished, current]).find(({ id }) => id === managerId)?.titleYears).toEqual([2025]);
    for (const tab of ["overview", "seasons", "rivals", "draft", "trades", "moves"]) {
      const markup = renderRoute(ManagerPage, { seasons: [finished, current], managerId },
        `/managers/${managerId}?tab=${tab}&season=2026`);
      expect(markup).toContain('aria-label="Championship seasons"');
      expect(markup).toContain('href="/seasons/2025?tab=bracket"');
      expect(markup).not.toContain('href="/seasons/2026?tab=bracket"');
    }
    const other = finished.teams.find(({ team_id }) => team_id !== champion.team_id)!;
    const markup = renderRoute(ManagerPage, { seasons: [finished, current], managerId: other.owners[0].id });
    expect(markup).not.toContain('class="manager-championships"');
  });

  it("attributes championship years to each season's owner, including co-managers", () => {
    const older = loadSeason(2022);
    const newer = loadSeason(2024);
    const seasons = [older, newer].map((season) => ({
      ...season, bracket: { ...season.bracket, champion: { ...season.bracket.champion!, team_id: 7 } },
    }));
    const managers = getManagers(seasons);
    expect(managers.find(({ id }) => id === "m07")?.titleYears).toEqual([2022]);
    expect(managers.find(({ id }) => id === "m11")?.titleYears).toEqual([2024]);
    const shared = { ...older, teams: older.teams.map((team) => team.team_id === 7
      ? { ...team, owners: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } : team),
      bracket: seasons[0].bracket };
    for (const id of ["a", "b"]) {
      expect(getManagers([shared]).find((manager) => manager.id === id)).toMatchObject({ titles: 1, titleYears: [2022] });
    }
  });

  it("credits co-managers with the same team results without splitting wins", () => {
    const season = loadSeason(2026);
    const team = season.teams[0];
    const managers = getManagers([{ ...season, teams: [{
      ...team, owners: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    }] }]);
    expect(managers).toHaveLength(2);
    expect(managers[0].record).toEqual(managers[1].record);
  });

  it("aggregates career efficiency by points, not by averaging season percentages", () => {
    const first = loadSeason(2025);
    const second = loadSeason(2026);
    const teamId = first.teams[0].team_id;
    first.metrics.teams[teamId] = { ...first.metrics.teams[teamId], lineupActualPoints: 100, lineupOptimalPoints: 200, luck: 1 };
    second.metrics.teams[teamId] = { ...second.metrics.teams[teamId], lineupActualPoints: 900, lineupOptimalPoints: 1000, luck: -0.5 };
    const manager = getManagers([first, second]).find(({ id }) => id === first.teams[0].owners[0].id)!;
    expect(manager.lineupEfficiency).toBeCloseTo(1000 / 1200 * 100);
    expect(manager.luck).toBe(0.5);
  });
});

describe("single-trade scenarios", () => {
  it("uses optimal lineups for both rosters, holds opponent score fixed and flags overlap", () => {
    const scenario = getTradeScenario(scenarioSeason(), trade, 1);
    expect(scenario.weeks[0]).toMatchObject({
      score: 10, opponentScore: 15, actualOptimal: 12, keptOptimal: 20,
      collision: ["Original"], issues: [],
    });
    expect(scenario.actualOptimalRecord).toEqual({ wins: 0, losses: 1, ties: 0 });
    expect(scenario.keptRecord).toEqual({ wins: 1, losses: 0, ties: 0 });
  });

  it("does not turn unavailable restored-player scores into zero", () => {
    const season = scenarioSeason();
    season.box_scores[0].away_lineup = [player(4, 15)];
    const scenario = getTradeScenario(season, trade, 1);
    expect(scenario.covered).toBe(0);
    expect(scenario.weeks[0].keptOptimal).toBeNull();
    expect(scenario.weeks[0].issues[0]).toContain("unavailable");
  });

  it("accepts a recorded zero from the exported weekly points", () => {
    const season = scenarioSeason();
    season.box_scores.push({ ...season.box_scores[0], week: 1 });
    season.box_scores[0].away_lineup = [player(4, 15)];
    season.traded_player_points = {
      players: { "1": { player_name: "Original", weekly_points: { "2": 0 } } },
    };
    const scenario = getTradeScenario(season, trade, 1);
    expect(scenario.covered).toBe(1);
    expect(scenario.weeks[0].keptOptimal).toBe(12);
  });

  it("excludes the trade week, unfinished games and playoffs", () => {
    const season = scenarioSeason();
    season.matchups.push(
      { ...season.matchups[0], week: 1 },
      { ...season.matchups[0], week: 3, status: "in_progress" },
      { ...season.matchups[0], week: 15 },
    );
    expect(getTradeScenario(season, trade, 1).weeks.map(({ week }) => week)).toEqual([2]);
  });

  it("flags later trades rather than undoing them", () => {
    const season = scenarioSeason();
    season.trades.push({ ...trade, id: "later", date: 200, week: 3 });
    expect(getTradeScenario(season, trade, 1).laterTrades.map(({ id }) => id)).toEqual(["later"]);
  });

  it("excludes comparisons with incomplete required slots", () => {
    const season = scenarioSeason();
    season.settings.roster_slots = { RB: 3 };
    const scenario = getTradeScenario(season, trade, 1);
    expect(scenario.covered).toBe(0);
    expect(scenario.weeks[0].issues).toContain("Incomplete eligible RB coverage.");
  });

  it("repairs actual starters with the original eligible player rather than a higher-scoring bench player", () => {
    const season = scenarioSeason();
    const game = getTradeScenario(season, trade, 1).weeks[0];
    expect(suggestedSelections(season, trade, 1, game.actualLineup, game.keptRoster)).toEqual([1]);
  });

  it("preserves unaffected starters even when the restored original would score more", () => {
    const season = scenarioSeason();
    season.box_scores[0].home_lineup = [player(2, 10, "BE"), player(3, 12)];
    const game = getTradeScenario(season, trade, 1).weeks[0];
    expect(suggestedSelections(season, trade, 1, game.actualLineup, game.keptRoster)).toEqual([3]);
  });

  it("rejects unavailable, duplicate, ineligible and malformed shared lineups", () => {
    const pool = [player(1, 20), player(2, 10, "IR")];
    expect(validateScenarioSelections("1,1", ["RB", "RB"], pool).issues.length).toBeGreaterThan(0);
    expect(validateScenarioSelections("2", ["RB"], pool).issues.length).toBeGreaterThan(0);
    expect(validateScenarioSelections("1", ["QB"], pool).issues.length).toBeGreaterThan(0);
    expect(validateScenarioSelections("abc", ["RB"], pool).issues.length).toBeGreaterThan(0);
    expect(validateScenarioSelections("999", ["RB"], pool).issues.length).toBeGreaterThan(0);
    expect(validateScenarioSelections("_", ["RB"], pool)).toEqual({ selections: [null], issues: [] });
    expect(validateScenarioSelections("1", ["RB"], pool)).toEqual({ selections: [1], issues: [] });
  });

  it("sorts unavailable values last in both directions and sorts numbers numerically", () => {
    for (const direction of ["ascending", "descending"] as const) {
      expect(compareTableValues(null, 10, direction)).toBeGreaterThan(0);
      expect(compareTableValues(10, null, direction)).toBeLessThan(0);
      expect(compareTableValues(undefined, null, direction)).toBe(0);
    }
    expect(compareTableValues(2, 10, "ascending")).toBeLessThan(0);
    expect(compareTableValues(2, 10, "descending")).toBeGreaterThan(0);
  });

  it("provides sortable data headers and resets without a sort dropdown in table views", () => {
    const season = loadSeason(2026);
    const markup = renderRoute(Managers, [season], "/managers");
    expect(markup.match(/aria-sort=/g)).toHaveLength(8);
    expect(markup).toContain("Reset sort");
    expect(markup).not.toContain("Sort managers");
    const draft = renderRoute(Season, season, "/seasons/2026?tab=draft");
    expect(draft.match(/aria-sort=/g)).toHaveLength(7);
    expect(draft).not.toContain("Sort picks");
  });

  it("only offers weeks that have started, including the current in-progress week", () => {
    expect(getAvailableWeeks({ "0": "final", "1": "final", "2": "in_progress", "3": "not_started" })).toEqual([1, 2]);
    const season = loadSeason(2026);
    season.settings = { ...season.settings, week_status: { "1": "final", "2": "in_progress", "3": "not_started" } };
    const markup = renderRoute(ManagerPage, { seasons: [season], managerId: "m02" }, "/managers/m02?tab=moves");
    const start = markup.indexOf('role="listbox"', markup.indexOf(">Week</span>"));
    const weekList = markup.slice(start, markup.indexOf("</div></div>", start));
    expect(weekList).toContain("Week 1");
    expect(weekList).toContain("Week 2");
    expect(weekList).not.toContain('>Week 3<');
    const seasonView = renderRoute(Season, season);
    expect(seasonView).not.toContain('>W3<');
  });
});

describe("manager and activity views", () => {
  const season = loadSeason(2026);
  it("provides obvious profile links and a complete manager table", () => {
    const markup = renderRoute(Managers, [loadSeason(2022), season], "/managers");
    expect(markup).toContain('href="/managers/m02"');
    expect(markup).toContain("View profile");
    expect(markup).toContain("Former");
    expect(markup).toContain("scroll horizontally");
    expect(markup).not.toContain("Illustrative numbers");
  });

  describe("roster moves", () => {
    const pool = [
      player(1, 10), player(2, 20), { ...player(3, 30), position: "WR" },
      player(4, 5, "BE"), player(5, 0, "IR"),
    ];
    const slots = ["RB", "RB", "RB/WR/TE"];
    it("swaps eligible starters without dropping or duplicating either player", () => {
      expect(getScenarioMove(1, 1, [1, 2, 3], slots, pool)).toEqual({ selections: [2, 1, 3], issues: [] });
    });
    it("blocks a swap when the displaced flex player cannot fill the source slot", () => {
      const move = getScenarioMove(1, 2, [1, 2, 3], slots, pool);
      expect(move.selections).toEqual([1, 2, 3]);
      expect(move.issues).toEqual(["Player 3 cannot swap into RB."]);
    });
    it("replaces a starter with a bench player, and supports empty spots", () => {
      expect(getScenarioMove(4, 0, [1, 2, 3], slots, pool)).toEqual({ selections: [4, 2, 3], issues: [] });
      expect(getScenarioMove(4, 0, [null, 2, 3], slots, pool)).toEqual({ selections: [4, 2, 3], issues: [] });
    });
    it("allows leaving a spot empty without changing other selections", () => {
      expect(getScenarioMove(1, null, [1, 2, 3], slots, pool)).toEqual({ selections: [null, 2, 3], issues: [] });
      expect(getScenarioMove(4, null, [1, 2, 3], slots, pool).issues.length).toBeGreaterThan(0);
    });
    it("allows benching every starter, preserving an explicitly empty lineup", () => {
      let selections: (number | null)[] = [1, 2, 3];
      for (const id of [1, 2, 3]) {
        const result = getScenarioMove(id, null, selections, slots, pool);
        expect(result.issues).toEqual([]);
        selections = result.selections;
      }
      expect(selections).toEqual([null, null, null]);
      expect(validateScenarioSelections("_,_,_", slots, pool)).toEqual({ selections, issues: [] });
    });
    it("rejects reserves, unknown players, invalid destinations and corrupt starting selections", () => {
      for (const [id, destination] of [[5, 0], [999, 0], [3, 0], [1, -1], [1, 3], [1, 0.5]]) {
        expect(getScenarioMove(id, destination, [1, 2, 3], slots, pool).issues.length).toBeGreaterThan(0);
      }
      expect(getScenarioMove(1, 1, [1, 1, 3], slots, pool).issues.length).toBeGreaterThan(0);
    });
  });

  describe("shared roster and controls", () => {
    it("renders inline Here targets, cancellation and disabled invalid rows without a dialog", () => {
      const pool = [player(1, 10), player(2, 20), { ...player(3, 30), position: "WR" }, player(4, 5, "BE")];
      const slots = ["RB", "RB", "RB/WR/TE"];
      const markup = renderRoute(() => <RosterTable caption="Inline roster"
        starters={slots.map((slot, index) => ({ slot, player: pool[index] }))}
        bench={[{ slot: "BE", player: pool[3] }]} onMove={() => {}}
        move={{ player: pool[0], canMove: (destination) => !getScenarioMove(1, destination, [1, 2, 3], slots, pool).issues.length,
          onHere: () => {}, onCancel: () => {} }} />);
      expect(markup.match(/>Here<\/button>/g)).toHaveLength(3);
      expect(markup).toContain(">Cancel</button>");
      expect(markup).toContain('aria-disabled="true"');
      expect(markup).toContain("here to RB 2");
      expect(markup).toContain("here to bench");
      expect(markup).not.toContain("<dialog");
    });

    it("renders real slots and position metadata without editing read-only rosters", () => {
      const markup = renderRoute(() => <RosterTable caption="Actual roster"
        starters={[{ slot: "RB/WR/TE", player: player(1, 10) }, { slot: "D/ST" }]} />);
      expect(markup).toContain("FLEX");
      expect(markup).toContain("D/ST");
      expect(markup).toContain("RB · TEST");
      expect(markup).toContain("Empty");
      expect(markup).not.toContain('aria-label="Move ');
      expect(markup).toContain('aria-label="Reset roster sort"');
    });

    describe("draft heat map", () => {
      it("keeps snake-draft columns aligned across odd and even rounds", () => {
        expect(getDraftColumn(1, 1, 12)).toBe(1);
        expect(getDraftColumn(2, 12, 12)).toBe(1);
        expect(getDraftColumn(2, 1, 12)).toBe(12);
        expect(getDraftColumn(3, 1, 12)).toBe(1);
      });
      it("distinguishes unavailable scoring from a recorded zero and handles an all-zero board", () => {
        const pick = getDraftUsage(loadSeason(2026))[0];
        expect(getDraftHeat({ ...pick, observedWeeks: 0 }, 0, 100)).toBeNull();
        expect(getDraftHeat({ ...pick, observedWeeks: 1, starterPoints: 0 }, 0, 100)).toBe(0);
        expect(getDraftHeat({ ...pick, observedWeeks: 1, starterPoints: 0 }, 0, 0)).toBe(0);
        expect(getDraftHeat({ ...pick, observedWeeks: 1, starterPoints: 50 }, 0, 100)).toBe(0.5);
        expect(getDraftHeat({ ...pick, observedWeeks: 1, starterPoints: -10 }, -10, 100)).toBe(0);
      });
      it("renders every recorded pick only once, with a board/table toggle and mobile scroll region", () => {
        const season = loadSeason(2026);
        const markup = renderRoute(Season, season, "/seasons/2026?tab=draft&draftLayout=board");
        expect(markup).toContain('aria-label="Draft layout"');
        expect(markup).toContain('aria-label="Draft board, scroll horizontally and vertically"');
        expect(markup.match(/class="draft-pick(?: draft-pick-unavailable)?"/g)).toHaveLength(season.draft.picks.length);
        expect(markup).toContain("production, not a draft grade");
        expect(markup).not.toContain('class="activity-table"');
        const table = renderRoute(Season, season, "/seasons/2026?tab=draft");
        expect(table).toContain('class="activity-table"');
        expect(table).not.toContain('class="draft-board"');
      });
    });
    it("uses labelled comboboxes and exclusive, selected listbox options", () => {
      const markup = renderRoute(() => <SelectField label="Sort managers" value="name" onChange={() => {}}
        options={[{ value: "name", label: "Name" }, { value: "wins", label: "Wins" }]} />);
      expect(markup).toContain('role="combobox"');
      expect(markup).toContain('role="listbox"');
      expect(markup).toContain('popover="auto"');
      expect(markup).toContain('aria-selected="true"');
      expect(markup).not.toContain("<select");
    });
  });

  it("supports shared search and card layout parameters", () => {
    const markup = renderRoute(Managers, [season], "/managers?layout=cards&q=Devon");
    expect(markup).toContain("Devon");
    expect(markup).not.toContain('href="/managers/m01"');
    expect(markup).toContain("Clear search");
  });

  it("exposes all profile sections and real season selection", () => {
    const markup = renderRoute(ManagerPage, { seasons: [loadSeason(2025), season], managerId: "m02" }, "/managers/m02?season=2025");
    expect(markup).toContain('aria-label="Manager sections"');
    expect(markup).toContain("2025 regular-season record");
    expect(markup).toContain("Trade scenarios");
    expect(markup).toContain('href="/managers"');
  });

  it("enables the season draft and records observed scoring instead of invented grades", () => {
    const markup = renderRoute(Season, season, "/seasons/2026?tab=draft");
    expect(markup).toContain("2026 draft picks and observed usage");
    expect(markup).toContain("Keepers only");
    expect(markup).not.toContain("Draft coming soon");
    expect(getDraftUsage(season).length).toBe(season.draft.picks.length);
  });

  it("links season trades into dedicated scenarios and respects URL filters", () => {
    const markup = renderRoute(Season, season, "/seasons/2026?tab=moves&type=trade");
    expect(markup).toContain(`/seasons/2026/trades/${season.trades[0].id}`);
    expect(markup).toContain("Only executed moves and recorded trades");
    expect(markup).not.toContain("Moves coming soon");
  });

  it("labels scenario coverage, unchanged opponents and overlap warnings", () => {
    const markup = renderRoute(TradePage, { season: scenarioSeason(), trade }, "/seasons/2026/trades/test-trade");
    expect(markup).toContain("One trade reversed, not a rewritten league");
    expect(markup).toContain("Opponent overlap");
    expect(markup).toContain("not a feasible alternate-league result");
    expect(markup).toContain("1 of 1 finalized");
    expect(markup).toContain("Try a keep-original lineup");
    expect(markup).toContain("Optimal lineup");
    expect(markup).toContain("Preserve actual starters");
  });

  it("restores custom shared lineups without treating them as optimal", () => {
    const markup = renderRoute(TradePage, { season: scenarioSeason(), trade },
      "/seasons/2026/trades/test-trade?team=1&week=2&lineup=3");
    expect(markup).toContain("Your edited lineup");
    expect(markup).toContain("12.00");
    expect(markup).toContain("Season summaries below remain optimal");
  });

  it("shows a visible reset for invalid shared lineups", () => {
    const markup = renderRoute(TradePage, { season: scenarioSeason(), trade },
      "/seasons/2026/trades/test-trade?team=1&week=2&lineup=999");
    expect(markup).toContain("Unable to use this shared scenario");
    expect(markup).toContain("Reset shared scenario");
  });
});
