import type { SeasonSuperlative } from "../../utils/metrics";
import MetricCard from "../shared/MetricCard";

function SeasonSuperlatives({
  title,
  items,
}: {
  title: string;
  items: SeasonSuperlative[];
}) {
  return (
    <section className="home-finish-section">
      <h2>{title}</h2>
      <div className="home-finish-grid">
        {items.map((item) => (
          <MetricCard
            key={item.label}
            metric={item}
            className="home-finish-card"
          />
        ))}
      </div>
    </section>
  );
}

export default SeasonSuperlatives;
