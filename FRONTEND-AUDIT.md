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

Verification after this commit: all 99 tests, build, explicit typecheck, lint and
5 preview checks pass. Browser-emulated motion preferences show no loading
animation for reduce and exactly four iterations for no-preference.

### `respect-os-text-scale`: browser-controlled root typography

Remove the fixed 16px root font and opt into OS text scaling. Normal 16px browser
defaults preserve the design. Browsers without the text-scale meta feature
ignore it and retain their standard font-size/zoom support; do not combine this
with manual `env(preferred-text-scale)` scaling or a root font-size override.

Enlarged-text browser checks exposed and fixed desktop navigation wrapping,
manager-stat columns, intrinsic selector tracks, and chart label sizing. These
rules preserve the normal layout when sufficient space is available. All 18
checks (six screens at 320/390/1280px) pass without document overflow at 200%
root text size. This is a stylesheet-based proxy, not a real OS preference test.

Verification after this commit: all 100 tests, build, explicit typecheck, lint
and 5 preview checks pass.

### `js`: native immutable array operations

Replace 31 confirmed dense-array copy/sort, copy/reverse and reverse/find
patterns with `toSorted`, `toReversed` and `findLast`. The reverse search uses
only the item, not the reversed index or callback array. The existing ES2023
target/lib supports these methods; no compatibility library is added.
Keep Set/Map iterable materialization and sorts on newly produced arrays.
Defer the three findings in the existing uncommitted Moves file rather than
mixing that feature into the audit. New frozen-input sorting regressions verify
source preservation, stable ties and nulls last in both directions.

Verification after this commit: all 102 tests, build, explicit typecheck, lint
and 5 preview checks pass.

## Final findings and scope decisions

The initial 34 deterministic findings were all valid dense-array patterns:
31 are resolved, and 3 remain in `SeasonActivity.tsx`, which contains the
pre-existing uncommitted Moves feature. Those three are deferred, not false
positives. The final whole-source scan reports exactly those 3. Individual final
scans of all 30 changed application/test files, including tests, report **0**
findings.

No actual scanner findings were dropped as false positives. Related patterns
reviewed and deliberately kept include:

- Set/Map-to-array materialization: these receivers have no `toSorted` method.
- Sorting arrays just created by `map`, `filter`, `flatMap` or `Object.values`:
  no shared input needs protecting, so an extra copying method adds no value.
- Tailwind's build-time CSS import: this is not a render-blocking runtime import.
- React rendering-test strings and generated social previews: not application
  DOM injection or page-LCP image loading.

### Targeted review beyond the scanner

Searches and retrieved guides covered the following actual app patterns, plus
the broad `accessibility`, `performance` and `security` guides:

| Pattern | Guides | Decision |
| --- | --- | --- |
| Explanations and selector overlays | `html`, `dialog`, `declarative-dialog-popover-control` | Keep working Popover controls; add the manual unsupported-browser path. No new dialog library or newly available invoker commands. |
| Search, filters and controls | `forms`, `html` | Keep labeled local URL filters and native inputs. They do not submit server data, so do not impose artificial form submissions. |
| Dense tables and mobile views | `responsive-table`, `sortable-table` | Fix active sort semantics. Preserve native headers, buttons, scrollable tables, optional cards and React-keyed rows. Do not imperatively reorder React nodes. |
| Navigation and loading | `accessibility`, `faster-spa-view-transitions`, `motion` | Add bypass/focus handling and respect reduced motion. Do not cache every route without memory/performance evidence. |
| Typography | `respect-os-text-scale` | Honor browser defaults and opt into supported OS scaling; fix observed enlarged-text overflow. |
| Theme | `dark-mode` | Keep the intentional light design. Declaring a dark color scheme without designing/testing it would be misleading. |
| Images | `optimize-image-priority`, `html`, `performance` | Main UI uses text/SVG; generated social preview images are not page-LCP images. No indiscriminate preload or fetch-priority changes. |
| Runtime/data operations | `js` | Use native immutable methods for confirmed equivalent array operations only. |
| Security | `security` | Review React escaping, links and runtime surfaces. Do not impose new production header policies without deployment/report-only evidence. This is not a penetration test or security certification. |

No dependency, component-library replacement, dark-mode redesign, speculative
route cache or unmeasured bundle optimization is included. The existing >500 kB
production chunk warning remains. No Core Web Vitals improvement is claimed.
The Popover feature remains capability-detected; unsupported text-scale meta
is ignored naturally. ES2023 copying array methods need no fallback under the
guide's Baseline Widely available policy and the project's existing ES2023 target.

## Verification summary

Every implementation commit was followed by the production build, explicit
`npx --no-install tsc -b`, lint, the entire Vitest suite and all 5 preview checks.

| State / commit | Tests | Build / types / lint | Preview checks |
| --- | ---: | --- | ---: |
| Baseline | 92 | Pass / pass / pass | 5 pass |
| `bbf1640` - accessibility | 93 | Pass / pass / pass | 5 pass |
| `83cd3f1` - HTML fallbacks | 96 | Pass / pass / pass | 5 pass |
| `231218a` - sortable table | 97 | Pass / pass / pass | 5 pass |
| `77c794b` - motion | 99 | Pass / pass / pass | 5 pass |
| `45bbe76` - text scaling | 100 | Pass / pass / pass | 5 pass |
| `5477a19` - immutable arrays | 102 | Pass / pass / pass | 5 pass |
| Final accessibility visibility follow-up | 102 | Pass / pass / pass | 5 pass |

Counts describe the working tree, including the pre-existing uncommitted Moves
tests; that feature and unrelated local decisions remain outside audit commits.

The existing Vite server at `http://127.0.0.1:5180` was reused and confirmed
responsive (HTTP 200). Final browser checks cover:

- 27 normal-size route/viewport combinations (home, directory, manager profile,
  rivalries, standings, matchups, reports, draft and trade at 320/390/1280px):
  no document overflow, expected headings and no uncaught page errors.
- 18 enlarged-text combinations across six representative screens at those
  widths: no document overflow at 200% root text size. Table scroll regions
  remain intentionally horizontally scrollable.
- Keyboard skip access and route-heading focus; filtering retains input focus.
- Native and simulated unsupported-Popover paths: selection, immediate Escape,
  Close/outside dismissal and focus return.
- Emulated reduced-motion preferences: static loading under reduce; bounded
  four-iteration loading under no-preference.

### Follow-up `accessibility`: keep focused content visible

A final geometry assertion caught a real skip-link bug: after scrolling, the
sticky header could cover the focused heading, especially with enlarged text.
Explicit skip/hash scrolling now measures the actual sticky-header overlap and
corrects it. This avoids fixed pixel offsets that fail when navigation wraps.
Mobile's non-sticky header is unaffected. Focus still uses React refs and
query-only filters retain focus. Browser geometry checks verify visible skip and
hash destinations at 100% and 200% text size for all three viewport widths.

Limitations: automated Chromium/DOM/keyboard checks and text-size emulation do
not replace real screen-reader speech, real OS text-scale preferences, or a
physical legacy Safari/Firefox device test. Production security headers and
real-user performance data were not measured. Screenshot capture timed out in
both screenshot APIs; final layout assertions use live DOM geometry, not a
claimed screenshot-based visual review.
