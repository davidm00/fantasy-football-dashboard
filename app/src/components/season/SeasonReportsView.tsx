import { Link } from "react-router";
import type { Report } from "../../data/reportsList";

const formatFileSize = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;

function SeasonReportsView({
  year,
  reports,
}: {
  year: number;
  reports: Report[];
}) {
  const sortedReports = [...reports].sort(
    (left, right) => right.week - left.week,
  );

  return (
    <section className="season-reports-view" aria-labelledby="season-reports">
      <header>
        <div>
          <h2 id="season-reports">Report archive</h2>
          <p>
            {sortedReports.length
              ? `${sortedReports.length} weekly ${
                  sortedReports.length === 1 ? "report" : "reports"
                } from the ${year} season.`
              : `No weekly reports are available for the ${year} season.`}
          </p>
        </div>
      </header>

      {sortedReports.length > 0 && (
        <div className="season-report-grid">
          {sortedReports.map((report) => (
            <article className="season-report-card" key={report.week}>
              <span className="home-eyebrow">Week {report.week}</span>
              <h3>{report.title}</h3>
              <p>
                {report.pageCount}{" "}
                {report.pageCount === 1 ? "page" : "pages"} ·{" "}
                {formatFileSize(report.fileSize)}
              </p>
              <div className="season-report-actions">
                <a
                  className="route-error-link"
                  href={report.path}
                  target="_blank"
                  rel="noopener"
                >
                  Read report
                </a>
                <a href={report.path} download>
                  Download PDF
                </a>
                <Link to={`/seasons/${year}/weeks/${report.week}`}>
                  View week
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default SeasonReportsView;
