import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigation,
} from "react-router";
import "../Styles.css";
import DataFreshness from "../components/shared/DataFreshness";

function Root() {
  const navigation = useNavigation();
  const location = useLocation();
  const [copyResult, setCopyResult] = useState<{
    location: string;
    status: "copied" | "error";
  } | null>(null);
  const locationKey =
    `${location.pathname}${location.search}${location.hash}`;
  const copyStatus =
    copyResult?.location === locationKey ? copyResult.status : "idle";
  const showCopyLink = location.pathname !== "/";
  useEffect(() => {
    if (!copyResult) return;
    const timer = window.setTimeout(() => setCopyResult(null), 4000);
    return () => window.clearTimeout(timer);
  }, [copyResult]);
  useEffect(() => {
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [location.pathname, location.hash]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyResult({ location: locationKey, status: "copied" });
    } catch {
      setCopyResult({ location: locationKey, status: "error" });
    }
  };

  return (
    <div className="route-shell">
      <header className="app-nav">
        <NavLink
          className="app-brand"
          to="/"
          aria-label="Ian Book Believers home"
        >
          <span className="app-brand-mark" aria-hidden="true">
            IB
          </span>
          <span className="app-brand-copy">
            <span className="app-brand-name">Ian Book Believers</span>
            <span className="app-brand-subtitle">
              Scores, stories, and season history
            </span>
          </span>
        </NavLink>
        <nav className="app-nav-links" aria-label="Primary navigation">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/seasons">Season</NavLink>
          <NavLink to="/managers">Managers</NavLink>
          {["Records", "Explore"].map((item) => (
            <span
              key={item}
              className="app-nav-future"
              aria-disabled="true"
              title="Coming soon"
            >
              {item}
            </span>
          ))}
        </nav>
        {showCopyLink && (
          <button
            className="app-copy-link"
            type="button"
            aria-live="polite"
            onClick={copyLink}
          >
            {copyStatus === "copied"
              ? "Copied"
              : copyStatus === "error"
                ? "Unable to copy"
                : "Copy link"}
          </button>
        )}
        {navigation.state !== "idle" && (
          <div
            className="route-pending"
            role="status"
            aria-label="Loading page"
          >
            <span />
          </div>
        )}
      </header>
      <DataFreshness />
      <Outlet />
    </div>
  );
}

export default Root;
