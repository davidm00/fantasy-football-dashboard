import type { SeasonLoaderData } from "../../routes/loader";
import { getDraftUsage } from "../../utils/managerMetrics";
import TeamManagerLinks from "../shared/TeamManagerLinks";
import { getDraftColumn, getDraftHeat } from "../../utils/activityMetrics";

type DraftUsage = ReturnType<typeof getDraftUsage>[number];

export default function DraftBoard({ season, picks, allPicks }: {
  season: SeasonLoaderData;
  picks: DraftUsage[];
  allPicks: DraftUsage[];
}) {
  const teamCount = season.settings.team_count;
  const columns = [...new Set(picks.map((pick) => getDraftColumn(pick.round, pick.round_pick, teamCount)))].sort((a, b) => a - b);
  const rounds = [...new Set(picks.map(({ round }) => round))].sort((a, b) => a - b);
  const observed = allPicks.filter(({ observedWeeks }) => observedWeeks > 0).map(({ starterPoints }) => starterPoints);
  const minimum = observed.length ? Math.min(...observed) : 0;
  const maximum = observed.length ? Math.max(...observed) : 0;
  const rowStyle = { gridTemplateColumns: `3rem repeat(${columns.length}, minmax(0, 1fr))` };
  return <section className="draft-board-view" aria-label={`${season.year} draft heat map`}>
    <div className="draft-board-legend">
      <span>Started points for the drafting team</span>
      {observed.length > 0 ? <span className="draft-heat-scale">Lower · {minimum.toFixed(1)}<i aria-hidden="true" />{maximum.toFixed(1)} pts · Higher</span>
        : <span>No observed scoring data</span>}
      <span>K = keeper · Striped gray = unavailable</span>
    </div>
    <p className="activity-note">Scroll to explore draft slots and rounds. Columns stay in snake-draft order; heat is production, not a draft grade.</p>
    <div className="draft-board-scroll" role="region" aria-label="Draft board, scroll horizontally and vertically" tabIndex={0}>
      <div className="draft-board" style={{ minWidth: `${3 + columns.length * 9.5}rem` }}>
        <div className="draft-board-header" style={rowStyle}>
          <span className="draft-board-round">Rd</span>
          {columns.map((column) => {
            const owner = allPicks.find(({ round, round_pick }) => round === 1 && round_pick === column)?.team_id;
            return <div key={column}><small>Slot {column}</small>
              {owner === undefined ? <span>Owner unavailable</span> : <TeamManagerLinks season={season} teamId={owner} />}
            </div>;
          })}
        </div>
        {rounds.map((round) => <div className="draft-board-row" key={round} style={rowStyle}>
          <strong className="draft-board-round">{round}</strong>
          {columns.map((column) => {
            const cell = picks.filter((pick) => pick.round === round && getDraftColumn(round, pick.round_pick, teamCount) === column);
            const recorded = allPicks.some((pick) => pick.round === round && getDraftColumn(round, pick.round_pick, teamCount) === column);
            const owner = allPicks.find((pick) => pick.round === 1 && pick.round_pick === column)?.team_id;
            return <div key={column} className="draft-board-cell">
              {cell.length ? cell.map((pick) => {
                const heat = getDraftHeat(pick, minimum, maximum);
                return <article key={pick.player_id} className={heat === null ? "draft-pick draft-pick-unavailable" : "draft-pick"}
                  style={heat === null ? undefined : { backgroundColor: `rgba(15, 118, 110, ${0.06 + heat * 0.49})` }}>
                  <div className="draft-pick-meta"><span>{pick.round}.{pick.round_pick} · {pick.position ?? "Position unavailable"}</span>
                    {pick.is_keeper && <strong aria-label="Keeper">K</strong>}</div>
                  <strong>{pick.player_name}</strong>
                  <span className="draft-pick-points">{heat === null ? "Unavailable" : `${pick.starterPoints.toFixed(2)} pts`}</span>
                  <small>{pick.starts} {pick.starts === 1 ? "start" : "starts"} · {pick.observedWeeks} observed {pick.observedWeeks === 1 ? "week" : "weeks"}</small>
                  {pick.team_id !== owner && <small>Drafted by <TeamManagerLinks season={season} teamId={pick.team_id} /></small>}
                </article>;
              }) : <span className="draft-board-empty">{recorded ? "Hidden by filter" : "No recorded pick"}</span>}
            </div>;
          })}
        </div>)}
      </div>
    </div>
  </section>;
}
