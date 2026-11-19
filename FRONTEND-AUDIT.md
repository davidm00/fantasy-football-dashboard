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

Verification after this commit: all 93 tests, build, explicit typecheck, lint and
5 preview checks pass. Browser checks confirm first-Tab skip access, heading
focus after navigation, and preserved search focus while query parameters change.

### `html`: Popover progressive enhancement

Keep the existing native Popover UI in supported browsers. An SSR-safe capability
hook provides a labeled native select when Popover is unavailable; explanations
use an explicit hidden/open state with Close, Escape and outside dismissal.
No polyfill dependency or global browser emulation is shipped. Closing an
explanation returns focus to its trigger in either path. This follows the
guide's manual-fallback option rather than introducing newly available invoker
commands or replacing the working selector in modern browsers.

Verification after this commit: all 96 tests, build, explicit typecheck, lint
and 5 preview checks pass. Both native and simulated unsupported-Popover
browsers pass Close, immediate Escape, outside dismissal and focus return.
The native-select fallback changes the same URL filters.

### `sortable-table`: single active sort state

Only the currently sorted header carries `aria-sort`. Inactive headers retain
their buttons and header semantics without announcing a misleading sort state.
Keep React's stable keyed rows and existing click handlers; do not imperatively
move VDOM-managed nodes or adopt invoker commands without a compatible fallback.

Verification after this commit: all 97 tests, build, explicit typecheck, lint and
5 preview checks pass.

### `motion`: opt in to spatial animation

Loading and hover movement run only with `prefers-reduced-motion: no-preference`.
Reduced-motion users retain a visible static loading indicator and all color,
shadow and focus feedback. The automatic loading animation stops after 3.6 seconds,
leaving a static indicator if loading continues instead of an indefinite moving
banner. No completion event is required for navigation or content visibility.
