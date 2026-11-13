import { Link, useLoaderData } from "react-router";
import { useMemo } from "react";
import type { Trade as TradeModel } from "../models/models";
import type { SeasonLoaderData } from "./loader";
import { getTradeScenario, recordText, resultOf } from "../utils/managerMetrics";
import { TeamManagerLinks } from "../components/season/SeasonActivity";
import { getManagerName } from "../utils/homeViewUtils";
import TradeLineupEditor from "../components/shared/TradeLineupEditor";
import SortHeader from "../components/shared/SortHeader";
import { usePageTitle } from "../hooks/usePageTitle";
import { useTableSort } from "../hooks/useTableSort";
import SidePanel from "../components/shared/SidePanel";
import ActivityLayout from "../components/shared/ActivityLayout";
import TradeReceipt from "../components/shared/TradeReceipt";
import TrendChart from "../components/shared/TrendChart";

function TradeScenarioResults({ season, teamId, scenario }: {
  season: SeasonLoaderData;
  teamId: number;
  scenario: ReturnType<typeof getTradeScenario>;
}) {
  const sorter = useTableSort(scenario.weeks, {
    week: { value: (row) => row.week },
    actual: { value: (row) => row.score, direction: "descending" },
    opponent: { value: (row) => row.opponentScore, direction: "descending" },
    optimal: { value: (row) => row.actualOptimal, direction: "descending" },
    kept: { value: (row) => row.keptOptimal, direction: "descending" },
    change: { value: (row) => row.keptOptimal === null || row.actualOptimal === null ? null : row.keptOptimal - row.actualOptimal, direction: "descending" },
    caveats: { value: (row) => [...row.issues, ...row.collision].join(" ") },
  }, { key: "week", direction: "ascending" }, `trade${teamId}`);
  return <section className="activity-view">
    <header className="activity-heading"><h2><TeamManagerLinks season={season} teamId={teamId} /></h2>
      <button type="button" className="table-reset" onClick={sorter.reset} disabled={sorter.isDefault}>Reset sort</button>
    </header>
    {scenario.laterTrades.length > 0 && <aside className="lineup-caution">
      <strong>Later trades are not undone.</strong> These players appear in {scenario.laterTrades.length} later trade(s).
      The scenario combines actual later roster changes with only this trade reversed.
    </aside>}
    <div className="manager-stat-grid">
      <article><span>Actual record · covered weeks</span><strong>{scenario.covered ? recordText(scenario.actualRecord) : "Unavailable"}</strong></article>
      <article><span>Optimal actual roster</span><strong>{scenario.covered ? recordText(scenario.actualOptimalRecord) : "Unavailable"}</strong></article>
      <article><span>Optimal keep-original roster</span><strong>{scenario.covered ? recordText(scenario.keptRecord) : "Unavailable"}</strong></article>
    </div>
    <p className="activity-note">{scenario.covered} of {scenario.weeks.length} finalized post-trade regular-season weeks covered.
      Summary records refer only to these covered weeks, not the entire season.</p>
    {scenario.weeks.length ? <div className="activity-table-shell" role="region"
      aria-label={`${getManagerName(season.teams.find(({ team_id }) => team_id === teamId))} trade scenario, scroll horizontally`} tabIndex={0}>
      <table className="activity-table"><caption>Single-trade optimal comparisons against unchanged opponents</caption>
        <thead><tr>{[["week", "Week / actual matchup"], ["actual", "Actual"], ["opponent", "Opponent"],
          ["optimal", "Optimal actual"], ["kept", "Optimal kept"], ["change", "Point change"], ["caveats", "Caveats"]].map(([key, label]) =>
          <SortHeader key={key} sortKey={key} label={label} activeKey={sorter.key} direction={sorter.direction}
            onSort={sorter.onSort} align="left" />)}</tr></thead>
        <tbody>{sorter.rows.map((game) => <tr key={game.week}>
          <th scope="row"><Link className="section-route-link activity-cta" to={`?team=${teamId}&week=${game.week}#lineup-sandbox`}>Edit Week {game.week} →</Link>
            <small><TeamManagerLinks season={season} teamId={game.opponentId} /></small><small><Link className="section-route-link activity-cta" to={game.path}>Actual matchup →</Link></small>
          </th>
          <td>{game.score.toFixed(2)} · {game.result}</td><td>{game.opponentScore.toFixed(2)}</td>
          <td>{game.actualOptimal === null ? "Unavailable" : `${game.actualOptimal.toFixed(2)} · ${resultOf(game.actualOptimal, game.opponentScore)}`}</td>
          <td>{game.keptOptimal === null ? "Unavailable" : `${game.keptOptimal.toFixed(2)} · ${resultOf(game.keptOptimal, game.opponentScore)}`}</td>
          <td>{game.keptOptimal === null || game.actualOptimal === null ? "—"
            : `${game.keptOptimal - game.actualOptimal >= 0 ? "+" : ""}${(game.keptOptimal - game.actualOptimal).toFixed(2)}`}</td>
          <td className="scenario-caveat">{game.issues.join(" ")}
            {game.collision.length > 0 && <strong>Opponent overlap: {game.collision.join(", ")}. Restored player also appears on the actual opponent;
              opponent score is unchanged, so this is not a feasible alternate-league result.</strong>}
            {!game.issues.length && !game.collision.length && "No observed opponent overlap."}
          </td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="activity-empty">No finalized full weeks after this trade yet. Check again after the next data refresh.</p>}
  </section>;
}

export default function TradePage() {
  const { season, trade } = useLoaderData() as { season: SeasonLoaderData; trade: TradeModel };
  usePageTitle(`${season.year} Week ${trade.week} trade | Ian Book Believers`);
  const scenarios = useMemo(() => trade.team_ids.map((teamId) => ({
    teamId, scenario: getTradeScenario(season, trade, teamId),
  })), [season, trade]);
  return <main className="season-hub trade-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to={`/seasons/${season.year}`}>{season.year}</Link><span>/</span>
      <Link to={`/seasons/${season.year}?tab=moves&type=trade`}>Trades</Link><span>/</span><span aria-current="page">Week {trade.week}</span>
    </nav>
    <header className="season-hub-header"><div><h1>Week {trade.week} trade</h1>
      <p>{season.year} · {trade.team_ids.map((id) => getManagerName(season.teams.find(({ team_id }) => team_id === id))).join(" / ")}</p>
    </div></header>
    <div className="trade-exchange" aria-label="Players exchanged">
      {trade.team_ids.map((teamId) => <div key={teamId}>
        <span><TeamManagerLinks season={season} teamId={teamId} /> received</span>
        <strong>{trade.items.filter(({ to_team_id }) => to_team_id === teamId).map(({ player_name }) => player_name).join(", ") || "No recorded players"}</strong>
      </div>)}
    </div>
    <p className="activity-note">One trade reversed, not a rewritten league. Opponent scores and later roster moves stay unchanged.</p>
    <ActivityLayout><div className="activity-main">
    <TradeLineupEditor season={season} trade={trade} />
    <details className="quiet-disclosure">
      <summary>How this scenario works</summary>
      <p>Compare hindsight-optimal actual rosters with hindsight-optimal rosters keeping the original players, against opponents' unchanged actual scores.</p>
      <p>Starts Week {trade.week + 1}, the first full week after this trade. Finalized regular-season weeks only; no future projections or playoff simulation.
        Later moves remain as recorded. Actual results are shown separately.</p>
      <p>These are optimal-lineup scenario records, not the record you necessarily would have achieved. Missing data is excluded, not scored as zero.
        Restored players retain observed IR/ER restrictions.</p>
      <p className="activity-note">Source: {trade.source === "espn" ? "ESPN record" : `reconstructed (${trade.source})`}</p>
    </details>
    <details className="quiet-disclosure trade-results">
      <summary>Post-trade results · optimal comparisons</summary>
      <p className="activity-note">These summaries do not change when you edit an individual week's lineup.</p>
      {scenarios.map(({ teamId, scenario }) => <TradeScenarioResults key={teamId} season={season} teamId={teamId} scenario={scenario} />)}
    </details>
    </div><aside className="activity-sidebar">
      <SidePanel title="Was this a fleece?">
        <TradeReceipt season={season} trade={trade} />
        <p className="activity-note">Who got the production is one part of the story. The editor tests what the original players could have done—not whether anyone “won” the deal.</p>
      </SidePanel>
      <SidePanel title="Optimal lineup paths">
        {scenarios.map(({ teamId, scenario }) => <section key={teamId} className="trade-path">
          <h3><TeamManagerLinks season={season} teamId={teamId} /></h3>
          <TrendChart label={`${getManagerName(season.teams.find(({ team_id }) => team_id === teamId))} optimal post-trade lineups`}
            labels={scenario.weeks.map(({ week }) => `Week ${week}`)}
            series={[{ name: "Actual roster", values: scenario.weeks.map(({ actualOptimal }) => actualOptimal) },
              { name: "Kept originals", values: scenario.weeks.map(({ keptOptimal }) => keptOptimal) }]} />
          <small>{scenario.covered}/{scenario.weeks.length} weeks covered</small>
        </section>)}
        <p className="activity-note">Hindsight-optimal weekly points, not realized trade value. Missing weeks are gaps; these graphs do not change with custom editor selections.</p>
      </SidePanel>
    </aside></ActivityLayout>
    <Link to={`/seasons/${season.year}?tab=moves&type=trade`}>Back to {season.year} trades →</Link>
  </main>;
}
