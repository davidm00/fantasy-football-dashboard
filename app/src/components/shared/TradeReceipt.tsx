import { useMemo } from "react";
import type { Trade } from "../../models/models";
import type { SeasonLoaderData } from "../../routes/loader";
import { getTradeReceipts } from "../../utils/managerMetrics";
import TeamManagerLinks from "./TeamManagerLinks";

export default function TradeReceipt({ season, trade }: { season: SeasonLoaderData; trade: Trade }) {
  const receipts = useMemo(() => getTradeReceipts(season, trade), [season, trade]);
  const maximum = Math.max(1, ...receipts.map(({ points }) => Math.abs(points ?? 0)));
  return <div className="trade-receipt">
    {receipts.map((receipt) => <div key={receipt.teamId}>
      <div className="receipt-label"><TeamManagerLinks season={season} teamId={receipt.teamId} />
        <strong>{receipt.points === null ? "Unavailable" : `${receipt.points.toFixed(1)} pts`}</strong></div>
      {receipt.points !== null && <div className="receipt-track" aria-hidden="true"><i style={{ width: `${Math.abs(receipt.points) / maximum * 100}%` }} /></div>}
      <small>{receipt.covered}/{receipt.weeks} full weeks covered{receipt.covered < receipt.weeks && " · incomplete lineup coverage"}</small>
    </div>)}
    <p className="activity-note">Received players’ actual starter points for the receiving team, from Week {trade.week + 1}.
      Finalized regular season only; later moves stay in place. Usage receipts, not a full trade-value verdict.</p>
  </div>;
}
