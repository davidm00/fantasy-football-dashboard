import { describe, expect, it } from "vitest";
import Season from "../src/routes/Season";
import SeasonMatchupsSection from "../src/components/season/SeasonMatchupsSection";
import { loadSeason, renderRoute } from "./fixtures";

const season = loadSeason(2026, { 12: "not_started", 13: "not_started", 14: "not_started" });
function SchedulePage() {
  return <SeasonMatchupsSection season={season}><p>Actual matchup fixture</p></SeasonMatchupsSection>;
}
const route = "/seasons/2026?tab=matchups&matchupView=schedule&scoreTeam=2&scheduleTeam=10";

describe("production schedule views", () => {
  it("keeps actual matchups as the default and renders only one view", () => {
    const actual = renderRoute(SchedulePage);
    expect(actual).toContain("Actual matchup fixture");
    expect(actual).not.toContain("Strength of schedule");
    const schedule = renderRoute(SchedulePage, undefined, route);
    expect(schedule).toContain("Compare schedules");
    expect(schedule).not.toContain("Actual matchup fixture");
    expect(schedule).not.toContain("Easiest schedule</");
    expect(schedule).not.toContain("Hardest schedule</");
  });

  it("adds average opponent points and SOS rank to Standings Table and Cards", () => {
    const markup = renderRoute(Season, season, "/seasons/2026");
    const table = markup.split('class="season-standings-table">')[1].split("</table>")[0];
    expect(table.match(/<th scope="row">/g)).toHaveLength(12);
    expect(table).toContain(">SOS<");
    expect(table).toContain("136.25");
    expect(table).toContain("150.00");
    expect(table).toContain("Rank 1");
    expect(table).toContain("Rank 12");
    expect(table.match(/aria-sort=/g)).toHaveLength(1);
    expect(table).toMatch(/colspan="11"/i);
    expect(markup).toContain("lower is easier");
    expect(markup).toContain("11/11 finalized regular-season weeks");
    const cards = renderRoute(Season, season, "/seasons/2026?layout=cards");
    expect(cards).toContain("SOS (avg opp.)");
    expect(cards).toContain("136.25");
    expect(cards).toContain("Rank 1");
    expect(cards).toContain("Strength of schedule");
  });

  it("keeps Matchups focused on the borrowed schedule without a duplicate SOS table", () => {
    const markup = renderRoute(SchedulePage, undefined, route);
    expect(markup).not.toContain("strength of schedule by");
    expect(markup).not.toContain("Avg opponent points");
    expect(markup).toContain("9-2");
    expect(markup).toContain("7-4");
    expect(markup).toContain("Head-to-head unchanged");
  });

  it("restores own schedules and changed-only filtering from the URL", () => {
    const markup = renderRoute(SchedulePage, undefined,
      "/seasons/2026?tab=matchups&matchupView=schedule&scoreTeam=2&scheduleTeam=2&scheduleChanges=1");
    expect(markup).toContain("Own schedule selected");
    expect(markup).toContain("No changed results for this comparison.");
  });

  it("surfaces unavailable selections without fabricating records", () => {
    const markup = renderRoute(SchedulePage, undefined, `${route}&scoreTeam=99`.replace("scoreTeam=2&", ""));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Choose two available managers");
    expect(markup).not.toContain("Actual record");
  });

  it("integrates into the real season route without changing the default view", () => {
    const actual = renderRoute(Season, season, "/seasons/2026?tab=matchups");
    expect(actual).toContain("Jump to week");
    expect(actual).not.toContain("Strength of schedule");
    const schedule = renderRoute(Season, season, route);
    expect(schedule).toContain("Compare schedules");
    expect(schedule).not.toContain("Jump to week");
  });

  it("marks SOS unavailable when no common finalized weeks exist", () => {
    const unavailable = { ...season, matchups: [] };
    const markup = renderRoute(Season, unavailable, "/seasons/2026");
    expect(markup.match(/<td><span>Unavailable<\/span><\/td>/g)).toHaveLength(12);
    expect(markup).toContain("0/0 finalized regular-season weeks");
    expect(markup).not.toContain("Rank 1</small>");
  });
});
