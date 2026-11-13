import { useMemo } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import type { SeasonLoaderData } from "./loader";
import { getManagerGames, getManagerRivals, getManagers, getRivalryMeetings, recordText } from "../utils/managerMetrics";
import { SeasonDraftView, SeasonMovesView, TeamManagerLinks } from "../components/season/SeasonActivity";
import MetricTooltip from "../components/shared/MetricTooltip";
import { usePageTitle } from "../hooks/usePageTitle";
import SelectField from "../components/shared/SelectField";
import SortHeader from "../components/shared/SortHeader";
import { useTableSort } from "../hooks/useTableSort";
import TrendChart from "../components/shared/TrendChart";
import CurrentManagersFilter from "../components/shared/CurrentManagersFilter";
import RivalryList from "../components/shared/RivalryList";
import RivalryLegend from "../components/shared/RivalryLegend";
import RivalryDetail from "../components/shared/RivalryDetail";
import { useDesktopLayout } from "../hooks/useDesktopLayout";

const tabs = ["overview", "seasons", "rivals", "draft", "trades", "moves"] as const;

export default function ManagerPage() {
  const { seasons, managerId } = useLoaderData() as { seasons: SeasonLoaderData[]; managerId: string };
  const [params, setParams] = useSearchParams();
  const managers = useMemo(() => getManagers(seasons), [seasons]);
  const desktop = useDesktopLayout();
  const manager = managers.find(({ id }) => id === managerId)!;
  usePageTitle(`${manager.name} | Manager profile | Ian Book Believers`);
  const tab = tabs.find((item) => item === params.get("tab")) ?? "overview";
  const entry = manager.entries.find(({ season }) => String(season.year) === params.get("season")) ?? manager.entries.at(-1)!;
  const { season, team } = entry;
  const allTime = params.get("season") === "all";
  const scope = allTime ? "all" : String(season.year);
  const careerHistory = tab === "seasons";
  const entries = allTime || careerHistory ? [...manager.entries].reverse() : [entry];
  const luck = allTime ? manager.luck : season.metrics.teams[team.team_id]?.luck;
  const efficiency = allTime ? manager.lineupEfficiency : season.metrics.teams[team.team_id]?.lineupEfficiency;
  const metrics = season.metrics.teams[team.team_id];
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    for (const filter of ["team", "week", "type", "keepers", "pickSort"]) next.delete(filter);
    setParams(next, { flushSync: true });
  };
  const games = entries.flatMap((item) => getManagerGames(item.season, item.team.team_id).filter(({ playoff }) => allTime || !playoff).map((game) => ({ ...game, season: item.season, teamId: item.team.team_id })))
    .sort((a, b) => b.season.year - a.season.year || b.week - a.week);
  const selectedOpponent = params.get("opponent");
  const meetings = selectedOpponent ? getRivalryMeetings(entries, selectedOpponent, allTime) : [];
  const rivals = new Map(getManagerRivals(entries, allTime).map((rival) => [rival.id, rival]));
  const selectedRival = selectedOpponent ? rivals.get(selectedOpponent) : undefined;
  const visibleRivals = [...rivals.values()].filter(({ id }) => params.get("managers") === "all" || managers.some((manager) => manager.id === id && manager.active));
  const visibleSelection = selectedRival && visibleRivals.some(({ id }) => id === selectedRival.id) ? selectedRival : undefined;
  const historyRows = entries.map((item) => {
    const metric = item.season.metrics.teams[item.team.team_id];
    const ranks = Object.values(item.season.metrics.teams).sort((a, b) => b.pointsFor - a.pointsFor);
    const standing = item.season.standings.find(({ team_id }) => team_id === item.team.team_id);
    return {
      ...item, metric,
      pointsRank: metric?.weeksPlayed ? ranks.filter((other) => other.weeksPlayed > 0 && other.pointsFor > metric.pointsFor).length + 1 : null,
      finish: item.season.bracket.champion !== null && standing?.final_standing ? standing.final_standing : null,
    };
  });
  const historySort = useTableSort(historyRows, {
    year: { value: (row) => row.season.year, direction: "descending" },
    team: { value: (row) => row.team.team_name },
    record: { value: (row) => row.metric ? row.metric.record.wins + row.metric.record.ties / 2 : null, direction: "descending" },
    rank: { value: (row) => row.pointsRank },
    finish: { value: (row) => row.finish },
    luck: { value: (row) => row.metric?.luck, direction: "descending" },
  }, { key: "year", direction: "descending" }, "history");
  const chronology = [...historyRows].sort((a, b) => a.season.year - b.season.year);
  const scoringGames = [...games].reverse();
  const rankGraphic = <section className="manager-chart-panel"><h2>Points rank vs final finish</h2>
    <TrendChart label={`${manager.name}: points rank and completed-season finish`}
      labels={chronology.map(({ season }) => String(season.year))}
      rankCount={Math.max(...chronology.map(({ season }) => season.settings.team_count))}
      series={[{ name: "Points rank", values: chronology.map(({ pointsRank }) => pointsRank) },
        { name: "Final finish", values: chronology.map(({ finish }) => finish) }]} />
    <p className="activity-note">Higher on the chart is a better rank. Final finishes appear only for completed seasons.
      League sizes vary. Scoring rank versus playoff finish is historical context, not a pure schedule-luck measure.</p>
  </section>;
  return <main className="season-hub managers-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/managers">Managers</Link><span>/</span><span aria-current="page">{manager.name}</span></nav>
    <header className="season-hub-header"><div><h1>{manager.name}</h1>
      <p>{allTime || careerHistory ? `${manager.entries[0].season.year}–${manager.entries.at(-1)!.season.year} · ${manager.entries.length} seasons` : `${team.team_name} · ${season.year}`}
        {!manager.active && " · Former manager"}
        {entries.some(({ team }) => team.owners.length > 1) && " · Shared team results with co-manager"}</p>
      {manager.titleYears.length > 0 && <div className="manager-championships" role="group" aria-label="Championship seasons">
        <span>Championship seasons</span>
        {[...manager.titleYears].reverse().map((year) => <Link key={year} to={`/seasons/${year}?tab=bracket`}
          aria-label={`${manager.name}, ${year} champion; view championship bracket`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m3 7 4 4 5-8 5 8 4-4-2 11H5L3 7Z" />
            <path d="M5 21h14" />
          </svg>
          {year}
        </Link>)}
      </div>}
    </div>
      {!careerHistory && <SelectField className="season-picker" label="Season" value={scope} onChange={(value) => update("season", value)}
        options={[{ value: "all", label: "All time" }, ...[...manager.entries].reverse().map(({ season }) => ({ value: String(season.year), label: String(season.year) }))]} />}
    </header>
    <nav className="season-tabs manager-tabs" aria-label="Manager sections">{tabs.map((item) => <Link key={item}
      aria-current={tab === item ? "page" : undefined}
      to={item === "seasons" ? "?tab=seasons" : `?season=${scope}${item === "overview" ? "" : `&tab=${item}`}`}>
      {item.charAt(0).toUpperCase() + item.slice(1)}
    </Link>)}</nav>
    {tab === "overview" && <>
      <aside className="manager-story">
        <strong>{allTime ? "A career with receipts." : metrics?.selfInflictedLosses.length ? "The bench has receipts." : luck != null && luck < -1 ? "Points don’t always buy wins." : "The record has a story."}</strong>
        <p>{allTime ? `${manager.games} finalized regular-season games and ${manager.titles} ${manager.titles === 1 ? "title" : "titles"} from completed seasons.`
          : metrics?.selfInflictedLosses.length ? `${metrics.selfInflictedLosses.length} losses would have flipped with a hindsight-optimal lineup, against the opponent’s unchanged actual score.`
          : metrics?.weeksPlayed ? `Scoring rank ${historyRows[0].pointsRank} · ${recordText(metrics.record)} record. ${luck != null ? `Schedule luck: ${luck >= 0 ? "+" : ""}${luck.toFixed(1)} win equivalents.` : ""}` : "The story starts once games are finalized."}</p>
        <Link className="section-route-link activity-cta" to="?tab=seasons">Season-by-season receipts →</Link>
      </aside>
      <div className="manager-stat-grid">
        <article><span>{allTime ? "All-time" : season.year} regular-season record</span><strong>{allTime ? recordText(manager.record) : metrics ? recordText(metrics.record) : "Unavailable"}</strong></article>
        <article><span>{allTime ? "Championships · completed seasons" : `${season.year} all-play record`}</span><strong>{allTime ? manager.titles : metrics ? recordText(metrics.allPlayRecord) : "Unavailable"}</strong></article>
        <article><span>Schedule luck <MetricTooltip label="Schedule luck">{`Schedule luck measures how much your actual record benefited or suffered from which opponents you faced, holding everyone’s actual weekly scores fixed. Actual win equivalents minus all-play expected wins.${allTime ? " All time sums the individual season totals, using each season's opponents." : ""}`}</MetricTooltip></span><strong>{luck == null ? "Unavailable" : `${luck >= 0 ? "+" : ""}${luck.toFixed(1)} wins`}</strong></article>
        <article><span>Lineup efficiency <MetricTooltip label="Lineup efficiency">{allTime
          ? "Total actual starter points divided by total hindsight-optimal lineup points across finalized regular-season weeks in all seasons. This is points-weighted, not an average of season percentages."
          : "Actual starter points divided by hindsight-optimal lineup points across finalized regular-season weeks."}</MetricTooltip></span>
          <strong>{efficiency == null ? "Unavailable" : `${efficiency.toFixed(1)}%`}</strong></article>
      </div>
      <div className="manager-grid">
        <Link className="manager-card" to={`?season=${scope}&tab=trades`}><h2>Trade scenarios</h2><p>Explore lineups with a single trade reversed.</p><strong>Explore trades →</strong></Link>
        <Link className="manager-card" to={`?season=${scope}&tab=draft`}><h2>Draft receipts</h2><p>Recorded picks, keepers and actual starter production.</p><strong>View draft →</strong></Link>
        <Link className="manager-card" to={`?season=${scope}&tab=rivals`}><h2>Rivalries</h2><p>Head-to-head records, playoff meetings and trades together.</p><strong>Meet the rivals →</strong></Link>
      </div>
      <div className="manager-chart-grid">{allTime ? rankGraphic : <section className="manager-chart-panel"><h2>{season.year} weekly scoring rank</h2>
        <TrendChart label={`${manager.name}: ${season.year} weekly scoring ranks`} labels={metrics?.weeklyRanks.map(({ week }) => `W${week}`) ?? []}
          rankCount={season.settings.team_count} series={[{ name: "Weekly rank", values: metrics?.weeklyRanks.map(({ rank }) => rank) ?? [] }]} />
        <p className="activity-note">Where this team ranked in each finalized regular-season week. Higher is better; no future weeks or projections.</p>
      </section>}
        <section className="manager-chart-panel"><h2>Scoring race</h2>
          <TrendChart label={`${manager.name}: actual scores versus opponents`}
            labels={scoringGames.map((game) => `${game.season.year} W${game.week}${game.playoff ? " playoffs" : ""}`)}
            series={[{ name: manager.name, values: scoringGames.map(({ score }) => score) },
              { name: "Opponent", values: scoringGames.map(({ opponentScore }) => opponentScore) }]} />
          <p className="activity-note">{allTime ? "Actual finalized scores, including labeled playoff meetings." : `${season.year} finalized regular-season scores.`} Open any matchup below for lineup context.</p>
        </section>
      </div>
      <section className="activity-view"><h2>{allTime ? "All-time" : season.year} finalized games</h2>
        <p className="activity-note">Newest first. Unfinished games are excluded. {allTime ? "Playoff games are labeled and do not change the regular-season record." : "Regular-season meetings only."}</p>
        <div className="activity-feed">{games.map((game) => <article className="activity-item" key={`${game.season.year}-${game.week}`}>
          <h3>{allTime && `${game.season.year} `}Week {game.week}{game.playoff && " · Playoffs"} · {game.result} vs <TeamManagerLinks season={game.season} teamId={game.opponentId} /></h3>
          <p>{game.score.toFixed(2)} – {game.opponentScore.toFixed(2)}</p>
          {game.season.metrics.teams[game.teamId]?.selfInflictedLosses.includes(game.week) &&
            <small className="move-annotation">Bench blunder: a hindsight-optimal lineup would have flipped this loss.</small>}
          <Link to={game.path}>Open matchup →</Link>
        </article>)}</div>
        {!games.length && <p className="activity-empty">No finalized games for this season yet.</p>}
      </section>
    </>}
    {tab === "seasons" && <section className="activity-view"><header className="activity-heading"><h2>Season history</h2>
      <button type="button" className="table-reset" onClick={historySort.reset} disabled={historySort.isDefault}>Reset sort</button></header>
      {rankGraphic}
      <div className="activity-table-shell" role="region" aria-label="Manager season history" tabIndex={0}><table className="activity-table">
        <caption>{manager.name}: finalized regular-season history</caption>
        <thead><tr>{[["year", "Season"], ["team", "Team"], ["record", "Record"], ["rank", "Points rank"],
          ["finish", "Final finish"], ["luck", "Schedule luck"]].map(([key, label]) =>
          <SortHeader key={key} sortKey={key} label={label} activeKey={historySort.key}
            direction={historySort.direction} onSort={historySort.onSort} align="left" />)}</tr></thead>
        <tbody>{historySort.rows.map(({ season: history, team: historyTeam, metric, pointsRank, finish }) => {
          return <tr key={history.year}><th scope="row"><Link to={`/seasons/${history.year}`}>{history.year} →</Link></th><td>{historyTeam.team_name}</td>
            <td>{metric ? recordText(metric.record) : "Unavailable"}</td><td>{pointsRank ?? "—"}</td>
            <td>{finish ?? "Season not completed"}</td>
            <td>{metric?.luck.toFixed(1) ?? "—"}</td></tr>;
        })}</tbody>
      </table></div>
    </section>}
    {tab === "rivals" && <section className="activity-view"><header className="activity-heading"><h2>{allTime ? "All-time" : season.year} head-to-head</h2>
      <Link className="section-route-link activity-cta" to={`/managers/rivalries?season=${scope}`}>Open league grid →</Link></header>
      <p className="activity-note">{allTime ? "Finalized regular season and playoffs" : `${season.year} finalized regular season only`}, attributed to the managers who owned each team in that season.</p>
      <div className="activity-controls"><CurrentManagersFilter /></div>
      <div className="rivalries-layout"><section className="rivalry-grid-panel">
        <RivalryList showVersus managerName={manager.name} rivals={visibleRivals} selectedId={selectedOpponent} href={(id) => {
          const next = new URLSearchParams(params);
          next.set("season", scope);
          next.set("tab", "rivals");
          next.set("opponent", id);
          return `?${next.toString()}${desktop ? "" : "#rival-meetings"}`;
        }} />
        <RivalryLegend />
      </section><section className="rivalry-detail" id="rival-meetings" aria-label="Selected rivalry">
        {visibleSelection ? <RivalryDetail manager={manager} rival={visibleSelection} meetings={meetings} scope={scope} /> : <>
          <h2>{selectedOpponent ? "Rivalry not available in this view" : "Choose an opponent"}</h2>
          <p className="activity-note">{selectedOpponent ? "This opponent is excluded by the current filter or has no meetings in the selected season. Change scope or include former managers."
            : "Select a colored record to see every meeting and the story behind it."}</p>
        </>}
      </section></div>
    </section>}
    {(tab === "draft" || tab === "trades" || tab === "moves") && (allTime
      ? tab === "draft" ? <SeasonDraftView entries={entries} />
        : <SeasonMovesView entries={entries} tradesOnly={tab === "trades"} />
      : tab === "draft" ? <SeasonDraftView key={season.year} season={season} teamId={team.team_id} />
      : <SeasonMovesView key={`${season.year}-${tab}`} season={season} teamId={team.team_id} tradesOnly={tab === "trades"} />)}
  </main>;
}
