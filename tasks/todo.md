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
