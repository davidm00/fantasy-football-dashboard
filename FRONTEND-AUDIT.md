# Modern web audit

Branch: `modern-web-audit`. Do not push or merge these audit commits.

The existing uncommitted Moves sorting changes and local decisions are outside
the audit and are not included in its commits. No dependencies are added.

## Baseline

- Production build, `npx --no-install tsc -b`, lint, all 92 tests and all 5
  preview checks pass.
- The production JS chunk already exceeds the 500 kB warning threshold.
- Guidance CLI: 1.0.1. Every invocation sets `DISABLE_TELEMETRY=1` in its shell.
- The initial `legacy-scan app/src --json` identifies 34 findings, all for
  `js/copying-array-methods`. A scan covers only about 20% of the guides, so
  search/retrieve reviews also cover overlays, forms, tables, navigation,
  loading, themes, images, motion, accessibility, performance and security.

## Changes and verification

### `accessibility`: bypass navigation and route focus

Add a focus-visible skip link and focus the destination heading after pathname
navigation. Same-page query filters retain focus; hash destinations retain
their explicit target. The skip action focuses the heading, rather than making
the entire content wrapper a permanent tab stop. Existing page landmarks and
design remain unchanged.
