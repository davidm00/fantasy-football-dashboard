import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import type { SeasonLoaderData } from "../../routes/loader";
import type { Trade } from "../../models/models";
import {
  getScenarioSlots, getOriginalPlayerUsage, getTradeScenario, getScenarioMove,
  lineupSelections, suggestedSelections, validateScenarioSelections, resultOf, isStarter,
} from "../../utils/managerMetrics";
import { getManagerName } from "../../utils/homeViewUtils";
import MetricTooltip from "./MetricTooltip";
import RosterTable, { type RosterRow } from "./RosterTable";
import SelectField from "./SelectField";

export default function TradeLineupEditor({ season, trade }: { season: SeasonLoaderData; trade: Trade }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [move, setMove] = useState<{ context: string; playerId: number } | null>(null);
  const [moveError, setMoveError] = useState<{ context: string; message: string } | null>(null);
  const teamId = params.has("team") ? Number(params.get("team")) : trade.team_ids[0];
  const validTeam = trade.team_ids.includes(teamId);
  const scenario = useMemo(() => validTeam ? getTradeScenario(season, trade, teamId) : null,
    [season, trade, teamId, validTeam]);
  const available = scenario?.weeks ?? [];
  const selectedWeek = params.has("week") ? Number(params.get("week")) : available.at(-1)?.week;
  const game = available.find(({ week }) => week === selectedWeek);
  const context = `${trade.id}:${teamId}:${selectedWeek}:${params.get("lineup")}`;
  useEffect(() => {
    if (location.hash === "#lineup-sandbox") {
      document.getElementById("lineup-sandbox")?.scrollIntoView({ block: "start" });
    }
  }, [teamId, selectedWeek, location.hash]);
  const slots = getScenarioSlots(season);
  const defaults = game ? lineupSelections(slots, game.keptLineup) : [];
  const actualSelections = game ? lineupSelections(slots, game.actualLineup.filter(isStarter).map(
    (player) => ({ ...player, selectedSlot: player.slot_position }),
  )) : [];
  const parsed = params.has("lineup") && game
    ? validateScenarioSelections(params.get("lineup")!, slots, game.keptRoster)
    : { selections: defaults, issues: [] };
  const canEdit = game && !game.issues.length && !parsed.issues.length;
  const pool = game?.keptRoster ?? [];
  const total = canEdit ? parsed.selections.reduce<number>((sum, id) =>
    sum + (pool.find(({ player_id }) => player_id === id)?.points ?? 0), 0,
  ) : null;
  const update = (key: "team" | "week", value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.delete("lineup");
    if (key === "team") next.delete("week");
    setParams(next, { flushSync: true });
  };
  const setLineup = (selections: (number | null)[] | null) => {
    const next = new URLSearchParams(params);
    next.set("team", String(teamId));
    if (selectedWeek !== undefined) next.set("week", String(selectedWeek));
    if (selections) next.set("lineup", selections.map((id) => id === null ? "_" : String(id)).join(","));
    else next.delete("lineup");
    setParams(next, { flushSync: true });
  };
  const closeMove = useCallback((playerId: number, restoreFocus = true) => {
    setMove(null);
    if (restoreFocus) requestAnimationFrame(() => document.getElementById(`roster-move-${playerId}`)?.focus());
  }, []);
  const reset = () => {
    const next = new URLSearchParams(params);
    for (const key of ["team", "week", "lineup"]) next.delete(key);
    setParams(next, { flushSync: true });
  };
  const metric = season.metrics.teams[teamId];
  const selectedIds = new Set(parsed.selections.filter((id) => id !== null));
  const movingPlayer = canEdit && move?.context === context
    ? pool.find(({ player_id }) => player_id === move.playerId) : undefined;
  useEffect(() => {
    if (!movingPlayer) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-roster-destination]")) return;
      if (target instanceof Element && target.closest("[data-roster-move]")) event.stopPropagation();
      closeMove(movingPlayer.player_id, false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMove(movingPlayer.player_id);
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [movingPlayer, closeMove]);
  const status = (id: number | undefined) =>
    trade.items.some((item) => item.from_team_id === teamId && item.player_id === id) ? "Original" : undefined;
  const starters: RosterRow[] = slots.map((slot, index) => ({
    slot, player: pool.find(({ player_id }) => player_id === parsed.selections[index]),
    status: status(parsed.selections[index] ?? undefined),
  }));
  const bench: RosterRow[] = pool.filter((player) =>
    !selectedIds.has(player.player_id) && !["IR", "ER"].includes(player.slot_position),
  ).map((player) => ({ slot: "BE", player, status: status(player.player_id) }));
  const reserves = pool.filter(({ slot_position }) => ["IR", "ER"].includes(slot_position));
  return <section className="activity-view lineup-editor" id="lineup-sandbox" aria-labelledby="lineup-editor-heading">
    <header className="activity-heading"><div>
      <h2 id="lineup-editor-heading">Try a keep-original lineup</h2>
      <p className="activity-note">Choose Move, then Here on an eligible roster row or the bench. Original marks a player restored from this trade.</p>
    </div></header>
    <div className="lineup-toolbar">
      <div className="activity-controls">
        <SelectField label="Scenario manager" value={String(teamId)} onChange={(value) => update("team", value)}
          options={trade.team_ids.map((id) => ({ value: String(id), label: getManagerName(season.teams.find(({ team_id }) => team_id === id)) }))} />
        <SelectField label="Scenario week" value={String(selectedWeek ?? "")} onChange={(value) => update("week", value)}
          options={available.length ? [...available].reverse().map(({ week }) => ({ value: String(week), label: `Week ${week}` }))
            : [{ value: "", label: "No finalized weeks" }]} />
      </div>
      <div className="lineup-presets" role="group" aria-label="Starting lineup presets">
        <button type="button" aria-pressed={!params.has("lineup")} onClick={() => setLineup(null)}
          disabled={!game || !!game.issues.length}>Optimal lineup</button>
        <button type="button" disabled={!game || !!game.issues.length} onClick={() =>
          game && setLineup(suggestedSelections(season, trade, teamId, game.actualLineup, pool))
        }>Preserve actual starters</button>
      </div>
    </div>
    {!validTeam || (selectedWeek !== undefined && !game) || parsed.issues.length > 0
      ? <aside className="scenario-warning" role="alert"><strong>Unable to use this shared scenario.</strong>
          <p>{parsed.issues.join(" ") || "The manager or week is not available for this trade."}</p>
          <button type="button" onClick={reset}>Reset shared scenario</button>
        </aside>
      : !game ? <p className="activity-empty">No finalized full weeks after this trade yet.</p>
      : game.issues.length ? <aside className="scenario-warning"><strong>Lineup unavailable for Week {game.week}.</strong><p>{game.issues.join(" ")}</p></aside>
      : <>
        <div className="lineup-score-strip" aria-live="polite" aria-atomic="true">
          <div><span>Your edited lineup{!params.has("lineup") && " · optimal"}</span>
            <strong>{total?.toFixed(2)} <small>{total === null ? "—" : resultOf(total, game.opponentScore)}</small></strong>
          </div>
          <span className="lineup-score-versus">vs</span>
          <div><span>{getManagerName(season.teams.find(({ team_id }) => team_id === game.opponentId))} · actual</span>
            <strong>{game.opponentScore.toFixed(2)}</strong>
          </div>
          <p>Actual score: {game.score.toFixed(2)} · {game.result}
            {total !== null && ` · ${total - game.score >= 0 ? "+" : ""}${(total - game.score).toFixed(2)} points`}
            {" · "}<Link className="section-route-link activity-cta" to={game.path}>View actual matchup →</Link>
          </p>
        </div>
        {game.collision.length > 0 && <aside className="lineup-caution">
          <strong>Opponent overlap: {game.collision.join(", ")}.</strong> The actual opponent also rostered a restored player.
          Their score stays unchanged; this is not a feasible rewritten league.
        </aside>}
        {!!scenario?.laterTrades.length && <p className="lineup-caution">
          Later trades are not undone: these players appear in {scenario.laterTrades.length} later trade(s).
        </p>}
        {moveError?.context === context && <p role="alert" className="lineup-caution">{moveError.message}</p>}
        {movingPlayer && <p className="roster-move-hint" role="status">Moving <strong>{movingPlayer.name}</strong>.
          {" "}Choose Here; click elsewhere or press Escape to cancel.</p>}
        <RosterTable caption={`Week ${game.week} keep-original roster`} starters={starters} bench={bench}
          emptyPoints onMove={(playerId) => setMove({ context, playerId })}
          move={movingPlayer ? {
            player: movingPlayer,
            canMove: (destination) => !getScenarioMove(movingPlayer.player_id, destination, parsed.selections, slots, pool).issues.length,
            onCancel: () => closeMove(movingPlayer.player_id),
            onHere: (destination) => {
              const result = getScenarioMove(movingPlayer.player_id, destination, parsed.selections, slots, pool);
              closeMove(movingPlayer.player_id);
              if (result.issues.length) {
                setMoveError({ context, message: result.issues.join(" ") });
                return;
              }
              setMoveError(null);
              setLineup(result.selections);
            },
          } : undefined} />
        {reserves.length > 0 && <details className="quiet-disclosure">
          <summary>Unavailable reserves ({reserves.length})</summary>
          <p className="activity-note">Observed IR/ER restrictions remain in place; these players cannot be moved into the lineup.</p>
          <RosterTable caption="Excluded reserves" starters={reserves.map((player) => ({ slot: player.slot_position, player }))} />
        </details>}
        <p className="activity-note">Copy link saves this week’s lineup. Season summaries below remain optimal, not customized.</p>
        <details className="quiet-disclosure">
          <summary>Actual starters &amp; player usage</summary>
          <RosterTable caption={`Actual Week ${game.week} starters`} starters={slots.map((slot, index) => ({
            slot, player: game.actualLineup.find(({ player_id }) => player_id === actualSelections[index]),
          }))} />
          <p className="activity-note">“Preserve actual starters” keeps unaffected starters in their actual slots, then fills gaps with eligible original players,
            preferring more starts before the trade week. It is a suggestion, not a historical fact.</p>
          <h3>How often were the original players started?</h3>
          <p className="activity-note">Observed finalized regular-season roster weeks before Week {trade.week}; missing snapshots are not counted.</p>
          <ul className="lineup-usage">{getOriginalPlayerUsage(season, trade, teamId).map((usage) => <li key={usage.player_id}>
            <strong>{usage.player_name}</strong>
            <span>{usage.starts} starts / {usage.rosterWeeks} roster weeks · {usage.starterPoints.toFixed(2)} starter points</span>
          </li>)}</ul>
          <p className="activity-note">Actual season lineup efficiency: {metric?.lineupEfficiency == null ? "Unavailable" : `${metric.lineupEfficiency.toFixed(1)}%`}
            <MetricTooltip label="Actual season lineup efficiency">Actual starter points divided by hindsight-optimal actual-roster points across finalized regular-season weeks. This is not a prediction of how this manager would have started the restored players.</MetricTooltip>
          </p>
        </details>
      </>}
  </section>;
}
