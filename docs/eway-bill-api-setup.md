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

1. **₹50,000 threshold.** Below that no e-way bill exists at all. A ₹19,100
   canter load will never appear here; a loaded trailer always will. The manual
   form stays for the small ones.
2. **VGTC must be named as transporter** on the bill, by whoever generates it.
   Where a plant leaves that field blank the load is invisible to this API.
   Worth checking a week of paperwork before paying for anything.
3. **The vehicle number arrives with Part-B.** If the plant has not entered it,
   the draft has no truck and the operator types that one field. The screen says
   so on the row rather than leaving a blank to trip over.

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

## Step 4 — Store the secrets

```bash
firebase apphosting:secrets:set EWB_CLIENT_ID     --project vgtc-management
firebase apphosting:secrets:set EWB_CLIENT_SECRET --project vgtc-management
firebase apphosting:secrets:set EWB_PASSWORD      --project vgtc-management
firebase apphosting:secrets:set EWB_PUBLIC_KEY    --project vgtc-management
```

Then in `apphosting.yaml` set `EWB_GSTIN`, `EWB_USERNAME`, `EWB_BASE_URL`, and
finally `EWB_ENABLED: "true"`. Until that last flag flips, the server makes no
outbound call at all.

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
