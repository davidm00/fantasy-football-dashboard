# Decisions log

Running log of product/architecture decisions made for the export
pipeline and data model, in plain language, dated by when they were
settled. Not a changelog of code - see git history and
`data/EXPORT_REPORT.md` for that.

## 2026-10-07

**How trades are sourced, and why we don't guess.** Every upheld trade in
`trades.json` has a `"source"`: `"espn"` (a real ESPN item record - either
the trade's own leg data, or a `recent_activity` match for the current
season), `"rebuilt"` (reconstructed from roster diffs, but only when a set
of guards all pass - no ambiguity about which team traded with whom, no
one-sided result, no other trade by the same team the same week), or
`"unknown"` (none of the above worked). An `"unknown"` trade always has an
empty player list - we never fabricate contents past what the guards
allow, even when a guess seems likely to be right.

**Person IDs are frozen once public.** Once a real person is assigned an
anonymized ID (e.g. `m04`), that ID never changes, is never reused for
someone else, and is never renumbered - even after a merge (folding a
newly-discovered duplicate ESPN account into them) or an exclusion
(dropping a non-person co-owner slot). A brand-new real person always
gets the next unused number; dropping someone never shifts the numbers
after them down to close the gap.

**Unknown trades still count toward totals, but have no player view.**
`trades.json` includes every upheld trade, including `"source": "unknown"`
ones, so trade counts/history are accurate. The app should show a
"contents unknown" state for those rather than omitting the trade or
guessing its players.

**Run the export weekly during the season, or trade details are lost for
good.** The `"rebuilt"` mechanism depends on that week's and the
surrounding weeks' locked box-score lineups, and current-season ESPN
matching depends on `recent_activity`, which both have a limited
practical lookback. If too much real time passes between export runs,
the roster-diff window needed to reconstruct a trade can disappear and
`recent_activity` entries age out - a trade that's resolvable today may
become permanently `"unknown"` if the export isn't run again in time.
