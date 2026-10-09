import Home, { HomeErrorBoundary } from "./routes/Home.tsx";
import Matchup, { MatchupErrorBoundary } from "./routes/Matchup.tsx";
import NotFound from "./routes/NotFound.tsx";
import Root from "./routes/Root.tsx";
import Season from "./routes/Season.tsx";
import Week, { WeekErrorBoundary } from "./routes/Week.tsx";
import { SeasonErrorBoundary } from "./routes/Season.tsx";
import {
  defaultLoader,
  latestSeasonLoader,
  seasonLoader,
  seasonHubLoader,
  matchupDetailLoader,
  weekLoader,
} from "./routes/loader.ts";

export const routes = [
  {
    path: "/",
    Component: Root,
    children: [
      {
        index: true,
        Component: Home,
        loader: defaultLoader,
        ErrorBoundary: HomeErrorBoundary,
      },
      {
        path: "seasons",
        loader: latestSeasonLoader,
      },
      {
        path: "seasons/:season",
        loader: seasonLoader,
        ErrorBoundary: SeasonErrorBoundary,
        children: [
          {
            index: true,
            Component: Season,
            loader: seasonHubLoader,
          },
          {
            path: "weeks/:week",
            Component: Week,
            loader: weekLoader,
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
