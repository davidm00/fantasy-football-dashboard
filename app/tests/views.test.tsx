import { describe, expect, it } from "vitest";
import Season from "../src/routes/Season";
import Week from "../src/routes/Week";
import Matchup from "../src/routes/Matchup";
import PlayoffBracket from "../src/components/shared/PlayoffBracket";
import RouteErrorPage from "../src/routes/RouteErrorPage";
import { calculateWeekMetrics } from "../src/utils/metrics";
import { loadMatchup, loadSeason, renderRoute } from "./fixtures";

describe("audit view regressions", () => {
  const historicalSeason = loadSeason(2025);
  const currentSeason = loadSeason(2026);

  it("uses retrospective copy and correctly scaled draft percentages", () => {
    const award = historicalSeason.metrics.awards.draftSteal;
    expect(award).not.toBeNull();
    const markup = renderRoute(Season, historicalSeason);
    expect(markup).toContain("Completed season");
    expect(markup).toContain("Season highlights");
    expect(markup).toContain("led");
    expect(markup).toContain(`${((award?.teamPointShare ?? 0) * 100).toFixed(1)}% of team scoring`);
  });

  it("links award box scores directly to matchups", () => {
    const markup = renderRoute(Season, historicalSeason);
    const boxScoreLinks = [...markup.matchAll(/href="([^"]+)"[^>]*>See the box score/g)].map((match) => match[1]);
    expect(boxScoreLinks.length).toBeGreaterThan(0);
    expect(boxScoreLinks.every((href) => /\/weeks\/\d+\/matchups\/\d+\/\d+$/.test(href))).toBe(true);
  });

  it("offers sorting and metric explanations on mobile cards", () => {
    const markup = renderRoute(Season, currentSeason, "/seasons/2026?layout=cards");
    expect(markup).toContain("Sort by");
    expect(markup).toContain("Schedule luck");
    const mobile = markup.slice(markup.indexOf('class="season-standings-mobile"'));
    expect(mobile).toContain('aria-label="Explain Power"');
    expect(mobile).toContain('aria-label="Explain All-play"');
    expect(mobile).toContain('aria-label="Explain Schedule luck"');
    expect(markup).not.toContain('class="season-standings-table"');
    expect(markup).not.toContain('class="season-mobile-table-hint"');
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Cards<\/button>/);
  });

  it("defaults to the table without also showing compact cards", () => {
    const markup = renderRoute(Season, currentSeason);
    expect(markup).toContain('aria-label="Standings layout"');
    expect(markup).toContain('class="season-standings-table"');
    expect(markup).not.toContain('class="season-standings-mobile"');
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Table<\/button>/);
    expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Cards<\/button>/);
  });

  it("labels playoff weeks and provisional results truthfully", () => {
    const playoff = renderRoute(Week, {
      season: historicalSeason, week: 15,
      weekMetrics: calculateWeekMetrics(historicalSeason, 15),
    });
    expect(playoff).toContain("Playoffs");
    const current = renderRoute(Week, {
      season: currentSeason, week: 5,
      weekMetrics: calculateWeekMetrics(currentSeason, 5),
    });
    expect(current).toContain("Provisional");
    expect(current).toContain("Leading");
    expect(current).not.toContain("Updates as scores change");
    expect(current).toContain("Points left on bench");
    expect(current).toContain("available after the week is final");
    expect(current).not.toContain("Biggest lineup swing");
  });

  it.each(["in_progress", "not_started"] as const)(
    "keeps actual lineups and disables best possible for %s games",
    (status) => {
      const fixture = { ...loadMatchup(currentSeason, 5, 12, 10), status };
      const markup = renderRoute(Matchup, fixture);
      expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*disabled=""[^>]*>Best possible<\/button>/);
      expect(markup).toContain('aria-describedby="matchup-lineup-explanation"');
      expect(markup).toContain("Best possible is available after the week is final");
      expect(markup).not.toContain("Subbed in");
      expect(markup).not.toContain("Subbed out");
      const summary = markup.slice(markup.indexOf('class="matchup-detail-metrics"'));
      expect(summary.match(/Available after the week is final/g)).toHaveLength(2);
      expect(summary).not.toContain("0.00 vs 0.00");
      expect(summary).not.toContain("—%");
      expect(markup).not.toContain("Select Best possible");
      expect(markup).not.toContain("provisional during unfinished games");
      const starters = markup.slice(markup.indexOf('class="matchup-lineup-heading"'), markup.indexOf("<h3>Bench"));
      for (const player of [...fixture.boxScore.home_lineup, ...fixture.boxScore.away_lineup]) {
        if (!["BE", "IR", "ER"].includes(player.slot_position)) {
          expect(starters).toContain(player.name);
        }
      }
    },
  );

  it("keeps best possible available for final games", () => {
    const markup = renderRoute(Matchup, loadMatchup(historicalSeason, 1, 10, 2));
    const button = markup.match(/<button[^>]*>Best possible<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toContain("disabled");
    expect(markup).toContain("Hindsight-optimal lineups use final scores");
  });

  it("never calls an unfinished or tied matchup a self-inflicted loss", () => {
    const fixture = loadMatchup(currentSeason, 5, 12, 10);
    const markup = renderRoute(Matchup, fixture);
    expect(markup).not.toContain("could have changed the result");
    expect(markup).not.toContain("lost by");
    const tied = renderRoute(Matchup, {
      ...fixture, status: "final",
      boxScore: { ...fixture.boxScore, home_score: 100, away_score: 100 },
    });
    expect(tied).not.toContain("could have changed the result");
  });

  it("shows the real historical championship round and links games", () => {
    const season = loadSeason(2023);
    function BracketFixture() {
      return <PlayoffBracket season={season} seeds={season.teams.slice(0, 4)} />;
    }
    const markup = renderRoute(BracketFixture);
    expect(markup).toContain("Semifinals");
    expect(markup).toContain("Championship");
    expect(markup).not.toContain("Week 17");
    expect(markup).toContain("/seasons/2023/weeks/16/matchups/4/5");
  });

  it("does not invent a box-score link when the archived pairing is missing", () => {
    const season = loadSeason(2022);
    function BracketFixture() {
      return <PlayoffBracket season={season} seeds={season.teams.slice(0, 4)} />;
    }
    const markup = renderRoute(BracketFixture);
    expect(markup).toContain("Box score not available for this pairing.");
    expect(markup).not.toContain("/seasons/2022/weeks/16/matchups/2/10");
  });

  it("offers retry for temporary failures, not unavailable routes", () => {
    function ErrorFixture() {
      return <RouteErrorPage code="Error" eyebrow="Unable to load" title="Something went wrong"
        description="Retry without losing your place." linkTo="/" linkLabel="Home" retry />;
    }
    expect(renderRoute(ErrorFixture)).toContain("Retry this page");
    function MissingFixture() {
      return <RouteErrorPage code="404" eyebrow="Unavailable" title="Not found"
        description="Choose an available page." linkTo="/" linkLabel="Home" />;
    }
    expect(renderRoute(MissingFixture)).not.toContain("Retry this page");
  });
});
