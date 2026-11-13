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

Best-possible lineups are hindsight-optimal. "Subbed in" identifies **every**
player added to the starting lineup, and "Subbed out" identifies displaced
starters on the bench. Defense can be left empty when that is optimal.
Teal summaries identify a whole set of changes that would turn a final
loss into a win with the opponent's actual lineup held unchanged. They do not
claim that an individual substitution caused the result.
Best-possible lineups are available only after the week is final. Pending and
in-progress matchups retain actual lineups; weekly lineup efficiency and points
left on bench remain unavailable until final scores, rather than treating
players awaiting kickoff as zero-point missed opportunities.

## Managers, draft, moves and trade sandbox

`/managers` opens the all-time directory. Manager IDs are stable owner IDs, not
franchise IDs; former owners and replacements remain separate. Co-managers
receive the same team results, not fractional wins. Career records count
finalized regular-season games; titles and average finishes count completed
seasons only. Profiles at `/managers/<owner-id>` include overview, season
history, head-to-head meetings, draft, trades and moves. Profile season/tab and
activity filters live in the URL, so copied links restore the view.
The Seasons tab always shows full career history, without a season picker.
Profile headers show crown-and-year badges for completed championships, linked
to the winning season's bracket. Each season's owners receive the credit,
including co-managers; unfinished seasons never receive crowns.

The directory has Standings / Rivalries tabs. `/managers/rivalries` offers a
compact grid or list and inline selected-pair meeting receipts. Both league and
profile rivalry views default to current managers; `managers=all` includes
former owners without changing the historical years counted. Single-season
rivalries count finalized regular-season meetings; All time includes labeled
playoffs. Selected pairs, filters and sorting survive sharing and reload.
Profile opponent labels read "vs Name".
Playoff byes are excluded from manager game histories and scoring charts;
they are not meetings and never receive matchup links.

Single-season overview charts use weekly scores and scoring ranks; career
charts use annual ranks and completed finishes. Missing observations stay
missing, and one observation becomes a labeled snapshot rather than a line.

Season Draft and Moves are available at `?tab=draft` and `?tab=moves`. Draft
production is explicitly **observed** in finalized roster snapshots; starter
points are credited only to the drafting team's actual starts. Unobserved
weeks are not assumed zero. Moves show executed transactions and separately
recorded trades; failed, pending and canceled claims are not listed as moves.
Draft has exclusive Table / Board views, including mobile scrolling and sticky
round/slot headings. The stronger teal heat scale shows drafting-team starter
production, not a draft grade; striped gray means unavailable, not zero.
The scale remains stable when filtering picks. Shared tables support header
sorting and reset.

Moves include FAAB ledgers using executed bids and exported budgets only.
Unknown budgets/balances remain explicitly unavailable; annual budgets are not
pooled across career views. Pickup highlights count that team's season starter
production, not strictly production after acquisition. Trade receipts count
received players' actual starts from the first full week after the trade;
they are usage receipts, not automatic fleece verdicts.
Season pickup/draft award actions open the corresponding manager-filtered
activity views rather than placeholders. Draft scoring shares are fractions
internally and converted to percentages once for display.
On mobile, supporting panels are collapsed above the main content; on desktop
they sit alongside it. Primary embedded actions have bordered, 44px-minimum
tap targets, and inline navigation links are visibly underlined.

`/seasons/<year>/trades/<trade-id>` compares actual results, optimal actual
rosters and optimal keep-original rosters. Reverse exactly one trade in each
actual weekly roster, starting the week after the recorded trade week, and
hold opponents' actual scores unchanged. Evaluate finalized regular-season
weeks only. Never unwind later trades or regenerate playoffs. Missing
score/position/required-slot coverage excludes a week, with a visible reason.
Later trades and restored players on the actual opponent are explicitly
flagged; this comparison is not a feasible rewritten league.

The editable sandbox defaults to an optimal reversed-trade lineup. Individual
slot selections live in `team`, `week` and comma-separated `lineup` URL
parameters (`_` means empty). Ineligible, duplicated and unavailable players
produce a visible error/reset instead of a fabricated score. "Preserve actual
starters" retains unaffected starters and fills gaps with eligible originals,
prioritizing prior observed starts. This suggestion is not a historical fact.
Choose Move on a player, then Here directly on an eligible roster row or the
bench. Eligible starters swap; bench replacements send displaced starters to
the bench. Invalid destinations look disabled, and clicking one, clicking
elsewhere or pressing Escape cancels without changing the lineup. There is no
move dialog. Any starter can be benched, including all starters if desired;
empty slots score zero. IR/ER restrictions remain in place. Sorting changes
display order, not assignments. Users can restore Optimal and inspect
the bench. Summary records remain optimal; a custom lineup evaluates the
selected week only. Prior starter usage and season lineup efficiency are
context, not predictions of alternate starting decisions.

See [the implementation plan](../MANAGERS-IMPLEMENTATION.md) for reviewed mocks,
decisions, completed steps and deferred extensions.

## Link previews and deployment

`npm run build` runs TypeScript, Vite, then
`scripts/generate-link-previews.mjs`. It generates crawler-readable HTML and
1200x630 PNG cards for managers, trades, seasons, weeks, and matchups with available box scores.
Byes and future games without a box score do not get misleading matchup pages.
Image filenames are content-hashed so updated scores receive a new image URL.
Manager, Rivalries and trade URLs have dedicated previews. Query-string filters and custom
lineups use that route's canonical preview, not an image of arbitrary user edits.

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
