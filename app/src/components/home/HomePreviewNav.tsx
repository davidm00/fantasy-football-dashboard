import { Link } from "react-router";
import type { HomePreviewMode } from "../../routes/loader";

function HomePreviewNav({
  preview,
}: {
  preview: HomePreviewMode | null;
}) {
  const isLocalDevelopment =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1";

  if (!isLocalDevelopment) return null;

  const items: Array<{
    label: string;
    to: string;
    value: HomePreviewMode | null;
  }> = [
    { label: "Live", to: "/", value: null },
    { label: "Preseason", to: "/?preview=preseason", value: "preseason" },
    { label: "Playoffs", to: "/?preview=playoffs", value: "playoffs" },
    {
      label: "Season over",
      to: "/?preview=season-over",
      value: "season-over",
    },
  ];

  return (
    <nav className="home-preview-nav" aria-label="Temporary home state previews">
      <span>Temporary preview</span>
      {items.map((item) => {
        const isActive = preview === item.value;
        return (
          <Link
            key={item.label}
            to={item.to}
            className={isActive ? "active" : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default HomePreviewNav;
