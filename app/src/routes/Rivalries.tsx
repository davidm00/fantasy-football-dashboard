import { useMemo } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import type { SeasonLoaderData } from "./loader";
import { getManagerRivals, getManagers, getRivalryMeetings, recordText } from "../utils/managerMetrics";
import { usePageTitle } from "../hooks/usePageTitle";
import { useTableSort, type SortColumn } from "../hooks/useTableSort";
import SelectField from "../components/shared/SelectField";
import SortHeader from "../components/shared/SortHeader";
import ManagerDirectoryTabs from "../components/shared/ManagerDirectoryTabs";
import CurrentManagersFilter from "../components/shared/CurrentManagersFilter";
import RivalryRecord from "../components/shared/RivalryRecord";
import RivalryLegend from "../components/shared/RivalryLegend";
import RivalryDetail from "../components/shared/RivalryDetail";
import RivalryList from "../components/shared/RivalryList";
import { useDesktopLayout } from "../hooks/useDesktopLayout";

export default function Rivalries() {
  const seasons = useLoaderData() as SeasonLoaderData[];
  usePageTitle("Rivalries | Ian Book Believers");
  const [params, setParams] = useSearchParams();
  const selectedSeason = seasons.find(({ year }) => String(year) === params.get("season"));
  const scope = selectedSeason ? String(selectedSeason.year) : "all";
  const currentOnly = params.get("managers") !== "all";
  const desktop = useDesktopLayout();
  const managers = useMemo(() => getManagers(seasons).map((manager) => ({
    ...manager, entries: manager.entries.filter(({ season }) => scope === "all" || String(season.year) === scope),
  })).filter(({ entries, active }) => entries.length && (!currentOnly || active))
    .sort((a, b) => a.name.localeCompare(b.name)), [seasons, scope, currentOnly]);
  const rows = useMemo(() => managers.map((manager) => ({
    ...manager, rivals: new Map(getManagerRivals(manager.entries, scope === "all").map((rival) => [rival.id, rival])),
  })), [managers, scope]);
  type Row = (typeof rows)[number];
  const columns: Record<string, SortColumn<Row>> = { name: { value: (row) => row.name } };
  for (const manager of managers) columns[manager.id] = {
    value: (row) => {
      const rival = row.rivals.get(manager.id);
      return rival ? (rival.wins + rival.ties / 2) / rival.games : null;
    }, direction: "descending",
  };
  const sorter = useTableSort(rows, columns, { key: "name", direction: "ascending" }, "rivals");
  const list = params.get("layout") === "list";
  const selected = rows.find(({ id }) => id === params.get("manager"));
  const listManager = selected ?? (params.has("manager") ? undefined : rows[0]);
  const opponentId = params.get("opponent");
  const opponent = managers.find(({ id }) => id === opponentId);
  const selectedRival = selected && opponentId && opponent ? selected.rivals.get(opponentId) : undefined;
  const meetings = selected && selectedRival ? getRivalryMeetings(selected.entries, selectedRival.id, scope === "all") : [];
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { flushSync: true, preventScrollReset: true });
  };
  const path = (id: string, opponent: string) => {
    const next = new URLSearchParams(params);
    next.set("manager", id);
    next.set("opponent", opponent);
    return `?${next.toString()}${desktop ? "" : "#rivalry-detail"}`;
  };
  return <main className="season-hub managers-page">
    <header className="season-hub-header"><div><h1>Rivalries</h1><p>Read across a row: that manager’s record against each opponent.</p></div>
      <SelectField label="Season" value={scope} onChange={(value) => update("season", value === "all" ? "" : value)}
        options={[{ value: "all", label: "All time" }, ...[...seasons].sort((a, b) => b.year - a.year).map(({ year }) => ({ value: String(year), label: String(year) }))]} />
    </header>
    <ManagerDirectoryTabs />
    <div className="activity-controls">
      <div className="season-view-toggle" role="group" aria-label="Rivalry layout">
        <button type="button" aria-pressed={!list} onClick={() => update("layout", "")}>Grid</button>
        <button type="button" aria-pressed={list} onClick={() => update("layout", "list")}>List</button>
      </div>
      <CurrentManagersFilter />
      {list && <SelectField label="Manager" value={listManager?.id ?? ""} onChange={(value) => update("manager", value)}
        options={managers.map(({ id, name }) => ({ value: id, label: name }))} />}
      {!list && <button type="button" onClick={sorter.reset} disabled={sorter.isDefault}>Reset sort</button>}
    </div>
    <p className="activity-note">{scope === "all" ? "All-time · Finalized regular season and playoffs." : `${scope} · Finalized regular season only.`} Co-managers share results; franchise ownership changes remain separate.</p>
    <div className="rivalries-layout"><section className="rivalry-grid-panel"><h2>Head-to-head {list ? "records" : "grid"}</h2>
    {list ? listManager ? <RivalryList managerName={listManager.name} rivals={[...listManager.rivals.values()].filter(({ id }) => managers.some((manager) => manager.id === id))}
      selectedId={opponentId} href={(id) => path(listManager.id, id)} /> : <p className="activity-empty">Choose an available manager for this scope.</p>
      : <div className="rivalry-grid-shell" role="region" aria-label="Head-to-head rivalry grid, scroll horizontally for opponents" tabIndex={0}>
      <table className="activity-table rivalry-grid"><caption>{scope === "all" ? "All-time" : scope} head-to-head · click a record for every meeting</caption>
        <thead><tr><SortHeader sortKey="name" label="Manager" activeKey={sorter.key} direction={sorter.direction} onSort={sorter.onSort} align="left" />
          {managers.map(({ id, name }) => <SortHeader key={id} sortKey={id} label={name} activeKey={sorter.key}
            direction={sorter.direction} onSort={sorter.onSort} />)}
        </tr></thead>
        <tbody>{sorter.rows.map((row) => <tr key={row.id}><th scope="row"><Link to={`/managers/${row.id}?season=${scope}`}>{row.name}</Link>{!row.active && <small>Former</small>}</th>
          {managers.map(({ id, name }) => {
            const rival = row.rivals.get(id);
            return <td key={id}>
              {rival ? <RivalryRecord record={rival} to={path(row.id, id)} label={`${row.name} vs ${name}: ${recordText(rival)}; view ${rival.games} meetings`}
                selected={selected?.id === row.id && opponentId === id} />
                : <span className="rivalry-blank" aria-label={row.id === id ? "Same manager" : `No meetings between ${row.name} and ${name}`}>{row.id === id ? "" : "—"}</span>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>}
    <RivalryLegend />
    <p className="activity-note">Select a colored record to see that rivalry. Scroll for more columns, or switch to List.
      Color is recorded win percentage, not a forecast; ties count as half a win. — means no meetings.</p>
    </section><section className="rivalry-detail" id="rivalry-detail" aria-label="Selected rivalry">
      {selected && selectedRival ? <RivalryDetail manager={selected} rival={selectedRival} meetings={meetings} scope={scope} /> : <>
        <h2>{params.has("opponent") ? "Rivalry not available in this view" : "Choose a rivalry"}</h2>
        <p className="activity-note">{params.has("opponent") ? "The linked pair has no meetings in this scope, or a manager is excluded by the current filter. Change season or uncheck Current managers only."
          : "Select any colored record to see who leads, the average margin, and every actual meeting."}</p>
      </>}
    </section></div>
  </main>;
}
