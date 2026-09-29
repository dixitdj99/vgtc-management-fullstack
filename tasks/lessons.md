
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
