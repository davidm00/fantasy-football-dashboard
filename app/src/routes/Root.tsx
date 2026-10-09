import { NavLink, Outlet, useNavigation } from "react-router";
import "../Styles.css";

function Root() {
  const navigation = useNavigation();

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
          {["Managers", "Records", "Explore"].map((item) => (
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
      <Outlet />
    </div>
  );
}

export default Root;
