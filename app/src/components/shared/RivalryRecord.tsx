import { Link } from "react-router";
import { recordText } from "../../utils/managerMetrics";

export type RivalryRecordData = { wins: number; losses: number; ties: number; games: number };

export default function RivalryRecord({ record, to, label, selected = false }: {
  record: RivalryRecordData;
  to: string;
  label: string;
  selected?: boolean;
}) {
  const rate = (record.wins + record.ties / 2) / record.games;
  const heat = rate >= 0.7 ? "owns" : rate > 0.5 ? "ahead" : rate === 0.5 ? "even" : rate > 0.3 ? "behind" : "owned";
  return <Link className={`rivalry-heat rivalry-heat-${heat}`} to={to} aria-label={label}
    aria-current={selected ? "true" : undefined} preventScrollReset
    onClick={(event) => {
      const anchor = to.split("#")[1];
      if (anchor && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey)
        requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }));
    }}>{recordText(record)}</Link>;
}
