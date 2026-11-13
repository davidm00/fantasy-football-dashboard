import { useMemo } from "react";
import { Link, isRouteErrorResponse, useLoaderData, useRouteError, useSearchParams } from "react-router";
import type { SeasonLoaderData } from "./loader";
import { getManagers, recordText } from "../utils/managerMetrics";
import RouteErrorPage from "./RouteErrorPage";
import { usePageTitle } from "../hooks/usePageTitle";
import SelectField from "../components/shared/SelectField";
import SortHeader from "../components/shared/SortHeader";
import { useTableSort } from "../hooks/useTableSort";
import InsightCard from "../components/shared/InsightCard";
import ManagerDirectoryTabs from "../components/shared/ManagerDirectoryTabs";

export function ManagersErrorBoundary() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return <RouteErrorPage code={missing ? "404" : "Error"} eyebrow="Managers"
    title={missing ? "That manager or trade was not found" : "Unable to load manager history"}
    description={missing ? "Choose an available manager or season to continue." : "The league data could not be loaded. Retry this page."}
    linkTo="/managers" linkLabel="All managers" retry={!missing} />;
}

export default function Managers() {
  const seasons = useLoaderData() as SeasonLoaderData[];
  usePageTitle("Managers | Ian Book Believers");
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const cards = params.get("layout") === "cards";
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: key === "q", flushSync: true });
  };
  const allManagers = useMemo(() => getManagers(seasons), [seasons]);
  const base = allManagers.filter(({ name }) => name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.games - a.games || a.name.localeCompare(b.name));
  const sorter = useTableSort(base, {
    name: { value: (row) => row.name },
    seasons: { value: (row) => row.entries.length, direction: "descending" },
    record: { value: (row) => row.record.wins + row.record.ties / 2, direction: "descending" },
    winRate: { value: (row) => row.winRate, direction: "descending" },
    titles: { value: (row) => row.titles, direction: "descending" },
    playoffs: { value: (row) => row.playoffSeasons, direction: "descending" },
    finish: { value: (row) => row.averageFinish },
    points: { value: (row) => row.pointsPerGame, direction: "descending" },
  }, { key: "winRate", direction: "descending" }, "");
  const managers = sorter.rows;
  const longest = Math.max(...allManagers.map(({ entries }) => entries.length));
  const titles = Math.max(...allManagers.map(({ titles }) => titles));
  const champions = allManagers.filter((manager) => manager.titles === titles && titles > 0);
  return <main className="season-hub managers-page">
    <header className="season-hub-header"><div><h1>Managers</h1>
      <p>{Math.min(...seasons.map(({ year }) => year))}–{Math.max(...seasons.map(({ year }) => year))} · Explore each manager’s seasons, rivals and roster decisions.</p>
    </div></header>
    <ManagerDirectoryTabs />
    <div className="insight-grid" role="region" aria-label="League history highlights" tabIndex={0}>
      <InsightCard label="League lifers" value={`${longest} seasons`} note={`${allManagers.filter(({ entries }) => entries.length === longest).length} managers share the longest history.`} />
      <InsightCard label="Trophy cabinet" value={champions.map(({ name }) => name).join(" / ") || "Awaiting completed titles"} note={`${titles} ${titles === 1 ? "title" : "titles"} at the top · completed seasons only; co-managers share results.`} />
      <InsightCard label="Still in the story" value={`${allManagers.filter(({ active }) => active).length} current managers`} note={`${allManagers.filter(({ active }) => !active).length} former managers remain in league history.`} />
    </div>
    <div className="activity-controls">
      <label>Find a manager<input type="search" value={query} onChange={(event) => update("q", event.target.value)} placeholder="Manager name" /></label>
      {cards && <SelectField label="Sort managers" value={sorter.key} onChange={(value) => sorter.setSort(value)}
        options={[{ value: "winRate", label: "Win percentage" }, { value: "titles", label: "Championships" }, { value: "name", label: "Name" },
          { value: "seasons", label: "Seasons" }, { value: "record", label: "Wins" }, { value: "playoffs", label: "Playoff seasons" },
          { value: "finish", label: "Average finish" }, { value: "points", label: "Points/game" }]} />}
      <div className="season-view-toggle" role="group" aria-label="Manager layout">
        <button type="button" aria-pressed={!cards} onClick={() => update("layout", "")}>Table</button>
        <button type="button" aria-pressed={cards} onClick={() => update("layout", "cards")}>Cards</button>
      </div>
      <button type="button" onClick={sorter.reset} disabled={sorter.isDefault}>Reset sort</button>
      {query && <button type="button" onClick={() => update("q", "")}>Clear search</button>}
    </div>
    {cards ? <div className="manager-grid">{managers.map((manager) => {
      const latest = manager.entries.at(-1)!;
      return <Link className="manager-card" key={manager.id} to={`/managers/${manager.id}`}>
        <small>{manager.active ? latest.team.team_name : `Former · last played ${latest.season.year}`}</small>
        <h2>{manager.name}</h2>
        <span>{manager.entries.length} seasons · {recordText(manager.record)} · {manager.winRate === null ? "No finalized games" : `${(manager.winRate * 100).toFixed(1)}% wins`}</span>
        <span>{manager.titles} {manager.titles === 1 ? "title" : "titles"} · {manager.pointsPerGame?.toFixed(1) ?? "—"} points/game</span>
        <strong>View profile →</strong>
      </Link>;
    })}</div> : <div className="activity-table-shell" role="region" aria-label="Manager standings, scroll horizontally for all columns" tabIndex={0}>
      <table className="activity-table manager-table"><caption>All-time manager standings · open a manager name for their profile</caption>
        <thead><tr>{[
          ["name", "Manager / profile"], ["seasons", "Seasons"], ["record", "Record"], ["winRate", "Win %"],
          ["titles", "Titles"], ["playoffs", "Playoff seasons"], ["finish", "Average finish"], ["points", "Points/game"],
        ].map(([key, label]) => <SortHeader key={key} sortKey={key} label={label} activeKey={sorter.key}
          direction={sorter.direction} onSort={sorter.onSort} align="left" />)}</tr></thead>
        <tbody>{managers.map((manager) => <tr key={manager.id}>
          <th scope="row"><Link className="manager-profile-link" to={`/managers/${manager.id}`}>{manager.name}<span>View profile →</span></Link>
            <small>{manager.active ? manager.entries.at(-1)?.team.team_name : `Former · last played ${manager.entries.at(-1)?.season.year}`}</small>
            {manager.entries.some(({ team }) => team.owners.length > 1) && <small>Includes co-managed seasons</small>}
          </th><td>{manager.entries.length}</td><td>{recordText(manager.record)}</td>
          <td>{manager.winRate === null ? "—" : `${(manager.winRate * 100).toFixed(1)}%`}</td><td>{manager.titles}</td>
          <td>{manager.playoffSeasons}</td><td>{manager.averageFinish?.toFixed(1) ?? "—"}<small>{manager.completedSeasons} completed seasons</small></td>
          <td>{manager.pointsPerGame?.toFixed(1) ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {!managers.length && <p className="activity-empty" role="status">No managers match “{query}”. Clear the search to see everyone.</p>}
    <details className="quiet-disclosure"><summary>How these records are counted</summary>
      <p className="activity-note">Records and points use finalized regular-season games. Titles and average finish use completed seasons only.
        Co-managers share team results. Former managers remain in the history. Higher scoring across different season rules is not a skill ranking.</p>
    </details>
  </main>;
}
