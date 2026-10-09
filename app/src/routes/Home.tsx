import {
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
} from "react-router";
import HomePreviewNav from "../components/home/HomePreviewNav";
import {
  BetweenWeeksSection,
  PlayoffsSection,
  PreseasonSection,
  SeasonOverSection,
} from "./home/HomeStateSections";
import type { HomeLoaderData } from "./loader";
import RouteErrorPage from "./RouteErrorPage";

function Home() {
  const { homeState, preview, season } = useLoaderData() as HomeLoaderData;

  return (
    <main id="app" className="home-dashboard">
      <HomePreviewNav preview={preview} />
      {homeState.kind === "betweenWeeks" && (
        <BetweenWeeksSection season={season} state={homeState} />
      )}
      {homeState.kind === "preseason" && (
        <PreseasonSection season={season} state={homeState} />
      )}
      {homeState.kind === "playoffs" && (
        <PlayoffsSection season={season} state={homeState} />
      )}
      {homeState.kind === "seasonOver" && (
        <SeasonOverSection season={season} state={homeState} />
      )}
    </main>
  );
}

export function HomeErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const invalidValue =
      typeof error.data === "string" ? error.data : "provided";

    if (error.statusText === "Season not found") {
      return (
        <RouteErrorPage
          code="404"
          eyebrow="Season unavailable"
          title={`No season ${invalidValue}`}
          description="The season in the shared link is not available."
          linkTo="/"
          linkLabel="Back to dashboard"
        />
      );
    }

    if (error.statusText === "Week requires a season") {
      return (
        <RouteErrorPage
          code="400"
          eyebrow="Invalid shared link"
          title="Choose a season for this week"
          description={`Week ${invalidValue} can't be opened without a season. Add a season to the link and try again.`}
          linkTo="/"
          linkLabel="Back to dashboard"
        />
      );
    }

    if (
      error.statusText === "Week not found" ||
      error.statusText === "Weeks must be positive integers" ||
      error.statusText === "Selected week is out of bounds"
    ) {
      return (
        <RouteErrorPage
          code="404"
          eyebrow="Week unavailable"
          title={`No week ${invalidValue}`}
          description="The week in the shared link is not available."
          linkTo="/"
          linkLabel="Back to dashboard"
        />
      );
    }
  }

  return (
    <RouteErrorPage
      code="Error"
      eyebrow="Unable to open link"
      title="Something went wrong"
      description="We couldn't process this shared link."
      linkTo="/"
      linkLabel="Back to dashboard"
    />
  );
}

export default Home;
