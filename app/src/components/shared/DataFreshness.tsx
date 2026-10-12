import lastExport from "../../data/last_export.json";

const updatedAt = new Date(lastExport.pulled_at);
const formattedUpdatedAt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
}).format(updatedAt);

function DataFreshness() {
  return (
    <aside className="data-freshness" aria-label="Data freshness">
      <p>
        Scores updated{" "}
        <time dateTime={lastExport.pulled_at}>{formattedUpdatedAt}</time>
      </p>
      <p>
        Snapshot data, not a live feed. Scheduled refreshes follow game nights.
        Records include finalized games only.
      </p>
    </aside>
  );
}

export default DataFreshness;
