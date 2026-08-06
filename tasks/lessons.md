
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
