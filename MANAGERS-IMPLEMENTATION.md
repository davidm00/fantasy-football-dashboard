# Managers implementation plan

## Mock review and updated decisions

Reference: `/Users/davidmoses/Downloads/league-mockups`.

- `4-Managers`: retain all-time standings and former managers, but replace all
  illustrative figures with finalized regular-season results. Aggregate by
  owner ID, not team ID (Jericho and Cesar occupied the same franchise).
  Credit co-managers equally and disclose shared team results. Only completed
  seasons count toward titles and average finish; show the sample size.
- `4-Team`, `4-Rivals`: provide real links into profiles, season history,
  finalized games, and opponent records. Make manager names and the entire
  index card clickable, with a visible "View profile" affordance.
- `4-MgrDraft`, `3-Draft`: show recorded picks, keepers, observed scoring,
  starts and starter points for the drafting team. Do not invent hit-rate or
  "bust" thresholds or compare positions as if draft rank alone explains value.
- `3-Transactions`: show executed claims and pickups separately from canonical
  trades. Failed/pending/canceled claims must not appear as completed moves.
  Use URL filters, clear/reset controls, explicit empty states and FAAB spend.
- `4-Trade`: retain the playful "Was this a fleece?" framing and receipt
  graphics, but use observed production and auditable one-trade comparisons,
  not fabricated verdicts or votes. Never reconstruct the entire league.
- `4-PhonesPeople`: do not hide desktop metrics or substitute reduced charts.
  Keep horizontally scrollable, keyboard-accessible tables on mobile,
  readable cards, horizontal section navigation, named exclusive popovers,
  and clear links back to the manager/season.
- Reuse the global copy-link control. URL filters must survive sharing,
  back/forward and reload. Generate dedicated manager and trade preview HTML
  and images; query-string sections share the canonical profile preview.

## Latest rivalry refinements

- [x] Align the slanted league-grid labels with their columns. Removed the
  oversized rotated button height; measured label drift is under 1px at
  1280px, 390px and 320px. Verified 48 combinations of scope, layout,
  current/former-manager filtering and viewport width without page errors
  or document overflow.
- [x] Show `vs <Opponent name>` in manager-specific rivalry lists, keeping
  league-wide list labels unchanged. Checked All time and single-season
  views at 1280px, 390px and 320px. Manager tests (45), lint and the
  TypeScript/production build pass.

## Trade scenario agreement

Compare hindsight-optimal actual weekly rosters with hindsight-optimal rosters
where only the selected trade is reversed. Hold scheduled opponents' actual
scores fixed. Show actual results separately.

- Updated during implementation: add an editable per-week sandbox, defaulting
  to the optimal reversed-trade lineup. Include an optimal reset and a
  "preserve actual starters" suggestion using prior observed starts to choose
  eligible original replacements. Do not present that suggestion as fact.
- Serialize team, week and per-slot player IDs in the URL; reject unavailable,
  duplicate or ineligible shared selections with a visible reset control.
- Display prior original-player starts/roster weeks and actual season lineup
  efficiency as context, not a predictive sit/start accuracy score.
- Start the first full week **after** the recorded trade week: the export does
  not establish individual kickoff/transaction timing safely.
- Evaluate finalized regular-season weeks only, through the latest snapshot
  for active seasons and through the regular-season end for historical ones.
- Remove this trade's incoming players from each actual weekly roster and
  restore its outgoing players, using observed weekly scores/eligibility.
  Other actual roster changes remain in place; later trades are not unwound.
- Missing score/position/lineup coverage is **unavailable**, never assumed zero.
  Show omitted weeks and only summarize covered comparisons.
- Warn on later trades involving these players and on weeks a restored player
  appears on the actual opponent. The same player can then exist on both sides
  of this analytical comparison; this is not a coherent alternate-league record.
- Optimal records are hindsight scenarios, not a prediction of managers'
  starting decisions or a claim that a trade caused a real win/loss.
- Do not infer playoff qualification, regenerate brackets, or simulate future
  NFL scores. Titles and actual history are never rewritten.

## Checklist

- [x] Review supplied mocks, inspect real export shapes and confirm methodology.
- [x] Add typed trade/points loading and stable manager aggregation.
- [x] Add covered one-trade counterfactuals and regression tests.
- [x] Build Managers index, clear profile links and manager detail navigation.
- [x] Build season history, rivals, draft, moves and trade scenario surfaces.
- [x] Enable season Draft and Moves, sharing their data/display logic.
- [x] Generate manager/trade preview images and verify share routes.
- [x] Validate editable weekly lineups, optimal reset, suggested starters and
  shared selections in the browser.
- [x] Validate tests, lint, type/build, preview artifacts and mobile/desktop UX.

## Initial prototype verification

- 52 targeted manager, metric and view tests pass; lint and the TypeScript /
  production build pass. All four static-preview checks pass.
- Browser checks cover directory search/cards/reload, profile navigation,
  rivalry meetings, former managers, unknown-manager errors, draft filters,
  keeper reset, executed trade filtering and invalid shared lineup reset.
- Editable selections survive reload; optimal and preserved-starter controls
  work. Copy link retains the custom scenario, announces success and resets
  after four seconds. Bench details support keyboard activation.
- The trade editor has no document overflow at 320px, 390px or 1280px.
  Wide comparison tables scroll inside their own containers.
- Filter-only navigation reuses loaded season/profile data, and new filter
  controls request synchronous navigation feedback.
- Ready for iterative UX review. No commit or push has been made.

## Follow-up, not fabricated in the initial implementation

- League voting requires a backend; no success-looking mock voting control.
- Arbitrary manager comparisons and draft verdicts need agreed definitions
  before implementation. Historical points-rank/final-finish graphics can use
  the existing factual history columns, leaving unfinished finishes absent.
- Exact trade-week simulations need reliable timestamp/kickoff and eligibility
  data. Keep the conservative full-week boundary until that data is available.

## Subsequent UX requests and mock-fidelity pass

Implementation and verification are tracked separately. Earlier passing
checks describe the prototype at that time, not the current worktree.

- [x] Shared ESPN-inspired slot/position roster presentation and inline
  Move / Here targets, eligible swaps, benching and focus restoration.
- [x] Calmer trade editor hierarchy and shared actual/optimal matchup rosters.
- [x] Shared accessible selectors, consistent sizing, spacing and hierarchy.
- [x] Shared sortable table headers and reset controls; remove table sort
  dropdowns, retain card-only selectors, preserve lineup assignments.
- [x] Remove unrelated previous/next manager arrows.
- [x] Profile All time alongside available per-season views, weighted career
  efficiency, one merged draft table and one chronological moves feed.
- [x] Exclude unstarted weeks globally from visible filters/navigation.
- [x] Season Draft Table/Board toggle, snake placement, keeper markers,
  drafting-team starter-point heat, sticky headings and mobile scrolling.
- [x] Restore league-wide rivalry heat grid, season scope, sorting/reset and
  cell links to actual meetings; reuse owner-ID-based head-to-head logic.
- [x] Restore FAAB ledger/progress rail and mock-like move receipts. Use
  executed bids, exported budgets, and explicit missing-budget/adjustment
  caveats; never assume a $100 budget.
- [x] Restore playful trade receipts and factual post-trade production
  comparisons, with coverage and conservative full-week boundaries.
- [x] Add factual draft highlights, keeper/later-round production and manager
  historical graphics. Reuse existing awards rather than inventing grades.
- [x] Review all associated pages as an end user on desktop/mobile: Managers,
  every profile tab in both scopes, rivalry grid, Season Draft/Moves,
  trade editor/receipts and actual/optimal matchups.
- [x] Exercise sorting/reset, filters, sharing/reload, mobile scrolling,
  selectors and dismissal, editor swaps, empty/missing data and future weeks.
- [x] Run full tests, lint, production build and preview checks; record
  actual outcomes and update app documentation.

Analytics sources: existing season metrics/awards, manager metrics and the
typed public export. Pickup awards currently count season starter production
for players acquired by that team, not strictly production after acquisition;
all narrative cards must disclose that distinction.

## Context and navigation corrections

- [x] Give the directory a shared Standings / Rivalries tab bar instead of
  relying on a tertiary header link.
- [x] Single-season rivalry records and highlights use finalized regular
  season only. Career rivalries include labeled playoff history; never show
  empty playoff superlatives for a current season.
- [x] Replace single-season annual rank plots with that season's weekly
  scoring-rank history. A one-observation chart becomes a labeled numeric
  snapshot, not a meaningless line graph.
- [x] Manager Seasons is a full-career history view with no season dropdown,
  including when an older shared URL contains an irrelevant season filter.
- [x] Replace manager rivalry cards with compact, sortable colored opponent
  records and shared selected-pair meeting receipts, matching the rendered mock.
- [x] Use "so far" only for the latest exported, unfinished season. Aggregate
  all-time draft workhorses across their draft seasons; identify pickup
  highlights as standout individual seasons rather than career totals.
- [x] Revalidate scope, charts, tabs, colored records/detail links and responsive
  behavior after these corrections.

## Rendered-mock alignment and current-manager filtering

- [x] Compare the rendered desktop rivalry mock directly: compact 44px-wide
  records, angled names, five teal/orange heat bands and adjacent selected-pair
  receipts. Remove the unrelated highlight strip and oversized grid styling.
- [x] Select a grid record in place, visibly mark the selected cell, preserve
  that pair in the URL and show every meeting next to the grid.
- [x] Reuse the same heat records and selected-rivalry receipt component in
  manager profiles instead of introducing an unrelated chart/card language.
- [x] Default both league and manager rivalry displays to current managers;
  the URL-backed checkbox includes former managers when unchecked. Explain
  that this filters identities, not the historical season range.
- [x] Explicitly identify a shared rivalry outside the active filters rather
  than silently substituting another pair.
- [x] Remove the redundant Managers / Rivalries breadcrumb now that the
  directory tab bar provides that navigation.
- [x] Verify rendered styling, default/filter counts, selection/reload,
  regular-season versus career scope, sorting/reset and mobile behavior.

## Final interaction and navigation review

- [x] Add championship crown/year badges across profile tabs, using completed
  bracket winners and the owner in each season. Link badges to those brackets;
  preserve full co-manager credit and exclude unfinished seasons.
- [x] Replace the Move dialog entirely with Here buttons on valid roster rows
  and the bench. Invalid targets have disabled styling/semantics but pointer
  clicks cancel, as requested. Source Cancel, outside clicks and Escape restore
  neutral state. Every starter can be benched; all-empty lineups score zero and
  survive reload. IR/ER restrictions remain in place.
- [x] Make primary embedded navigation visibly bordered with 44px minimum
  targets, underline inline links and add explicit View matchup labels to
  rivalry receipts.
- [x] Strengthen draft heat while retaining a continuous production scale.
  Label Lower / Higher, distinguish unavailable data with striped gray and
  retain readable dark text.
- [x] Replace stale Draft/Moves award placeholders with manager-filtered
  activity links. Fix double percentage conversion (860% becomes 8.6%) and
  remove the misleading claim that pickup totals are strictly post-acquisition.
- [x] Exclude playoff byes from manager game histories/graphs. They are not
  meetings, and must never create matchup links with a null opponent.

### Final verified outcomes

- Full Vitest suite: **84 tests pass**. Lint and TypeScript/production build pass.
  All **5 preview checks** pass; the existing JS chunk-size warning remains.
- **192 responsive view combinations** pass at 1280px, 390px and 320px:
  current/former profiles, all six tabs, career/historical/current scopes,
  directory layouts, rivalry grid/list/filter scopes, all seasons' Draft/Moves
  and the trade editor. No page errors or document overflow; visible primary
  actions meet 44px, panels follow responsive ordering, and history has no
  season picker.
- **39 manager overview checks** verify all 13 managers' championship years
  against exported owners/brackets at three widths. A crown opens its bracket.
- **15 draft-board checks** match all picks and snake positions exactly:
  160 / 180 / 204 / 204 / 204 for 2022 through 2026. Keeper filtering is 11/11,
  filtering preserves heat, the corner stays sticky in both directions, and
  worst observed text contrast on the strongest teal is **6.24:1**.
- Inline Move flows pass at all three widths: swaps, bench replacements,
  empty/fill D/ST, disabled-target/outside/Cancel/Escape cancellation, focus,
  sorting/reset, URL/reload, all-starters-benched zero, presets and unchanged
  opponent scores. Invalid shared scenarios reset visibly.
- Actual / best-possible matchups pass at all three widths for 2025 Week 8 and
  Devon's 2026 Week 5 game. Devon is never forced to start a negative defense;
  mirrored sorting/reset and restoring As played preserve assignments.
- Selectors pass Home/End, rapid arrows, viewport bounds, Escape, resize and
  outside scroll/click. Scenario options contain only covered finalized weeks.
  Directory search/cards/sort/clear, activity filters, supporting disclosures,
  methodology/player usage and named award explanations work.
- Rivalry current/former filtering, excluded-pair notices, selection/reload,
  sorting/reset, repeated mobile detail scrolling, Copy link/timer reset and
  actual meeting navigation pass.
- **30 award-link clicks** reach the correctly filtered Draft/Moves views
  across every year and three widths.
- Final link audit scans **109 views** and **577 unique internal destinations**:
  no invalid implemented-page destinations remain. All **14 linked report
  PDFs** respond successfully with PDF content types. Records/Explore remain
  genuinely unimplemented, not misleadingly redirected.

Documentation is updated. Changes remain uncommitted/unpushed; unrelated local
decisions are untouched.
