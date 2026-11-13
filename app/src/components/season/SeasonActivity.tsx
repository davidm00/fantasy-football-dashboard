import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import type { Team } from "../../models/models";
import type { SeasonLoaderData } from "../../routes/loader";
import { getAvailableWeeks, getManagerName, isSeasonInProgress } from "../../utils/homeViewUtils";
import { getDraftUsage } from "../../utils/managerMetrics";
import SelectField from "../shared/SelectField";
import SortHeader from "../shared/SortHeader";
import { useTableSort } from "../../hooks/useTableSort";
import DraftBoard from "./DraftBoard";
import TeamManagerLinks from "../shared/TeamManagerLinks";
import InsightCard from "../shared/InsightCard";
import SidePanel from "../shared/SidePanel";
import ActivityLayout from "../shared/ActivityLayout";
import TradeReceipt from "../shared/TradeReceipt";
import { getBestPickup } from "../../utils/metrics/seasonMetrics";
import { getFaabLedger } from "../../utils/activityMetrics";

export { TeamManagerLinks };

type ActivityProps = { season: SeasonLoaderData; teamId?: number }
  | { entries: { season: SeasonLoaderData; team: Team }[] };

function useActivitySources(props: ActivityProps) {
  const entries = "entries" in props ? props.entries : undefined;
  const season = "season" in props ? props.season : undefined;
  const teamId = "teamId" in props ? props.teamId : undefined;
  return useMemo(() => {
    if (entries) return entries.map(({ season, team }) => ({ season, teamId: team.team_id })).sort((a, b) => b.season.year - a.season.year);
    if (!season) throw new Error("An activity view requires available season data.");
    return [{ season, teamId }];
  }, [entries, season, teamId]);
}

function useActivityFilters() {
  const [params, setParams] = useSearchParams();
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { flushSync: true });
  };
  const reset = () => {
    const next = new URLSearchParams(params);
    for (const key of ["team", "week", "type", "keepers", "pickSort", "pickOrder"]) next.delete(key);
    setParams(next, { flushSync: true });
  };
  return { params, update, reset };
}

function TeamFilter({ season, value, onChange }: {
  season: SeasonLoaderData; value: string; onChange: (value: string) => void;
}) {
  return <SelectField label="Manager" value={value} onChange={onChange}
    options={[{ value: "", label: "Everyone" }, ...season.teams.map((team) => ({
      value: String(team.team_id), label: getManagerName(team),
    }))]} />;
}

export function SeasonDraftView(props: ActivityProps) {
  const { params, update, reset } = useActivityFilters();
  const sources = useActivitySources(props);
  const allTime = "entries" in props;
  const { season, teamId } = sources[0];
  const keepers = params.get("keepers") === "1";
  const sourcePicks = useMemo(() => sources.map((source) => ({ ...source, picks: getDraftUsage(source.season) })), [sources]);
  const picks = sourcePicks.flatMap((source) => {
    const selectedTeam = source.teamId ?? (params.get("team") ? Number(params.get("team")) : undefined);
    return source.picks.filter((pick) =>
      (selectedTeam === undefined || pick.team_id === selectedTeam) && (!keepers || pick.is_keeper),
    ).sort((a, b) => a.round - b.round || a.round_pick - b.round_pick)
      .map((pick) => ({ ...pick, season: source.season }));
  });
  const boardAvailable = !allTime && teamId === undefined;
  const board = boardAvailable && params.get("draftLayout") === "board";
  const sorter = useTableSort(picks, {
    year: { value: (row) => row.season.year, direction: "descending" },
    pick: { value: (row) => row.round * 100 + row.round_pick },
    player: { value: (row) => row.player_name },
    manager: { value: (row) => getManagerName(row.season.teams.find(({ team_id }) => team_id === row.team_id)) },
    weeks: { value: (row) => row.observedWeeks, direction: "descending" },
    observed: { value: (row) => row.observedWeeks ? row.observedPoints : null, direction: "descending" },
    starts: { value: (row) => row.starts, direction: "descending" },
    points: { value: (row) => row.starterPoints, direction: "descending" },
  }, allTime ? { key: "year", direction: "descending" } : { key: "pick", direction: "ascending" }, "pick");
  const columns = [
    ...(allTime ? [["year", "Season"]] : []), ["pick", "Pick"], ["player", "Player"],
    ...(teamId === undefined ? [["manager", "Manager"]] : []),
    ["weeks", "Observed weeks"], ["observed", "Observed points"], ["starts", "Starts for team"], ["points", "Starter points for team"],
  ];
  const observedPicks = picks.filter(({ observedWeeks }) => observedWeeks > 0);
  const workhorse = [...observedPicks].sort((a, b) => b.starterPoints - a.starterPoints)[0];
  const careerPlayers = new Map<number, { name: string; points: number; picks: number; years: Set<number> }>();
  for (const pick of observedPicks) {
    const player = careerPlayers.get(pick.player_id) ?? { name: pick.player_name, points: 0, picks: 0, years: new Set<number>() };
    player.points += pick.starterPoints;
    player.picks++;
    player.years.add(pick.season.year);
    careerPlayers.set(pick.player_id, player);
  }
  const careerWorkhorse = [...careerPlayers.values()].sort((a, b) => b.points - a.points)[0];
  const keeperPicks = picks.filter(({ is_keeper }) => is_keeper);
  const latePicks = picks.filter(({ round }) => round >= 10);
  const production = (group: typeof picks) => !group.length ? "No picks" : group.some(({ observedWeeks }) => observedWeeks > 0)
    ? `${group.reduce((sum, pick) => sum + pick.starterPoints, 0).toFixed(1)} pts` : "Unavailable";
  const coverageNote = (group: typeof picks) => `${group.length} ${group.length === 1 ? "pick" : "picks"} · ${group.filter(({ observedWeeks }) => !observedWeeks).length} without observed weeks`;
  return <section className="activity-view" aria-labelledby="draft-heading">
    <header className="activity-heading"><h2 id="draft-heading">{allTime ? "All-time" : season.year} draft</h2>
      <span>{picks.length} {picks.length === 1 ? "pick" : "picks"} shown</span></header>
    <div className="insight-grid" role="region" aria-label="Draft highlights" tabIndex={0}>
      <InsightCard label={allTime ? "All-time draft workhorse" : `Draft workhorse${isSeasonInProgress(season) ? " so far" : ""}`}
        value={(allTime ? careerWorkhorse?.name : workhorse?.player_name) ?? "Awaiting starter production"}
        note={allTime && careerWorkhorse ? `${careerWorkhorse.points.toFixed(1)} observed starter pts · ${careerWorkhorse.picks} picks across ${careerWorkhorse.years.size} seasons`
          : workhorse ? `${workhorse.season.year} · pick ${workhorse.round}.${workhorse.round_pick} · ${workhorse.starterPoints.toFixed(1)} starter pts` : "Awaiting observed starter production."} />
      <InsightCard label="Keeper production" value={production(keeperPicks)} note={coverageNote(keeperPicks)} />
      <InsightCard label="Rounds 10+ production" value={production(latePicks)} note={coverageNote(latePicks)} />
    </div>
    <div className="activity-controls">
      {teamId === undefined && <TeamFilter season={season} value={params.get("team") ?? ""} onChange={(value) => update("team", value)} />}
      <label className="activity-checkbox"><input type="checkbox" checked={keepers} onChange={(event) => update("keepers", event.target.checked ? "1" : "")} />Keepers only</label>
      {boardAvailable && <div className="season-view-toggle" role="group" aria-label="Draft layout">
        <button type="button" aria-pressed={!board} onClick={() => update("draftLayout", "")}>Table</button>
        <button type="button" aria-pressed={board} onClick={() => update("draftLayout", "board")}>Board</button>
      </div>}
      <button type="button" onClick={reset}>Reset filters</button>
      {!board && <button type="button" onClick={sorter.reset} disabled={sorter.isDefault}>Reset sort</button>}
    </div>
    <ActivityLayout><div className="activity-main">
    {picks.length ? board ? <DraftBoard season={season} picks={picks} allPicks={sourcePicks[0].picks} /> : <div className="activity-table-shell" role="region" aria-label="Draft picks, scroll horizontally for all columns" tabIndex={0}>
      <table className="activity-table"><caption>{allTime ? "All-time" : season.year} draft picks and observed usage</caption>
        <thead><tr>{columns.map(([key, label]) => <SortHeader key={key} sortKey={key} label={label}
          activeKey={sorter.key} direction={sorter.direction} onSort={sorter.onSort} align="left" />)}</tr></thead>
        <tbody>{sorter.rows.map((pick) => <tr key={`${pick.season.year}-${pick.round}-${pick.round_pick}-${pick.player_id}`}>
          {allTime && <td><Link to={`/seasons/${pick.season.year}?tab=draft`}>{pick.season.year}</Link></td>}
          <td>{pick.round}.{pick.round_pick}{pick.is_keeper && " K"}</td>
          <th scope="row">{pick.player_name}<small>{pick.position ?? "Position unavailable"}</small></th>
          {teamId === undefined && <td><TeamManagerLinks season={pick.season} teamId={pick.team_id} /></td>}
          <td>{pick.observedWeeks}</td><td>{pick.observedWeeks ? pick.observedPoints.toFixed(2) : "Unavailable"}</td>
          <td>{pick.starts}</td><td>{pick.starterPoints.toFixed(2)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="activity-empty">No draft picks match these filters. Reset filters to see available picks.</p>}
    </div><aside className="activity-sidebar"><SidePanel title="Draft receipts">
      <p className="activity-note">Actual starter production for the drafting team, across the picks shown.</p>
      {[{ label: "Rounds 1–3", picks: picks.filter(({ round }) => round <= 3) },
        { label: "Rounds 4–9", picks: picks.filter(({ round }) => round >= 4 && round <= 9) },
        { label: "Rounds 10+", picks: latePicks }].map((group) => <div className="production-row" key={group.label}>
          <span>{group.label}</span><strong>{production(group.picks)}</strong><small>{coverageNote(group.picks)}</small>
        </div>)}
      <h3>{allTime ? "Top individual draft seasons" : "Most starter production"}</h3>
      {[...observedPicks].sort((a, b) => b.starterPoints - a.starterPoints).slice(0, 3).map((pick) =>
        <div className="production-row" key={`${pick.season.year}-${pick.round}-${pick.round_pick}`}><strong>{pick.player_name}</strong>
          <span>{pick.starterPoints.toFixed(1)} pts</span><small>{pick.season.year} · pick {pick.round}.{pick.round_pick}{pick.is_keeper && " · Keeper"}</small></div>)}
    </SidePanel></aside></ActivityLayout>
    <details className="quiet-disclosure"><summary>How draft production is counted</summary>
      <p className="activity-note">Finalized regular-season snapshots only. Observed points include weeks on any roster; starter points count only starts for the drafting team.
        Unobserved weeks are not assumed to be zero. Keepers are identified by K; no invented steal/bust grades.</p>
    </details>
  </section>;
}

export function SeasonMovesView(props: ActivityProps & { tradesOnly?: boolean }) {
  const { params, update, reset } = useActivityFilters();
  const activitySources = useActivitySources(props);
  const selectedFilter = params.get("team");
  const sources = useMemo(() => activitySources.map((source) => ({
    ...source, selectedTeam: source.teamId ?? (selectedFilter ? Number(selectedFilter) : undefined),
  })), [activitySources, selectedFilter]);
  const allTime = "entries" in props;
  const { season, teamId } = sources[0];
  const tradesOnly = props.tradesOnly ?? false;
  const type = tradesOnly ? "trade" : params.get("type") ?? "";
  const week = params.get("week") ? Number(params.get("week")) : undefined;
  const entries = sources.flatMap((source) => {
    const selectedTeam = source.selectedTeam;
    const trades = source.season.trades.filter((trade) =>
      (selectedTeam === undefined || trade.team_ids.includes(selectedTeam)) &&
      (week === undefined || trade.week === week) && (!type || type === "trade"),
    );
    const transactions = source.season.transactions.filter((transaction) =>
      transaction.status === "EXECUTED" &&
      (selectedTeam === undefined || transaction.team_id === selectedTeam) &&
      (week === undefined || transaction.scoring_period === week) && (!type || type === transaction.type),
    );
    return [
      ...trades.map((trade) => ({ kind: "trade" as const, date: trade.date, id: trade.id, trade, season: source.season })),
      ...transactions.map((transaction) => ({ kind: "move" as const, date: transaction.date, id: transaction.id, transaction, season: source.season })),
    ];
  }).sort((a, b) => b.season.year - a.season.year || b.date - a.date);
  const executed = sources.flatMap((source) => source.season.transactions.filter((transaction) =>
    transaction.status === "EXECUTED" && (source.selectedTeam === undefined || transaction.team_id === source.selectedTeam),
  ).map((transaction) => ({ ...transaction, year: source.season.year })));
  const spent = executed.reduce((total, move) => total + move.bid_amount, 0);
  const failed = sources.reduce((total, source) => total + source.season.transactions.filter((move) =>
    move.status.startsWith("FAILED") && (source.selectedTeam === undefined || move.team_id === source.selectedTeam),
  ).length, 0);
  const weeks = [...new Set(sources.flatMap(({ season }) => getAvailableWeeks(season.settings.week_status)))].sort((a, b) => a - b);
  const ledger = useMemo(() => getFaabLedger(sources.map(({ season, selectedTeam }) => ({ season, teamId: selectedTeam }))), [sources]);
  const pickup = useMemo(() => sources.flatMap((source) => {
    const award = getBestPickup(source.season, undefined, source.selectedTeam);
    return award && award.startedPoints > 0 ? [{ season: source.season, pickup: award }] : [];
  }).sort((a, b) => b.pickup.startedPoints - a.pickup.startedPoints)[0], [sources]);
  const biggestBid = [...executed].sort((a, b) => b.bid_amount - a.bid_amount)[0];
  return <section className="activity-view" aria-labelledby="moves-heading">
    <header className="activity-heading"><h2 id="moves-heading">{allTime ? "All-time" : season.year} {tradesOnly ? "trades" : "moves"}</h2><span>{entries.length} shown</span></header>
    <div className="activity-controls">
      {teamId === undefined && <TeamFilter season={season} value={params.get("team") ?? ""} onChange={(value) => update("team", value)} />}
      {!tradesOnly && <SelectField label="Move type" value={type} onChange={(value) => update("type", value)}
        options={[{ value: "", label: "All completed moves" }, { value: "trade", label: "Trades" },
          { value: "WAIVER", label: "Waivers" }, { value: "FREEAGENT", label: "Free agents" }]} />}
      <SelectField label="Week" value={params.get("week") ?? ""} onChange={(value) => update("week", value)}
        options={[{ value: "", label: "All weeks" }, ...weeks.map((number) => ({ value: String(number), label: `Week ${number}` }))]} />
      <button type="button" onClick={reset}>Reset filters</button>
    </div>
    {!tradesOnly && <div className="insight-grid" role="region" aria-label="Move highlights" tabIndex={0}>
      <InsightCard label={allTime ? "Standout pickup season" : `Pickup standout${isSeasonInProgress(season) ? " so far" : ""}`}
        value={pickup?.pickup?.playerName ?? "Awaiting starter production"} note={pickup?.pickup ? `${pickup.season.year} · ${pickup.pickup.startedPoints.toFixed(1)} season starter pts · $${pickup.pickup.bidAmount} bid` : "No positive observed starter production yet."}
        explanation="Uses the existing season pickup award: starter points for the acquiring team across the season, including any starts before a reacquisition. This is not strictly post-pickup production." />
      <InsightCard label="Biggest executed bid" value={biggestBid && biggestBid.bid_amount > 0 ? `$${biggestBid.bid_amount}` : "No paid claims"}
        note={biggestBid && biggestBid.bid_amount > 0 ? `${allTime ? `${biggestBid.year} · ` : ""}${biggestBid.items.filter(({ type }) => type === "ADD").map(({ player_name }) => player_name).join(", ")}` : "Recorded free additions still count as moves."} />
      <InsightCard label="Recorded bid spend" value={`$${spent}`} note={allTime ? `Across ${sources.length} seasons; budgets reset each year.` : `${executed.length} executed moves in this scope.`} />
    </div>}
    <p className="activity-note">Only executed moves and recorded trades are listed. {failed} failed claims are excluded. Highlights cover the season/manager scope, not the week/type filters.</p>
    <ActivityLayout><div className="activity-main">
    <div className="activity-feed">{entries.map((entry) => <article key={`${entry.season.year}-${entry.kind}-${entry.id}`} className={`activity-item move-receipt ${entry.kind === "trade" ? "move-receipt-trade" : ""}`}>
      <div className="move-receipt-meta"><small>{new Date(entry.date).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" })} · Week {entry.kind === "trade" ? entry.trade.week : entry.transaction.scoring_period}</small>
        <span className="move-type-pill">{entry.kind === "trade" ? "Trade" : entry.transaction.type === "WAIVER" ? "Waiver" : "Free agent"}</span>
        {entry.kind === "move" && entry.transaction.bid_amount > 0 && <strong className="move-bid">${entry.transaction.bid_amount}</strong>}</div>
      {entry.kind === "trade" ? <>
        <h3>Trade · {entry.trade.team_ids.map((id, index) => <span key={id}>{index > 0 && " / "}<TeamManagerLinks season={entry.season} teamId={id} /></span>)}</h3>
        <div className="move-exchange">{entry.trade.team_ids.map((id) => <div key={id}>
          <small><TeamManagerLinks season={entry.season} teamId={id} /> received</small>
          {entry.trade.items.filter(({ to_team_id }) => to_team_id === id).map((item) => <span className="move-player move-player-add" key={item.player_id}>+ {item.player_name}</span>)}
        </div>)}</div>
        <TradeReceipt season={entry.season} trade={entry.trade} />
        <Link className="section-route-link activity-cta" to={`/seasons/${entry.season.year}/trades/${entry.trade.id}`}>Was this a fleece? Receipts &amp; keep-original scenario →</Link>
        <small>Source: {entry.trade.source === "espn" ? "ESPN record" : `reconstructed (${entry.trade.source})`}</small>
      </> : <>
        <h3>{teamId === undefined && <><TeamManagerLinks season={entry.season} teamId={entry.transaction.team_id} /> · </>}
          {entry.transaction.type === "WAIVER" ? "Won a waiver claim" : "Made a free-agent move"}</h3>
        <div className="move-players">{entry.transaction.items.map((item, index) => <span className={`move-player ${item.type === "ADD" ? "move-player-add" : "move-player-drop"}`} key={`${item.player_id}-${index}`}>
          {item.type === "ADD" ? "+" : "−"} {item.player_name}</span>)}</div>
        {entry.transaction.bid_amount > 0 && entry.transaction.bid_amount === biggestBid?.bid_amount && <small className="move-annotation">Biggest executed bid in this scope{!allTime && isSeasonInProgress(season) ? " so far" : ""}.</small>}
      </>}
    </article>)}</div>
    {!entries.length && <p className="activity-empty">No {tradesOnly ? "trades" : "completed moves"} match these filters.</p>}
    </div><aside className="activity-sidebar">
      {!tradesOnly && <SidePanel title="FAAB tracker">
        {!ledger.length && <p className="activity-note">FAAB is not used in the selected season scope.</p>}
        {ledger.map((row) => <div className="faab-row" key={`${row.season.year}-${row.team.team_id}`}>
          <div className="receipt-label"><span>{allTime && `${row.season.year} · `}<TeamManagerLinks season={row.season} teamId={row.team.team_id} /></span><strong>${row.spent}</strong></div>
          {row.budget !== null && row.budget > 0 && row.spent >= 0 && <progress max={row.budget} value={Math.min(row.budget, row.spent)} aria-label={`${getManagerName(row.team)} ${row.season.year}: $${row.spent} of $${row.budget} recorded spend`} />}
          <small>{row.budget === null ? "Budget unavailable · balance unknown" : `$${row.remaining} estimated remaining · $${row.budget} budget`}</small>
          {row.remaining !== null && row.remaining < 0 && <strong className="faab-warning">Recorded spend exceeds the exported budget.</strong>}
          {row.spent < 0 && <strong className="faab-warning">Recorded spend is negative; check the exported bids.</strong>}
        </div>)}
        <p className="activity-note">Executed bids only. Budget adjustments and refunds may not be exported; balances are estimates, not ESPN’s live ledger.</p>
      </SidePanel>}
      <SidePanel title={tradesOnly ? "Trade receipts" : `Waiver wire${!allTime && isSeasonInProgress(season) ? ", so far" : ""}`}>
        <div className="production-row"><span>{tradesOnly ? "Trades shown" : "Executed moves"}</span><strong>{tradesOnly ? entries.length : executed.length}</strong></div>
        {!tradesOnly && <div className="production-row"><span>Failed claims</span><strong>{failed}</strong><small>Not counted as spend or completed moves.</small></div>}
        <p className="activity-note">{tradesOnly ? "Open a trade for actual starter-production receipts and the editable keep-original scenario. No automatic fleece verdict or pretend voting." : "Free pickups can be the biggest difference-makers. Starter-production highlights are historical receipts, not forecasts."}</p>
      </SidePanel>
    </aside></ActivityLayout>
  </section>;
}
