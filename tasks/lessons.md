
## Bulk rename by string pattern misses the spread form (2026-07-30)

Renaming set-bag state in StockModule.jsx, I replaced `setForm.` (property
access) but the payload also used `...setForm` — no dot, so it survived. The
build passed (an undefined identifier is a runtime ReferenceError, not a build
error) and the entry silently failed to save.

Two rules for next time:

1. After a rename, grep the OLD name with a word boundary (`[^a-zA-Z]setForm\b`),
   not just the pattern that was replaced. Spreads, JSX braces, bare references
   and shorthand properties all lack the trailing punctuation being matched.
2. Never let a catch block report every failure as one server-ish message. The
   handler said "Could not save" for what was actually a client-side
   ReferenceError, which pointed the search at the API instead of the payload.
   Include `er.message` in the fallback chain.

## External integration handoff needs activation details (2026-09-28)

When implementing an API integration, add empty credential placeholders and a
concrete activation guide before saying it is complete. Keep credentials out of
source defaults and error logs. State clearly when code is verified but a live
round-trip still needs user-owned keys and deployment.

## WhatsApp status UI must distinguish IDs from phone numbers (2026-09-28)

Never display Phone Number ID as a sending phone number when Meta lookup fails.
Show an explicit unavailable state, keep identifiers labeled, and avoid claiming
verification is pending unless Meta returned that state. Display environment
credential presence without exposing secret values.

## Clarify environment owner before adding status fields (2026-09-28)

For integration dashboards, "environment" can mean external provider state.
Use nearby UI context and ask or inspect provider APIs before showing server
runtime or `.env` status. Never equate local deployment mode with Meta account
state.

## Never turn config read failures into writable defaults (2026-09-28)

An empty fallback on a failed settings read looks like lost credentials. A later
save or toggle can write those blanks back to storage. Surface the read error,
block edits until loading succeeds, and update narrow settings such as toggles
without rewriting credentials.

## Exercise routes, not only service functions (2026-09-29)

A service read can pass while its HTTP route fails before responding. Add a
small authenticated-route regression test when changing configuration APIs;
check every imported helper exists before relying on a client build or service
test as proof.

## Preserve provider error meaning in dashboard (2026-09-29)

"Not connected" and "number not verified" hide materially different causes.
When provider returns an authentication error, show that cause and a next step;
do not infer phone verification from failed authentication. Keep saved settings
success separate from provider connection success.

## Sheet cells must write the source schema (2026-10-01)

User corrected initial Smart Sheet delivery: challan bag edits appeared to save,
then reverted. The visible bag totals are derived from `materials[]`; writing a
top-level `totalBags` field cannot change them. Before enabling an editable
column, trace its source field through save and reload. Test PATCH followed by
a fresh GET, including permissions and concurrent updates.

## Production-only UI errors need production-path evidence (2026-10-01)

An earlier missing-icon hotfix did not prove every Bahadurgarh challan crash
was gone. Check optional and legacy record shapes, inspect production-only
panels, and distinguish hardened code from a reproduced root cause. Verify
after deployment before claiming a production issue is closed.

## Form simplification follows user layout preference (2026-10-01)

User corrected LR redesign: max-width card, colored site notice, section dividers,
helper copy, and voice control made form feel narrower and busier. For a request
to simplify, preserve full working width and remove decorative or redundant
elements before adding visual hierarchy. Verify layout against user's stated
preference, not only screenshot's field inventory.

## LR row identity and bill status must follow location (2026-10-01)

User corrected auto-billing: a bill record existing is insufficient if LR list
shows other godowns' vouchers or repeated badges. Filter status by exact LR
book and bill type. When one vehicle load contains multiple materials or
destinations, do not reuse one LR number across rows; use one entry ID for the
load and a unique LR number for each row, matching the operational workflow.

## Compare production persistence semantics with local store (2026-10-02)

Local JSON accepted `undefined` fields in LR/bill records while Firestore rejected the
whole atomic batch. For production-only failures, test the same write path against a
Firestore-style validator, including blank optional fields. Keep this regression in
the normal test command; local-store success alone cannot prove production saves.

## Attach business codes to their actual owner (2026-10-02)

User corrected destination party-code design: code identifies a party, not a
destination. Store it on Party Master; selecting a party may prefill it, but keep
the transaction field editable. Do not infer party code from destination or
silently overwrite manual code when destination changes. When automatic bill
creation is required, enforce its mandatory metadata in both UI and API and
provide an idempotent recovery path for older missing bills.

## Verify existing auto-sync helpers meet full record requirements (2026-10-02)

An LR-to-Party helper already created party names, but dropped entered party
codes and exact godown location. Before treating an auto-create flow as done,
check every required field, existing-record merge behavior, and sandbox
collection scope. Preserve stored type values when a requested label change is
only a UI wording change.

## Prevent typo aliases before they enter master data (2026-10-02)

Exact uppercase matching does not stop AHLAWAT/ALAWAT becoming separate parties.
Check close names and stable party codes on every creation path, including
automatic LR creation and historical sync. Never silently merge existing
financial records by fuzzy name alone; show or report candidate for review.
