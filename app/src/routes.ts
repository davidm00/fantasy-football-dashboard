import Home, { HomeErrorBoundary } from "./routes/Home.tsx";
import Matchup, { MatchupErrorBoundary } from "./routes/Matchup.tsx";
import NotFound from "./routes/NotFound.tsx";
import Root from "./routes/Root.tsx";
import LoadingPage from "./routes/LoadingPage.tsx";
import Season from "./routes/Season.tsx";
import Week, { WeekErrorBoundary } from "./routes/Week.tsx";
import { SeasonErrorBoundary } from "./routes/Season.tsx";
import type { ShouldRevalidateFunction } from "react-router";
import Managers, { ManagersErrorBoundary } from "./routes/Managers.tsx";
import Manager from "./routes/Manager.tsx";
import Rivalries from "./routes/Rivalries.tsx";
import Trade from "./routes/Trade.tsx";
import {
  defaultLoader,
  latestSeasonLoader,
  seasonLoader,
  seasonHubLoader,
  matchupDetailLoader,
  weekLoader,
  managersLoader,
  managerLoader,
  tradeLoader,
} from "./routes/loader.ts";

const revalidateView: ShouldRevalidateFunction = ({
  currentUrl, nextUrl, formMethod, defaultShouldRevalidate,
}) => {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname &&
      currentUrl.search !== nextUrl.search) return false;
  return defaultShouldRevalidate;
};

export const routes = [
  {
    path: "/",
    Component: Root,
    HydrateFallback: LoadingPage,
    children: [
      {
        index: true,
        Component: Home,
        loader: defaultLoader,
        ErrorBoundary: HomeErrorBoundary,
      },
      {
        path: "managers",
        Component: Managers,
        loader: managersLoader,
        shouldRevalidate: revalidateView,
        ErrorBoundary: ManagersErrorBoundary,
      },
      {
        path: "managers/rivalries",
        Component: Rivalries,
        loader: managersLoader,
        shouldRevalidate: revalidateView,
        ErrorBoundary: ManagersErrorBoundary,
      },
      {
        path: "managers/:managerId",
        Component: Manager,
        loader: managerLoader,
        shouldRevalidate: revalidateView,
        ErrorBoundary: ManagersErrorBoundary,
      },
      {
        path: "seasons",
        loader: latestSeasonLoader,
      },
      {
        path: "seasons/:season",
        loader: seasonLoader,
        shouldRevalidate: revalidateView,
        ErrorBoundary: SeasonErrorBoundary,
        children: [
          {
            index: true,
            Component: Season,
            loader: seasonHubLoader,
            shouldRevalidate: revalidateView,
          },
          {
            path: "trades/:tradeId",
            Component: Trade,
            loader: tradeLoader,
            shouldRevalidate: revalidateView,
            ErrorBoundary: ManagersErrorBoundary,
          },
          {
            path: "weeks/:week",
            Component: Week,
            loader: weekLoader,
            shouldRevalidate: revalidateView,
            ErrorBoundary: WeekErrorBoundary,
          },
          {
            path: "weeks/:week/matchups/:homeTeamId/:awayTeamId",
            Component: Matchup,
            loader: matchupDetailLoader,
            ErrorBoundary: MatchupErrorBoundary,
          },
        ],
      },
      { path: "*", Component: NotFound },
    ],
  },
];
