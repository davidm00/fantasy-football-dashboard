import { Link } from "react-router";

type RouteErrorPageProps = {
  code: string;
  eyebrow: string;
  title: string;
  description: string;
  linkTo: string;
  linkLabel: string;
  retry?: boolean;
};

function RouteErrorPage({
  code,
  eyebrow,
  title,
  description,
  linkTo,
  linkLabel,
  retry = false,
}: RouteErrorPageProps) {
  return (
    <main className="route-page route-state-page">
      <section className="route-error" role="alert" aria-labelledby="route-error-title">
        <span className="route-error-code" aria-hidden="true">
          {code}
        </span>
        <div className="route-error-content">
          <span className="route-error-eyebrow">{eyebrow}</span>
          <h1 id="route-error-title">{title}</h1>
          <p>{description}</p>
          <div className="route-error-actions">
            {retry && (
              <button
                className="route-error-link"
                type="button"
                onClick={() => window.location.reload()}
              >
                Retry this page
              </button>
            )}
            <Link className={retry ? "home-secondary-link" : "route-error-link"} to={linkTo}>
              {linkLabel}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default RouteErrorPage;
