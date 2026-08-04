# E-way bill API — getting VGTC connected

The Stock → Challan form asks for eight fields. Seven of them already exist in
NIC's e-way bill system, because the cement plant names VGTC as the transporter
when it generates the bill. Once this is connected, the operator taps a load and
types only the LR number.

The code is written and tested. What follows is the part only VGTC can do.
Budget **1–2 weeks**, and start at step 3 first — it is the one that surprises
people.

---

## Before spending anything, three limits

All three were written as warnings before any real paperwork had been seen. A
JK Lakshmi delivery slip from 01 Aug 2026 (invoice 7330200286) settles each of
them, and settles them well — see "What the paperwork proved" below.

1. **~~₹50,000 threshold.~~ Not a limit here.** The rule is real for
   inter-state movement, but the Jharli loads are intra-state Haryana and the
   plant raises a bill regardless: the slip in hand is ₹19,100 and carries
   e-way bill 352304414369. The earlier claim that "a ₹19,100 canter load will
   never appear here" was an assumption, and it was wrong.
2. **~~VGTC must be named as transporter.~~ It is.** The slip prints
   `TRANSPORTER=VIKAS GOODS TRANSPORT CO.` against the consignment. The one
   thing still unverified is whether the plant records VGTC's *GSTIN*
   (06ARIPK9021C2Z2) in the transporter field — `GetEwayBillsForTransporter`
   matches on that, not on the name — so confirm it on the portal before
   paying for anything.
3. **~~The vehicle arrives with Part-B, maybe.~~ It is filled at the gate.**
   The slip prints `TRUCK NO=HR63E2923` at the moment of issue, so Part-B is
   complete when the load leaves and the draft will carry a truck.

### What the paperwork proved

Every field the Challan form asks for is on that one slip, and all of it comes
back from `GetEwayBill`:

| Challan field | On the slip |
|---|---|
| Challan / invoice no | 7330200286 |
| Date | 2026-08-01 |
| Material | JK Lakshmi OPC 43 (H) |
| Quantity | 2.500 MT = 50 bags (`toBags` already converts this) |
| Truck | HR63E2923 |
| Party | SAI BUILDING MATERIAL SUPPLIER |
| E-way bill | 352304414369 |

Only the LR number is not there, which is the one field the operator was always
going to type.

---

## Step 1 — Sandbox credentials

Email **ewaybill.api.helpdesk@gmail.com** from the email address registered
against VGTC's GSTIN on the e-way bill portal. Ask for pre-production (sandbox)
API access for a transporter.

They return:

| What | Goes into |
|---|---|
| `client-id` | secret `EWB_CLIENT_ID` |
| `client-secret` | secret `EWB_CLIENT_SECRET` |
| API username | env `EWB_USERNAME` |
| API password | secret `EWB_PASSWORD` |
| NIC RSA public key | secret `EWB_PUBLIC_KEY` |

Set `EWB_BASE_URL` to the sandbox host they give you, **not** the production one.

## Step 2 — Production API login

1. Log in at <https://ewaybillgst.gov.in>.
2. **Registration → For API**. Enter the OTP sent to the registered mobile.
3. Create the API username and password. If going through a GSP instead, use
   **Add/New GSP**, pick the provider, and set the username and password there.
4. Fill in the test summary report NIC asks for after sandbox testing, then
   email **nicmof@nic.in** to be moved to production.

## Step 3 — A static egress IP (do this first)

**NIC whitelists one fixed IP address.** Firebase App Hosting runs on Cloud Run
and its outbound IP changes, so every call will be rejected until this exists —
and it is usually discovered late, after the credentials are already paid for.

On the `vgtc-management` GCP project:

```bash
gcloud compute addresses create vgtc-ewb-nat-ip --region=asia-south1

gcloud compute networks vpc-access connectors create vgtc-connector \
  --region=asia-south1 --network=default --range=10.8.0.0/28

gcloud compute routers create vgtc-router \
  --region=asia-south1 --network=default

gcloud compute routers nats create vgtc-nat \
  --router=vgtc-router --region=asia-south1 \
  --nat-external-ip-pool=vgtc-ewb-nat-ip \
  --auto-allocate-nat-external-ip=false \
  --nat-all-subnet-ip-ranges

gcloud compute addresses describe vgtc-ewb-nat-ip \
  --region=asia-south1 --format='value(address)'
```

Give that last address to NIC for whitelisting, then point the App Hosting
backend at the connector with egress set to route all traffic through it.

Roughly ₹1,500–2,500/month for the connector and the reserved address. **If that
is not worth it, use a GSP instead** — most host the integration themselves, so
the whitelisted IP is theirs, not yours.

## Step 4 — Store the secrets, then add the config

**`apphosting.yaml` deliberately contains no `EWB_*` entries at all.** They were
added ahead of the credentials and it cost two failed production rollouts: App
Hosting validates the whole file at deploy time, so a broken or unresolvable
entry does not merely leave the feed switched off — it blocks every unrelated
change from reaching production, with no error visible from the repo.

So: create the secrets, confirm them, then add the config, and **verify that
deploy lands before adding anything else**.

```bash
firebase apphosting:secrets:set EWB_CLIENT_ID     --project vgtc-management
firebase apphosting:secrets:set EWB_CLIENT_SECRET --project vgtc-management
firebase apphosting:secrets:set EWB_PASSWORD      --project vgtc-management
firebase apphosting:secrets:set EWB_PUBLIC_KEY    --project vgtc-management

# each must print versions, not a 404
firebase apphosting:secrets:describe EWB_CLIENT_ID --project vgtc-management
```

Only then append to the `env:` block. Give every variable a **non-empty**
value — an empty `value: ""` is untested here and is the remaining suspect from
those failed rollouts:

```yaml
  - variable: EWB_ENABLED
    value: "true"
    availability:
      - RUNTIME
  - variable: EWB_BASE_URL          # sandbox is a different host
    value: "https://api.ewaybillgst.gov.in"
    availability:
      - RUNTIME
  - variable: EWB_GSTIN
    value: "06XXXXXXXXXXXXX"        # VGTC's own GSTIN
    availability:
      - RUNTIME
  - variable: EWB_USERNAME
    value: "the-api-username"
    availability:
      - RUNTIME
  - variable: EWB_CLIENT_ID
    secret: EWB_CLIENT_ID
  - variable: EWB_CLIENT_SECRET
    secret: EWB_CLIENT_SECRET
  - variable: EWB_PASSWORD
    secret: EWB_PASSWORD
  - variable: EWB_PUBLIC_KEY
    secret: EWB_PUBLIC_KEY
```

Push, then confirm the new bundle is actually being served before moving on:

```bash
curl -s https://vgtc.site/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

Until `EWB_ENABLED` is `"true"` and the rest resolve, the server makes no
outbound call at all and the challan panel reads "not connected".

## Step 5 — Schedule the sync

```bash
gcloud scheduler jobs create http vgtc-eway-sync \
  --schedule="*/30 6-22 * * *" --time-zone="Asia/Kolkata" \
  --uri="https://<host>/api/jobs/eway-sync" --http-method=POST \
  --headers="X-Cron-Secret=<CRON_SECRET>"
```

Every 30 minutes through the working day. The sync also runs on demand from the
**Refresh** button on the panel, for when a load is on the gate and nobody wants
to wait.

## Step 6 — Check it

1. Open **Stock → Challans**. The panel should list today's loads instead of
   "not connected".
2. `GET /api/eway/status` reports `configured`, the last sync time and the last
   error. That is the first place to look when the list is empty.
3. Tap a load, type the LR number, save. The challan should be indistinguishable
   from a typed one, and the bill should drop off the panel.

---

## If you sign a GSP instead

Most GSPs (ClearTax, Masters India, WebTel, Cygnet, Vayana, Adaequare) wrap NIC
in plain REST and handle both the encryption and the IP whitelisting. Only
`server/utils/ewbClient.js` changes — the mapping, storage, sync job, routes and
the panel are all unaffected, because none of them know how the bytes arrive.

## Where things live

| Piece | File |
|---|---|
| NIC protocol: auth, decryption, HMAC | `server/utils/ewbClient.js` |
| Bill → challan mapping | `server/utils/ewbService.js` |
| Storage, keyed on `ewbNo` | `server/utils/ewbStore.js` |
| Sync orchestration | `server/utils/ewbSync.js` |
| Scheduled job | `server/jobs.js` (`eway-sync`) |
| API | `server/routes/ewayRoutes.js` |
| The panel | `client/src/components/EwayBillPanel.jsx` |
