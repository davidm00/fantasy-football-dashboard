import { NavLink } from "react-router";

export default function ManagerDirectoryTabs() {
  return <nav className="season-tabs manager-tabs" aria-label="Manager directory views">
    <NavLink to="/managers" end>Standings</NavLink>
    <NavLink to="/managers/rivalries">Rivalries</NavLink>
  </nav>;
}
