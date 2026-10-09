import RouteErrorPage from "./RouteErrorPage";

function NotFound() {
  return (
    <RouteErrorPage
      code="404"
      eyebrow="Page not found"
      title="This page is out of bounds"
      description="The page you requested doesn't exist or may have moved. Head home to get back to the league."
      linkTo="/"
      linkLabel="Back to home"
    />
  );
}

export default NotFound;
