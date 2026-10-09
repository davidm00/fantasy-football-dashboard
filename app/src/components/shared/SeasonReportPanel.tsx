import type { Report } from "../../data/reportsList";

const formatFileSize = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;

function SeasonReportPanel({
  report,
  eyebrow,
}: {
  report: Report | undefined;
  eyebrow: string;
}) {
  return (
    <section className="home-panel home-report">
      <span className="home-eyebrow">{eyebrow}</span>
      {report ? (
        <>
          <h2>{report.title}</h2>
          <p>
            Week {report.week} · {report.pageCount}{" "}
            {report.pageCount === 1 ? "page" : "pages"} ·{" "}
            {formatFileSize(report.fileSize)}
          </p>
          <div className="home-report-actions">
            <a
              className="route-error-link"
              href={report.path}
              target="_blank"
              rel="noopener"
            >
              Read report
            </a>
            <a className="home-secondary-link" href={report.path} download>
              Download PDF
            </a>
          </div>
        </>
      ) : (
        <>
          <h2>No report available</h2>
          <p>A report has not been published for this stage of the season.</p>
        </>
      )}
    </section>
  );
}

export default SeasonReportPanel;
