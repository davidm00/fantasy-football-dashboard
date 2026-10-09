import { Link } from "react-router";

type RouteErrorPageProps = {
  code: string;
  eyebrow: string;
  title: string;
  description: string;
  linkTo: string;
  linkLabel: string;
};

function RouteErrorPage({
  code,
  eyebrow,
  title,
  description,
  linkTo,
  linkLabel,
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
          <Link className="route-error-link" to={linkTo}>
            {linkLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}

export default RouteErrorPage;
