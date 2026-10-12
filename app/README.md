# Ian Book Believers dashboard

## Development and validation

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
npm run test:previews
```

Scores are committed snapshots, not a live feed. The global update timestamp
comes from `src/data/last_export.json`. Scheduled exports follow game nights;
in-progress metrics are provisional, and outcome awards wait for final scores.
Standings and matchup records exclude playoff games. Historical bracket rounds
come from each season's settings and bracket data.

Best-possible lineups are hindsight-optimal. Orange markers identify **every**
player added to the starting lineup, and displaced starters are labeled on the
bench. Teal summaries identify a whole set of changes that would turn a final
loss into a win with the opponent's actual lineup held unchanged. They do not
claim that an individual substitution caused the result.
Best-possible lineups are available only after the week is final. Pending and
in-progress matchups retain actual lineups; weekly lineup efficiency and points
left on bench remain unavailable until final scores, rather than treating
players awaiting kickoff as zero-point missed opportunities.

## Link previews and deployment

`npm run build` runs TypeScript, Vite, then
`scripts/generate-link-previews.mjs`. It generates crawler-readable HTML and
1200x630 PNG cards for seasons, weeks, and matchups with available box scores.
Byes and future games without a box score do not get misleading matchup pages.
Image filenames are content-hashed so updated scores receive a new image URL.

Vercel must use `app/` as its project root. The configuration runs the full
build, serves `dist/`, and resolves generated `.html` files through clean URLs
before the extensionless SPA fallback. `SITE_URL` can override the canonical
site origin; it defaults to `https://ian-book-believers.vercel.app`.

`npm run test:previews` verifies every generated route, metadata URL, PNG
dimension, and React entrypoint. Vite's local preview server does not implement
Vercel clean URLs: use `/seasons/2025.html` to inspect generated metadata locally.
After deployment, check extensionless URLs and PNG content types with `curl`;
social platforms may cache older page metadata until they re-scrape the URL.

### Vercel CLI troubleshooting

Use the CLI without a global installation:

```sh
npx --yes vercel@latest login
npx --yes vercel@latest whoami
npx --yes vercel@latest project inspect ian-book-believers --scope davidm00s-projects
npx --yes vercel@latest list ian-book-believers --scope davidm00s-projects
npx --yes vercel@latest inspect https://ian-book-believers.vercel.app --scope davidm00s-projects
```

Complete login in your normal browser. To read a deployment's build logs, run
`npx --yes vercel@latest inspect <deployment-url> --logs --scope davidm00s-projects`.
Check Vercel's deployment history directly: GitHub deployment records may not
reflect deployments created manually in Vercel.

If pushes do not create deployments, verify the connected repository, production
branch (`main`), GitHub App permissions, account login connection, and build-skip
settings. Empty commits are not a reliable trigger test when unaffected projects
can be skipped; use an actual change within `app/` and confirm the deployed SHA.
Redeploying an old deployment may rebuild its old commit rather than latest
`main`. CLI production deployment is separate from these inspection commands;
link the existing project from the repository root before deploying, so its
configured `app/` root directory is respected.

## Tooling reference

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
