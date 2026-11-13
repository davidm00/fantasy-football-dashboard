import type { Lineup } from "../../models/models";
import SortHeader from "./SortHeader";
import { useTableSort } from "../../hooks/useTableSort";

export type RosterRow = {
  slot: string;
  player?: Lineup;
  status?: string;
};

export function RosterSlot({ slot }: { slot: string }) {
  return <span className="roster-slot" title={slot}>{slot.replace("RB/WR/TE", "FLEX")}</span>;
}

export function RosterPlayer({ player, status, align }: {
  player?: Lineup;
  status?: string;
  align?: "left" | "right";
}) {
  return <span className={`roster-player${align ? ` roster-player-${align}` : ""}`}>
    <strong>{player?.name ?? "Empty"}</strong>
    <small>{player ? `${player.position} · ${player.pro_team}` : "No player used"}
      {status && <span className="roster-player-status">{status}</span>}
    </small>
  </span>;
}

export default function RosterTable({ caption, starters, bench, onMove, move, emptyPoints = false }: {
  caption: string;
  starters: RosterRow[];
  bench?: RosterRow[];
  onMove?: (playerId: number) => void;
  move?: {
    player: Lineup;
    canMove: (destination: number | null) => boolean;
    onHere: (destination: number | null) => void;
    onCancel: () => void;
  };
  emptyPoints?: boolean;
}) {
  const sorter = useTableSort([
    ...starters.map((row, index) => ({ ...row, index, group: "starter" })),
    ...(bench ?? []).map((row, index) => ({ ...row, index, group: "bench" })),
  ], {
    slot: { value: (row) => row.index },
    player: { value: (row) => row.player?.name },
    points: { value: (row) => row.player?.points ?? (emptyPoints ? 0 : null), direction: "descending" },
  }, { key: "slot", direction: "ascending" }, "roster");
  const renderRow = (row: typeof sorter.rows[number], key: string) => {
    const player = row.player;
    const destination = row.group === "bench" ? null : row.index;
    const source = move?.player.player_id === player?.player_id;
    const here = move && !source && move.canMove(destination);
    const occurrence = starters.slice(0, row.index + 1).filter(({ slot }) => slot === row.slot).length;
    const target = destination === null ? `bench beside ${player?.name ?? "this player"}`
      : `${row.slot}${starters.filter(({ slot }) => slot === row.slot).length > 1 ? ` ${occurrence}` : ""}`;
    return <tr key={key} className={move && !here && !source ? "roster-row-unavailable" : undefined}>
    <th scope="row"><RosterSlot slot={row.slot} /></th>
    <td><RosterPlayer player={row.player} status={row.status} /></td>
    <td className="roster-points">{row.player?.points.toFixed(2) ?? (emptyPoints ? "0.00" : "—")}</td>
    {onMove && <td className="roster-action">{move
      ? <button type="button" id={player ? `roster-move-${player.player_id}` : undefined}
          data-roster-move data-roster-destination={here || undefined}
          aria-disabled={!here && !source || undefined} tabIndex={!here && !source ? -1 : undefined}
          aria-label={here ? `Move ${move.player.name} here to ${target}` : source
            ? `Cancel moving ${move.player.name}` : `${target} unavailable; cancel move`}
          onClick={() => here ? move.onHere(destination) : move.onCancel()}>
          {here ? "Here" : source ? "Cancel" : "Move"}
        </button>
      : player && !["IR", "ER"].includes(player.slot_position) &&
      <button type="button" id={`roster-move-${player.player_id}`} data-roster-move
        aria-label={`Move ${player.name}`} onClick={() => onMove(player.player_id)}>Move</button>}
    </td>}
  </tr>;
  };
  return <div className="roster-table-shell">
    <div className="roster-caption"><span>{caption}</span>
      <button type="button" aria-label="Reset roster sort" onClick={sorter.reset} disabled={sorter.isDefault}>Reset sort</button>
    </div>
    <table className="roster-table">
      <caption>{caption}</caption>
      <thead><tr>{[["slot", "Slot"], ["player", "Player"], ["points", "Pts"]].map(([key, label]) =>
        <SortHeader key={key} sortKey={key} label={label} activeKey={sorter.key} direction={sorter.direction}
          onSort={sorter.onSort} align={key === "points" ? "right" : "left"} />)}
        {onMove && <th scope="col" aria-label="Actions" />}</tr></thead>
      <tbody>{sorter.rows.filter(({ group }) => group === "starter").map((row) => renderRow(row, `starter-${row.index}`))}</tbody>
      {bench && <tbody>
        <tr className="roster-section"><td colSpan={3}>Bench <small>{bench.length} players</small></td>
          {onMove && <td className="roster-action">{move?.canMove(null) &&
            <button type="button" data-roster-destination aria-label={`Move ${move.player.name} here to bench`}
              onClick={() => move.onHere(null)}>Here</button>}</td>}
        </tr>
        {bench.length ? sorter.rows.filter(({ group }) => group === "bench").map((row) => renderRow(row, `bench-${row.player?.player_id}`))
          : <tr><td colSpan={onMove ? 4 : 3} className="roster-empty">No bench players.</td></tr>}
      </tbody>}
    </table>
  </div>;
}
