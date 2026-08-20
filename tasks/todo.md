# Attendance system for staff and drivers

## The constraint

Drivers and staff cannot use apps. The design answer: **they never touch the system at all.**

- **Yard staff** — the supervisor runs a visual roll-call. A grid of face photos, everyone
  defaults to Present, the supervisor taps only the people who are missing.
- **Drivers** — attendance is *derived*, not marked. A driver with a voucher, fuel log, or
  trip on a date was working; we already record that. The supervisor only resolves the
  days where there is no evidence either way.
- **Payroll detail** — present / absent / half-day / leave, matching what
  `fixedSalary` and `paidLeaveEntitlement` on the profile already expect.

## What already exists

- `attendance` collection, docs keyed `{profileId}_{date}`, statuses present/absent/half_day/leave
- `AttendanceModule.jsx` — admin marks a plain checkbox grid by hand
- `profiles` collection with `type`, `vehicleNo`, `fixedSalary`, `paidLeaveEntitlement`, `leaves`
- `vouchers` carry `driverName`, `truckNo`, `date`; `fuel_logs` carry `truckNo`, `date`
- `profileRoutes.js` `/:id/trips` already matches drivers to vouchers by lowercased name

## Plan

### Server
- [ ] `services/attendanceService.js`
  - [ ] `deriveDriverActivity()` — build date -> evidence map from vouchers (by `driverName`,
        and by `truckNo` matching the driver's assigned `vehicleNo`) and fuel logs
  - [ ] `getRange()` — date-range scoped query (current code reads the whole collection)
  - [ ] `saveBulk()` — records `markedBy`, `markedAt`, `source: manual|derived`
  - [ ] `getMonthlySummary()` — payable days, paid leave used vs entitlement
- [ ] Rewrite `routes/attendanceRoutes.js`
  - [ ] `GET /roster?date=` — every active profile + suggested status + derivation evidence
  - [ ] `GET /?from=&to=`, `GET /summary?month=`
  - [ ] `POST /`, `POST /bulk`, `DELETE /:id` behind `requirePermission('attendance', 'edit')`
  - [ ] Audit-log every save
- [ ] Add `attendance` to `PERMISSION_KEYS` so it can actually be granted to non-admins

### Client
- [ ] `AttendanceModule.jsx` roll-call grid: large photo tiles, Hindi + English, default
      Present, tap to change, driver tiles pre-filled with an "auto" badge and evidence
- [ ] Monthly view: payroll summary (payable days, leave used/remaining)
- [ ] `StaffProfileModule.jsx`: photo upload, resized client-side to a small thumbnail

### Verify
- [ ] Derivation returns correct dates for a driver with known vouchers
- [ ] Non-permitted user cannot write attendance
- [ ] Roster + summary correct against seeded data
- [ ] Client builds

## Review

All items done. Verified with 37 service-level assertions plus live HTTP checks against
dev Firestore (test records created and deleted again afterwards).

Notable finding while building: the old module filtered profiles for types
`Driver | Staff | Cleaner | Munshi`, but the types this system actually creates are
`Driver | Office Staff | Labour | Tyre | Manual`. Only `Driver` overlapped, so office
staff and labour never appeared in the roll-call at all. Replaced the include-list with
an exclude-list of the two vendor types, so a new employee type added later shows up by
default instead of silently vanishing.

Deliberate decisions worth remembering:
- An unmarked person is **never** auto-saved as absent. That is a wage decision, so the
  UI leaves them blank, highlights them, and excludes them from the save.
- A driver with no trip evidence is left unresolved rather than assumed absent — a driver
  can be mid-trip with nothing recorded that day.
- `source` on each record distinguishes derived from hand-marked, for later disputes.

### Follow-up round

- Labour excluded from attendance — it is tracked through the labour module instead.
  `NON_ATTENDING_TYPES` is now `Tyre | Manual | Labour`.
- Added a **Driver** field to the voucher form. Without it nothing was ever written to
  `voucher.driverName`, so driver derivation had no input at all. It defaults to the
  driver assigned to the truck and can be changed when a relief driver takes the load.
  Stores `driverId` (exact) alongside `driverName`.
- Derivation now prefers `driverId` over the name, and the name over the truck guess.
- Profile creation stays **admin panel only** (AdminLayout > Staff Profiles). It was
  briefly added to the main app nav and then removed on request; `StaffProfileModule`
  is back to its original `role === 'admin'` gating, with only the photo picker added.

Known gaps, not addressed:
- `/api/labour/attendance/bulk` writes via the env prefix only, while this module uses the
  sandbox-aware `getCol()`. They agree for normal users and diverge only for sandbox users.
- Estimated pay pro-rates the fixed salary across calendar days. If payroll actually uses
  a 26-day month or a different convention, `getMonthlySummary` needs adjusting.

---

# 79mm receipts + form-layout fixes

## Print — 79mm wide, 150mm floor, height grows with content

Five templates, all currently a fixed size:

| Receipt | Where | Now |
|---|---|---|
| Loading Receipt (JKL) | `LRModule.printReceipt`, `brand==='jkl'` | 50 × 100mm |
| Loading Receipt (Dump) | `LRModule.printReceipt`, else | 100 × 113mm |
| JK Lakshmi Voucher | `VoucherModule.printVoucher`, `brand==='jklakshmi'` | 100 × 130mm |
| Dump / JK Super Voucher | `VoucherModule.printVoucher`, else | 105 × 148mm |
| Sell Receipt | `SellModule.printReceipt` | 50 × 100mm |

- [x] New `client/src/utils/receiptPrint.js` — one 79mm shell shared by all five
  - `@page` starts at `79mm 150mm`
  - body `min-height: 150mm` — a floor, not a cap, so content runs past it
  - once load + fonts + images have settled, measure `scrollHeight`, rewrite the
    `@page` rule to the real height, then print, so the print dialog opens with
    the paper length already correct
- [x] Strip fixed `width` / `height` / `overflow:hidden` and the per-template print
      scripts from all five, wire each to the shell
- [x] Kosli / Jhajjar / Bahadurgarh **Bills** stay A5 — they are GST bills, not
      counter slips. Out of scope.

## Form layout — Edit Receipt, Edit Voucher, Materials row

One root cause, one fix. `.field-h` sets a fixed 140px label beside its input.
Inside `.fg-2` / `.fg-3` / the 5-column materials grid a column is only 150–250px
wide, so the label eats it and the input is squeezed to a stub or pushed out of
the modal — the horizontal scrollbar visible in both screenshots.

- [x] `.fg-*` tracks → `minmax(0, 1fr)`, so a column can shrink instead of one
      collapsing while the other overflows
- [x] `.field-h` → wrapping flex, input keeps a 150px flex-basis, so when the row
      is too narrow for label + input the input drops to its own line and the
      field becomes label-over-input on its own. No media or container queries,
      no per-module overrides.

## Review

Done. Client builds.

**Print.** All five now share `openReceiptWindow`. Each template kept its own
markup and styling; what was removed from each is the page box and the print
trigger. The A5 GST bill was left alone deliberately.

Two things the height maths got wrong on the first pass, both caught by
replaying the measurement against known `scrollHeight` values:

- A `+1mm` tail combined with `Math.ceil` meant a slip sitting exactly on the
  150mm floor measured 152mm. Since the body's `min-height` guarantees every
  receipt is at least the floor, *every* short receipt was 2mm over and the
  floor never actually applied. The body's own bottom padding is the tail, so
  the tail was dropped and half a millimetre of slack absorbs the rounding.
- `scrollHeight` is a whole number of pixels, so 150mm reads back as 150.019mm
  and rounded up. Same slack covers it.

Adapted for the narrower roll: the Dump/JK Super voucher's seven-column delivery
table became one block per delivery — seven columns across 73mm of usable width
would not have been readable, and the free height is exactly what makes the
change affordable.

**Forms.** The three broken screens shared one cause and took one fix, in CSS
only. No module was touched for layout. The rule is self-adjusting: the field
stays label-beside-input where there is room and stacks where there is not, so
the 5-column materials row, the half-width modal columns and the full-width
rows all land correctly without anything being told which case it is in.

Not verified in a real browser — there is no headless browser in this repo, so
the print measurement was checked by replaying the formula rather than by
rendering. Worth a visual check on the actual thermal printer.

### Follow-up round — blank receipt on create, bold text, dynamic signature

**Blank slip when creating an LR.** Not caused by the 79mm work; it has been
there all along. `POST /lr` answers `{ lrNo, ids }` — a receipt number and the
document ids it wrote — because `lrService` explodes one submission into one row
per material. `LRModule` handed that straight to the printer as `[res.data]`,
so `rows[0].lrNo` matched, the guard passed, and every other field came out
`undefined` / `NaN`. Printing the same LR from the list afterwards worked,
which is why it looked like a print bug rather than a data one.

Fixed by rebuilding the rows from the payload just submitted, mirroring
`createLoadingReceipt` field for field so the auto-print and a later list print
produce the same slip. Proven with a harness that extracts the real
`printReceipt` / `printVoucher` out of the modules and runs them against both
the list shape and the create shape — before: 4 `undefined` and a `NaN`; after:
none. The voucher was never affected (its POST returns the whole doc), but it
now prints `{...payload, ...response}` so a partial response cannot blank it.

**Bold everywhere.** `font-weight: 700` is now the shell default and grey text
is gone from every template — a thermal head dithers grey into something patchy
and these are read at a loading gate. A blanket `color: #000` rule was tried
first and reverted: it also blacked out the white-on-black NET PAYABLE banner.

**Signature.** Was the constant "VGTC Admin" / "VGTC Account". Now the logged-in
user, threaded as a `signedBy` argument. Added a signature block to the Dump
loading receipt and the Sell receipt, which had none.

Two other things fixed while in there:
- `window.print()` blocks until the dialog closes, so assigning `onafterprint`
  after the call missed the event and the print window never closed.
- The Dump / JK Super voucher never printed the party name. It does now.

---

# E-Way Bills — removed

The E-Way Bill module was built out (real NIC/GSP portal generation, Part-B,
consolidated bills, LR linkage) and then removed on request — the feature is not
wanted. Removal was complete: routes, services, provider layer, payload builder,
tests, the client module, its nav entries, the admin credentials card, and the
GST master-data fields that existed only to feed it (org GSTIN/dispatch address/
TRANSIN, party trade name/place/pincode/state code, material HSN/GST rate/rate
per MT). The `EWAY_*` environment variables are gone from `.env.example` and
`apphosting.yaml`. The work is recoverable from git history if it is ever wanted.

Three things were **kept**, because they are unrelated to E-Way and fix real
defects that pre-date it:

- `lrService.updateLoadingReceipt` called `localStore.get(...)`, which does not
  exist — the store exposes `getById`. Every LR update in local-store mode threw.
- `POST /settings` called `localStore.update` on a fixed-id document that does
  not exist until the first save, so saving settings on a fresh local install
  always failed.
- `localStore.upsert` was added to support that fix — the local equivalent of a
  Firestore merge-set.

The Admin "Govt E-Way API & SMTP Settings" tab is now "SMTP Settings".

## Generate Invoice enabled (2026-07-30)

- [x] Nav: `invoice_dump` / `invoice_jharli` badge `SOON` -> `NEW` (buttons were hard-disabled)
- [x] InvoiceModule: removed COMING SOON chip + amber banner
- [x] PLANT_OPTIONS: `available` flag — JK Super Dump/Trade/Non-Trade live; JK Lakshmi,
      Kosli, Jhajjar greyed "SOON" (plantConfig.js still 'TBD' GSTIN/SAP/plant codes;
      would print TBD on legal invoice)
- [x] Server guard: POST /invoices/generate rejects plants with 'TBD' config
- [x] Notification n5 updated to "live"
- [x] Verified: client build OK, server tests 43/43

Later: custom formats per plant (user will supply). Fill PLANT_CONFIGS with real
GSTIN/SAP/plant codes, flip `available: true`. Handling-charges bill format
(samples/Jk super handling.pdf, SAC 996713, monthly depot) has sample but no code.
Balance sheet -> invoice wiring does not exist yet — invoices only from plant Excel upload.

## Tyre Management rework (2026-07-30)

- [x] "Auto-fit Apollo Tyres" removed end-to-end (client button/handler, POST /tyres/auto-fit-apollo, tyreService.autoFitApollo)
- [x] Module shows own fleet only: vehicles filtered ownershipType==='self' || ownerName contains 'vikas' (same rule as Mileage)
- [x] AXLE_LAYOUTS trimmed to '18' Trailer + '6' Canter (position ids unchanged so old fitments still map)
- [x] Axle map rewritten: flat schematic (Tractor/Trailer sections, named axles, big wheel chips, legend, wheels-fitted + spare badges) replacing pixel-art truck
- [x] Fleet ledger: vehicle Type badge column (Trailer 18W / Canter 6W)
- [x] Ultracode review (22 agents) → fixed: fit-modal positions honor layout toggle; orphan fitments (market/deleted/typo trucks) get amber signpost; View Axle Map normalizes statusFilter; misleading "old positions" copy; toggle order 18 before 6; invoice editor dropdown gated to available plants; JK Lakshmi entry shows fallback notice
- [x] Verified: client build OK, server tests 43/43

## Invoice <-> Balance Sheet linking (2026-07-30)

- [x] POST /invoices/generate verifies every entry against balance-sheet vouchers
      (type-scoped per plant, per-LR via invoicedLrNos [{lr,billNo}]); 409 with
      missingLrs/alreadyInvoiced; 400 on blank-LR rows
- [x] Marks vouchers per-LR before registry write, rollback on failure; registry
      doc now stores lrNos[] (revives the legacy dup-LR backstop)
- [x] POST /invoices/delete unmarks by billNo BEFORE deleting the doc (retry-safe,
      survives voucher LR edits)
- [x] PUT /invoices/:id syncs marks: added LRs verified+marked, removed LRs unmarked
- [x] Local mode: no marking (consistent with skipped registry)
- [x] Client upload (both branches): type-scoped per-LR pre-filter, blank-LR strip,
      popup modal + editor panel for missing entries; fetch failure = skip filtering
      (server enforces), never false "not in Balance Sheet"
- [x] Generate 409 handler removes rejected/blank entries from the bill; bill no +
      re-split locked while generating
- [x] Pending-entry add paths now balance-sheet-checked before entering a bill
- [x] api.js: /invoices writes also bust /vouchers cache
- [x] BalanceSheet: green INV #bill badge (multi-bill, partial * for multi-delivery)
- [x] Ultracode review round: 39 agents, 30 confirmed findings -> all root causes fixed
- [x] Verified: client build OK, server tests 43/43, invoiceRoutes loads

Known limits (pre-existing, untouched): no Firestore transaction around
verify->mark (concurrent generates could race); legacy {base}/invoice/generate
endpoints bypass voucher checks (client no longer uses them); /invoices registry
is env-scoped while vouchers are sandbox-scoped.

## LR print — page cut to content (2026-07-30)

- [x] Root cause: receiptPrint shell put the 150mm floor on `body`, so it was
      both the paper feed AND the content box. A short LR was stretched to
      150mm and its `margin-top:auto` signature pushed to the bottom → the
      blank band in the middle of the slip.
- [x] receiptPrint.js: new `fitContent` option — content laid out at natural
      height, floor applies to the page only. Voucher/Sell unchanged (still
      feed a full tear-off slip).
- [x] LRModule: both print variants (JKL + Dump) use fitContent, floor 75mm
      (≈ a one-material LR, so a script failure still prints whole slip).
      More materials → taller page, signature always right under the table.
- [x] Paper size auto-set at print: the existing auto-height script rewrites
      `@page { size: 79mm <measured>mm }` before opening the dialog; now that
      the measurement is the real content height, the dialog opens already on
      the correct paper.
- [x] Verified: generated CSS has no body min-height for LR (voucher keeps
      150mm), client build OK.

### LR print — follow-up after real print showed 2 sheets

Print still came out 79x150 with the signature alone on sheet 2. Two further
causes, both fixed in the template/shell rather than left to the `fitContent`
flag:

- [x] `margin-top: auto` on the signature blocks (both LR variants) is what
      pushed them to the bottom of whatever height the body had. Removed —
      the block now sits directly under the TOTAL row, padding only.
- [x] New `LR_FIT_CSS` prepended to both LR templates (template styles are
      injected after the shell, so they win): `body { min-height: 0 !important;
      height: auto !important; max-width: 79mm; margin: 0 auto }`, no flex
      child may grow, and `break-inside: avoid` on the slip parts. The slip is
      79mm wide and content-tall regardless of the shell.
- [x] receiptPrint auto-height rounded DOWN up to 0.5mm, so an exact-fit page
      shaved the last sliver — the signature — onto a second sheet. Now rounds
      up with 0.4mm slack. Also protects Voucher/Sell from the same spill.
- [x] Verified: shell emits no body min-height for LR, template override lands
      after the shell, no `margin-top: auto` left in either LR template, new
      rounding in the bundle, client build OK.

Not fixable in code: destination LABEL advertises fixed 79x150mm media, so
Chrome snaps the shorter page up to the label. Set the driver media to
continuous/custom length to get a short feed.

### Print window + Sell receipt size

- [x] Print popup was opened at slip width (420px), but Chrome renders the print
      dialog inside that window with a fixed-width settings pane — the preview
      collapsed to a sliver. Window is now sized for the dialog and centred,
      clamped to the screen (1040x880 max, 980x820 fallback). The slip is pinned
      to its own width on screen, so nothing about the receipt or its measured
      height changes.
- [x] Sell receipt is now 79mm x 100mm (`minHeightMm: 100`, was the shared 150mm
      default). Its stamp/footer block stays bottom-anchored to that height; a
      longer receipt grows past it on the SAME page instead of spilling.
- [x] Verified: @page and body both 100mm for Sell, popup sizing across screen
      sizes, client build OK, server tests 43/43.

## Attendance — default-Present staff read as already marked (2026-07-30)

Reported: two Office Staff show Present on every date, and the footer says
"2 changes not saved yet" before anything is touched.

Not a data bug — attendanceService.getRoster suggests Present for every
non-Driver profile on every date (drivers need trip/fuel evidence). The
suggestion was rendered identically to a saved mark and counted as an edit.

Decision (user): keep the default-Present suggestion, label it as one.

- [x] Split the counts: `pendingCount` = rows the supervisor actually touched
      (drives the footer text AND the leave-the-date confirm, which used to
      prompt about marks nobody made); `unsavedCount` = everything on screen
      not yet in the DB, suggestions included.
- [x] Footer now distinguishes "N changes not saved yet" from
      "Nothing changed — N suggested marks still need saving".
- [x] Tile shows a "Suggested · सुझाव" badge for untouched, unsaved default
      suggestions, so it no longer looks like a confirmed Present.
- [x] Save behaviour unchanged — suggestions still save; `source` still
      records derived vs manual.
- [x] Verified: client build OK.

## LR receipt — bilingual loading type, driver name, named signature (2026-07-30)

- [x] Loading type now printed on every material row in BOTH templates (JKL and
      Dump), English + Hindi: "From Godown · गोदाम से" / "Crossing · क्रॉसिंग".
      Legacy rows saved as 'Godown' map to the same label. The Dump template
      used to hide it whenever it was Godown; it is always shown now.
- [x] Driver name resolved from the truck number against /vehicles
      (`driverForTruck`, whitespace/case-insensitive match). The LR itself
      stores no driver, so this reads the vehicle record.
- [x] Driver shown as its own line in the details box ("Driver · चालक") and
      printed under the signature line ("Driver · चालक" + name), so the slip
      records who signed. Truck/Party labels also bilingual; Dump receiver box
      reads "Receiver · प्राप्तकर्ता".
- [x] Trucks with no driver on record print the plain signature line as before.
- [x] Devanagari font fallback added (Nirmala UI / Noto Sans Devanagari /
      Mangal) — Arial has no Devanagari glyphs.
- [x] Verified: 11 markup/CSS assertions pass, client build OK.

Note: driver names come from Fleet Management. Trucks with a blank driverName
print no name until one is set there.

## Stock — Set (water-damaged) bags (2026-07-30)

Bags that get wet and set hard are still in stock but cannot be loaded; they are
kept as a separate stack and sold cheap. Parties also refuse and return set bags
from a delivery. Neither had anywhere to live, so `Available` overstated what
could actually be loaded.

- [x] New per-brand collections: `set_stock`, `jkl_set_stock`, `kosli_set_stock`,
      `jhajjar_set_stock`, `bahadurgarh_set_stock`
- [x] `stockService.getSetStock/addSetStock/deleteSetStock` — positive qty, valid
      material, truck + LR mandatory on a party return; quantities always
      positive with `direction: in|out` (write-off is an 'out' row)
- [x] `routes/setStockRoutes.js` — one `mountSetStockRoutes(router, {setCol,
      materials})` helper mounted by all five stock routers instead of five
      copies of the same three handlers
- [x] Sales carry `stockType: 'good' | 'set'` (`sellService.addSale`), defaulting
      to 'good' so every pre-existing sale keeps counting against good stock
- [x] Balance rules (StockModule): `sold` counts good-stack sales only;
      `available = added − lrUsed − sold − held − setFromGodown`; party returns
      never touch good stock (their LR already consumed those bags)
- [x] New "Set Bags" tab on all four stock plants: per-material balance cards,
      three entry modes (found in godown / returned by party / written off),
      and a ledger with delete. The return form takes truck no + LR no, and
      picking the LR auto-fills party and material from it.
- [x] Overview: per-material "Set Bags" figure + a fleet-wide KPI
- [x] Sell: Good/Set toggle on the form, SET badge in the ledger
- [x] Verified: 15 balance-rule cases pass (godown vs return vs sale vs
      write-off vs legacy sales vs delete), service validation exercised
      against Firestore incl. truck/party normalisation and cleanup, all five
      routers load, routes registered, client build OK, server tests 43/43

Not included: Google Sheets mirroring of set-bag rows. Sell only has screens for
the dump and JKL brands, so Kosli/Jhajjar/Bahadurgarh drain the set stack via
the "written off" entry until Sell covers them.

### Set Bags — fixes after first live test (2026-07-30)

- [x] Entry not saving: the payload still spread the pre-rename `setForm`, which
      no longer existed — a runtime ReferenceError, invisible to the build. Now
      `...setBagForm`. Catch blocks also include `er.message` so a client fault
      stops masquerading as a server refusal.
- [x] `POST /api/jkl/stock/set-stock` 404: verified against a booted instance
      with a real token — the route answers 200/201 in current code, so the 404
      was a stale server process (dev server needs a restart when new route
      files are added).
- [x] Real bug found while proving that: in `kosliStockRoutes.js` the set-stock
      mount sat ABOVE `router.use(tenancyMiddleware)`. Express runs layers in
      registration order, so those handlers never received `req.orgId` and every
      Kosli call failed (GET 500 / POST 400, "Cannot use undefined as a
      Firestore value"). Mount moved below the middleware.
- [x] `getSetStock`/`addSetStock` now reject a missing orgId with a clear
      message instead of letting `undefined` reach a Firestore query.
- [x] Verified end to end on all four plants with an authenticated probe against
      the real app: GET 200 + POST 201 + DELETE 200 on jkl, kosli, jhajjar and
      bahadurgarh; all probe rows removed afterwards (0 left in every
      collection). Client build OK, server tests 43/43.

## Sell — online recipient accounts + cash-only cashbook (2026-07-30)

Online payments recorded nothing about whose account received the money, and
"Transfer to Cashbook" posted any typed amount straight to /cashbook/deposit —
so online money could be deposited as if it were physical cash.

- [x] `sales.onlineAccount` — set only for online payments, cleared on a cash
      sale (`accountFor` in sellService) so a form switched to cash cannot leave
      a stale account behind
- [x] New `sell_cash_movements` collection (single collection + `brand`, like
      `sales`): `{type: 'to_cashbook'|'withdrawal', amount, date, remark,
      cashbookEntryId}`
- [x] The rule, server-side in `getCashInHand`: cash in hand = paid CASH sales −
      all movements. Online sales are absent by construction, which is what
      makes them undepositable
- [x] `GET/POST/DELETE /api/sell/cash-movements` — POST caps against cash in
      hand and names the shortfall; `to_cashbook` writes the cashbook deposit
      itself and rolls it back if the movement is then refused; DELETE refuses a
      `to_cashbook` row (would orphan the cashbook entry)
- [x] Client: "Transfer to Cashbook" replaced by a **Cash** modal — Add to
      Cashbook / Withdraw Cash, both showing and capped by cash in hand;
      withdrawal creates no cashbook entry
- [x] Sale form asks "Sent to Account" for online payments (free text +
      `<datalist>` of profiles and previously used names); marking a pending
      sale paid online now prompts for the account too
- [x] New views: Online Receipts grouped by account (older rows surface as
      "Account not recorded"), and a Cash Movements ledger. Cash in Hand tile
      added to the summary strip
- [x] Verified: 16 end-to-end API checks pass (cash raises / online does not /
      over-cap refused with cashbook untouched / deposit creates entry /
      withdrawal does not / delete rules), all probe data cleaned up, identifier
      sweep clean, client build OK, server tests 43/43

## Trip Profit Analysis — own fleet, latest month, full filters (2026-07-30)

- [x] Own fleet only: vouchers are filtered to self trucks before any profit is
      computed. Self = `ownershipType === 'self'` OR owner name contains
      'vikas' — the same rule Mileage and Tyre use, so trucks registered before
      the flag existed do not silently vanish from the screen.
- [x] Market trucks dropped along with the commission branch (`firmRevenue` is
      now simply the trip net). On a market truck the firm earns a commission,
      not a trip margin — a different question from the one this screen answers.
      OWN/MARKET badge removed; the trip type badge took its place.
- [x] Opens on the newest month that has trips instead of all time. Set once via
      an effect, so choosing "All Months" afterwards sticks.
- [x] Filters for every dimension: Month, Truck, Type, Party, Destination, plus
      the existing search and sort, and a "Clear filters" button that returns to
      the latest month. Header states the fleet size and the period on screen.
- [x] Verified: 10 logic cases pass (legacy-name truck included, market and
      unknown-ownership trucks excluded, zero-freight trips excluded, months
      ordered newest first, default month, per-dimension filtering); client
      build OK.

## Netlify removal + platform cleanup (2026-07-30)

Netlify is no longer used; the app deploys on Firebase App Hosting
(apphosting.yaml, K_SERVICE). Netlify was still woven through runtime code.

- [x] Deleted `netlify/` (incl. its own functions bundle), `netlify.toml` and
      `client/public/_redirects` (a Netlify-format file whose SPA fallback the
      Express catch-all already provides). Dropped the `serverless-http`
      dependency from both package.json files.
- [x] Runtime checks retargeted rather than blindly deleted — every
      `process.env.NETLIFY` became `K_SERVICE` so the behaviour it guarded
      still applies on the host actually in use:
      · `index.js` serverless-cron detection, and `app.listen` is no longer
        skipped (that guard only existed for Netlify functions)
      · `localStore.js` read-only-filesystem detection (/tmp data dir)
      · `envConfig.js` "APP_ENV missing on cloud → production" safe fallback
      · `firebase.js` credential error hint, `authRoutes` environment label
- [x] Stock migration `stockService.init()` now always runs (it was skipped for
      Netlify's read-only filesystem).
- [x] Wording fixed in sw.js, main.jsx, AdminModule, both client .env files,
      server/.env.example, and server/.env (comments only — verified every
      non-comment line byte-identical before/after).
- [x] **`/api/stock` mounted.** `stockRoutes` was required at index.js:15 and
      never mounted, so every dump-stock call 404'd — including the Set Bags
      routes added there. The four per-plant routers were fine.
- [x] Deleted dead `client/src/components/LRPrint.jsx` (0 importers, carried a
      conflicting fixed 100x113mm @page rule).

## Test suite: self-booting + coverage for the new areas

- [x] The suite required a server someone had already started, on a port whose
      JWT secret happened to match a hardcoded one — a clean checkout failed
      every test for reasons unrelated to the code. It now starts its own
      server when nothing is listening (passing the secret it signs with) and
      stops it on exit, including on crash/SIGINT.
- [x] 14 new tests over the areas changed this session and previously untested:
      set bags (godown vs party return, truck normalisation, bad material,
      Kosli org-scoping — which guards the mount-order bug), the dump stock
      mount, sell online-account storage + cash-in-hand cap + withdrawal not
      touching the cashbook, tyres reachable and auto-fit-apollo gone, and
      invoice refusal for TBD plants and for entries missing from the Balance
      Sheet.
- [x] Verified: 57 passed / 0 failed (was 43), all test data cleaned up
      afterwards, client build clean, server boots clean on a free port with
      /api/auth/status 200 and /api/stock/additions correctly 401 without a
      token.

## Production readiness fixes (2026-07-30)

Two of the new features would have produced wrong numbers on day one against
existing data — not code bugs, missing migration.

- [x] `server/utils/invoiceLinking.js` — the LR↔voucher matching rules (slash
      stripping, plant→voucher-type scoping, per-LR `invoicedLrNos`) extracted
      out of invoiceRoutes so the route and the backfill script cannot drift.
      A drifted rule silently marks the wrong voucher.
- [x] `server/scripts/backfillInvoiceAndSellCash.js` — dry run by default,
      `--apply` to write, idempotent, prints the tier it is pointed at:
      · **Invoices → vouchers.** Bills raised before the link existed left no
        mark, so the server would re-bill them (only the upload screen's
        client-side filter stood in the way). Writes `lrNos` on old invoice docs
        (the duplicate guard queries it) and marks each matched voucher. LRs
        with no voucher are reported, not invented.
      · **Sell cash opening balance.** Cash in hand counts every paid cash sale
        minus movements, and the movements collection is new — so cash banked
        months ago still read as in the box. Writes one opening adjustment per
        brand to bring it to the real figure (0 by default,
        `--cash-dump=` / `--cash-jkl=` to set one). Recorded as a withdrawal so
        it can never be mistaken for revenue; skipped if any movement exists.
- [x] `apphosting.yaml`: `CRON_SECRET` moved from a committed literal to a
      Secret Manager reference, with the gcloud commands to create it. It fails
      closed (jobRoutes rejects when unset), so an un-created secret disables
      the jobs rather than exposing them.

### Verified
- Backfill dry run on dev found the real problem: JKL showed ₹16,500 of
  long-banked cash as "in hand". Applied → ₹0; re-run is a clean no-op.
- Step 1 proved on a seeded legacy invoice: `1022/BF-TEST-77` matched voucher
  `BF-TEST-77` across the slash, voucher marked, invoice `lrNos` written, and a
  second bill for the same LR then returned **409 already invoiced**. Test data
  removed afterwards (dev invoices back to 0).
- Fleet audit on the production `vehicles` collection: 75 vehicles — 20 self,
  52 market, 4 unclear. Three are `ownershipType: "dummy"` / "MARKET OWNER"
  (correctly excluded). **HR47G3246 has no ownership set at all** and will be
  missing from Trip Profit, Mileage and Tyre until it is set.
- 57 tests pass, client build clean, invoiceRoutes helpers all resolve.

### Still needs you before deploy
- `apphosting.yaml` `SMTP_USER` is still `your-email@gmail.com` — OTP login,
  password reset and daily alerts stay disabled until it is a real address.
- Create the `CRON_SECRET` secret before deploying, or App Hosting will reject
  the config for referencing a missing secret.
- Nothing is committed: 45+ changed files on `initial-branch`.

## User permissions: enforced, then rebuilt (2026-07-31)

Three things were measured before touching anything:

- **Permissions were decoration on 38 of 39 routers.** Only attendanceRoutes
  used `requirePermission`; everything else sat behind `requireAuth` alone, so a
  user granted *view* on the cashbook could POST a deposit straight to the API.
- **The catalogue had drifted from what the app enforces.** `attendance` was
  missing from AdminPage, `lr_dump` from both admin screens (JK Super Loading
  Receipt was ungrantable), and three `lr_*` keys were listed as current when
  the nav had stopped using them.
- **Three copies of the same editor** — AdminPage, AdminUserManagement, and a
  dead OrganizationSettings imported by nothing.

- [x] `middleware/permissionGate.js` — `gate(keys)` applied at the mounts in
      index.js, so the whole mapping reads in one place and no handler can be
      registered above a router's own middleware. Method picks the action
      (GET→view, POST/PATCH→edit, DELETE→delete). Routers serving several
      modules (e.g. /vouchers) pass if the user holds ANY of their keys.
      25 mounts gated; auth/public/jobs/users deliberately left alone.
- [x] The `view < edit < delete` ladder now lives once in auth.js
      (`PERMISSION_LADDER` + `permits`) instead of being copied into the gate.
- [x] `permissions/catalogue.js` — one list, all 27 nav keys present, legacy
      keys flagged rather than dropped (App.jsx and LRModule still read them),
      plus a dev-time drift warning.
- [x] `components/PermissionEditor.jsx` — one editor for both screens: search,
      changed-only filter, per-location and per-group bulk set, role presets,
      copy-from-user, four levels, and a plain-language summary per location.
      A location toggle now greys its modules instead of hiding them, so it
      reads as the gate it is rather than looking like access was revoked.
- [x] Deleted the dead OrganizationSettings.jsx.
- [x] Verified: 63 tests pass (was 57) — view reads but cannot write, edit can
      write, no-permission is refused, admin bypasses, a multi-key route accepts
      any one key, and the catalogue covers every nav key. That last one is the
      guard that would have caught the attendance/lr_dump gap.

---

## Admin panel — professional UI/UX pass (2026-08-20)

Reference: a SaaS permissions screen (user list on the left, a slide-over on the
right with a profile header, a role selector, one switch per permission, and a
sticky Save). Goal was to bring the admin surfaces up to that standard *and*
make every control on them actually work.

### What was wrong

- **Two admin surfaces, two copies of user management.** `/admin/*` →
  `AdminLayout` → `AdminUserManagement`, and the in-app Settings tab →
  `AdminPage`, which carried its own create form, OTP handshake, user table and
  labour-worker CRUD. They had already drifted:
  - AdminPage filtered copy-from-user with `u.id !== editTarget` where
    `editTarget` is the user *object*, so the comparison was always true and it
    offered the account being edited as a source for its own permissions.
  - `isOtpEnabled` lived in both forms' state with **no control to set it**, so
    two-factor at login could never be turned on for anybody.
  - AdminPage's role guard returned before half its `useState` calls, making
    hook order depend on `me.role`.
- **The permission editor rendered eight keys four times each.** Permission keys
  are global — `pay` is one value on the user record — but the editor walked the
  location groups verbatim. `pay`, `vehicle`, `mileage`, `attendance`,
  `sell`, `balance_all`, `loading_status` and `lr_dump` appeared under every
  location, all bound to the same value. Flipping one appeared to flip the
  others, and a location's "All view" silently rewrote what the rest displayed.
- **"Changed (n)" diffed against the wrong user.** The baseline was captured
  once with `useState(() => ({ ...permissions }))` and never reset, so after
  clicking a second user it was still comparing against the first one's grants.
- **Nothing said what a module does.** Rows read "Balance — JK Super" with no
  hint of what the grantee would see.
- **Admins were shown a permission editor they bypass.** `App.jsx` returns true
  for every nav key when `role === 'admin'`; the editor gave no sign of that.
- Alerts instead of toasts on the worker CRUD, no validation before the OTP was
  sent, no resend cooldown, no loading skeletons, no empty states, no unsaved
  guard, self-deletion offered, last-admin deletion offered.

### What changed

- [x] `pages/admin/admin.css` — one namespaced (`.adm-`) design system built
      entirely on the index.css theme variables, so the same rules render in the
      always-dark `/admin` shell and in whatever theme the in-app tab is under.
      Panels, tabs, buttons, inputs, switches, level chips, permission rows,
      chips, callouts, data rows, drawer, OTP boxes, skeletons, empty states.
- [x] `permissions/catalogue.js` — a `hint` on every current module;
      `isSharedKey` / `SHARED_GROUPS` / `LOCATION_SECTIONS` split the eight
      company-wide keys out of the per-location duplication; the dev assert now
      also catches the hand-written and derived lists drifting apart.
- [x] `components/PermissionEditor.jsx` — rewritten. Each key renders exactly
      once. Switch turns a module on (defaults to View); View/Edit/Delete chips
      appear inline once it is on. Location access is its own section with a
      warning when nothing is selected. Baseline re-bases on `resetKey`.
      Search, changed-only, copy-from-user, per-group and per-location bulk set,
      legacy keys behind a disclosure, empty state when a filter matches nothing.
- [x] `pages/admin/AdminUserManagement.jsx` — rewritten as list + slide-over.
      Stat strip, role filter tabs, search, multi-select with a bulk bar,
      skeletons, empty states, retry on load failure. The drawer carries account
      details, a password generator with reveal/copy, the **two-factor switch
      that never existed**, a role picker with the admin-bypass explained, and
      the permission editor. Six-box OTP entry with auto-advance, paste and a
      30-second resend cooldown; step one's input survives a failed code.
      Unsaved-changes guard on ESC, backdrop and close. Self-deletion and
      last-admin deletion are blocked, self-demotion from admin is blocked.
      Labour workers moved to their own tab with edit, search and toasts.
- [x] `pages/AdminPage.jsx` — its duplicate user management deleted; it renders
      the same `AdminUserManagement`. Tabs grouped (People / Master data /
      System) and persisted. Role guard moved below the hooks. The organisation
      fields the settings endpoint already round-tripped now have inputs.
- [x] `pages/admin/AdminLayout.jsx` — grouped sidebar with collapse persisted,
      breadcrumb topbar, proper mobile drawer, Destination Rates added for
      parity. The redirect moved out of render into an effect. The `!important`
      block that forced every bare `input`/`select`/`.btn-*` dark is gone — it
      sets the theme variables instead, which is what let the new switches,
      chips and coloured buttons style themselves.

### Verified

- `npm run test:client` — 105 assertions pass across 4 files, including the new
  `permissions/catalogue.test.js` (24 assertions) that pins the invariant the
  rewrite depends on: every current key renders exactly once, `SHARED_GROUPS`
  matches what `isSharedKey` derives, locations keep only their own modules, and
  `summarise` counts unique keys rather than rendered rows.
- `npx vite build` — clean, 2155 modules.
- Grepped the removed identifiers (`SPerm`, `handleCreateWorker`, `sysSettings`,
  `getModuleIcon`, …) with word boundaries per `lessons.md`; nothing dangles.

### Not done

- No browser automation is available in this environment, so the screens were
  not clicked through. Build and unit tests pass; the visual result is unverified
  against a running app.
- `navPermKeys` still is not passed to the editor, so the nav-vs-catalogue half
  of the dev assert stays dormant. Wiring it needs the NAV list exported from
  `App.jsx`.
- The server still substitutes org default permissions when a created user is
  sent an empty `permissions` object. The editor warns "No access granted yet",
  but the two disagree about what that means.

### Follow-up — trimming the drawer (2026-08-20)

Feedback on the create-user drawer: the **Changed** filter had been switched on
and left the whole permission panel showing "No modules match / Nothing has been
changed in this panel yet" — a dead end reached in one click, on a screen where
nothing *can* have changed yet because the account does not exist.

- [x] Removed the Changed filter entirely — the button, the `changedOnly` state
      and its branch in the empty state.
- [x] The per-row change dots are now gated behind a `showChanges` prop, passed
      only when editing an existing account. Creating one marks every grant as
      new, so a dot on each said nothing.
- [x] Dropped the three-line info banner about View/Edit/Delete; the legend is
      one muted phrase on the summary line instead.
- [x] Dropped the "Show legacy keys" link. The section still appears for the
      accounts that hold a legacy key, but offering to reveal superseded keys on
      every new user was an invitation to set one.
- [x] Single-group sections (Kosli, Jhajjar, Bahadurgarh) no longer repeat the
      bulk view/edit/none links — the section header already covers exactly the
      same modules.
- [x] Drawer footer no longer restates the unsaved state; the header chip and
      the disabled Save button already say it.
- [x] Role cards given `minHeight` and explicit wrapping so the two-line
      description cannot clip in a narrow drawer.

### Follow-up — flattening the drawer form (2026-08-20)

"Where is the user name and email form" was the right question to ask of it. The
four inputs sat inside a card, inside a drawer, behind a 60px panel header with
an icon tile and a subtitle — and that header is what scrolled off the top,
leaving an unlabelled text box as the first thing on screen.

- [x] `.adm-sec` / `.adm-sec-hd` / `.adm-fields` / `.adm-toggle-row` in admin.css
      — a ruled uppercase label instead of a card header. One line of chrome,
      eight pixels from the fields it names, rather than sixty.
- [x] Account details, Role and the admin-bypass notice are flat sections now,
      not nested panels.
- [x] Fields laid out two per row that collapse to one under 210px each:
      **Name | Username** then **Email | Password**. Two rows instead of three,
      so the whole form is visible without scrolling in a 640px drawer.
- [x] Two-factor moved out of the permission-row styling into its own
      `.adm-toggle-row`, which is what it always was.
- [x] Location access is a chip row under a small label, not a card.
- [x] The permission editor opens with a "Module access" section label carrying
      the View/Edit/Delete legend, so all three sections of the drawer read the
      same way.
- [x] Field hints shortened — "Usernames cannot be changed once created" →
      "Cannot be changed", and similar. They sit under the input, where the
      shortest true sentence wins.

### Follow-up — the tab strip had no scrollbar (2026-08-20)

Ten tabs do not fit an admin-hub header at most widths, and the strip was set to
`scrollbar-width: none` with `::-webkit-scrollbar { display: none }`. It scrolled
fine but gave no sign it could, so "Email & Organisation" and "Google Drive
Backup" were simply invisible.

- [x] `.adm-tabs` now shows a 7px themed scrollbar — `scrollbar-width: thin` for
      Firefox, a styled thumb for WebKit. Written as `.adm .adm-tabs::-webkit-…`
      so it outranks the generic `.adm ::-webkit-scrollbar` that AdminLayout
      injects for its page scrollers, which would otherwise win on source order.
- [x] Bottom padding raised to 7px so the bar sits under the labels, not on them.
- [x] `.adm-tabs--plain` for the role filter inside the users panel header —
      same scroll behaviour without the pill chrome, replacing an inline style
      whose `padding: 0` would have put the bar through the text.
- [x] The active tab scrolls itself into view. The tab is restored from
      localStorage, so landing on "Google Drive Backup" used to show a strip
      with nothing apparently selected.

### Follow-up — shelve Generate Invoice, drop the NEW badges (2026-08-20)

- [x] **NEW badges gone.** All 12 `badge: 'NEW'` entries removed from the NAV
      list in App.jsx, plus the render branch and the `.nav-badge-new` rule and
      its `pulseGlow` keyframes in index.css. Every module carrying one had been
      in daily use for months, so the badge had stopped meaning "new" and was a
      pulsing green dot competing with the active-item indicator. `SOON` stays —
      it marks a nav entry that is actually disabled.

- [x] **Generate Invoice shelved**, not deleted:
      - Both nav entries (`invoice_dump`, `invoice_jharli`) and all three render
        branches removed, along with the `InvoiceModule` import and the
        `invoice_dump` line in `HIDDEN_AT_DUMP_GODOWNS`.
      - `invoice_jkl` and `invoice_main` render branches went with them — no nav
        entry had referenced either for some time.
      - The `invoice` key is out of `MODULES` and the `jharli_shared` group, so
        it can no longer be granted from the admin panel. Granting access to a
        screen with no way to reach it is worse than not offering it.
      - `UPDATE_ITEMS` lost the "Tax Invoice Generator" release note.
      - A saved `vgtc-active` of `invoice_*` now falls back to the dashboard,
        alongside the existing `lr_kosli`/`lr_jhajjar` migration. Without it,
        anyone whose last-used module was Generate Invoice would open to a blank
        page with no nav entry to leave by.

      Deliberately left alone so this is one commit to revert:
      `modules/InvoiceModule.jsx`, `server/routes/invoiceRoutes.js`, the
      `app.use('/api/invoices', …, gate('invoice'), …)` mount, and every existing
      `invoice` grant on a user record. ProfitLossSheet still reads `/invoices`
      for its GST figures and is unaffected.

- [x] `catalogue.test.js` updated: Jharli's own keys no longer include
      `invoice`, plus a new assertion that the key is offered nowhere.
      25 assertions, 106 across the suite.
