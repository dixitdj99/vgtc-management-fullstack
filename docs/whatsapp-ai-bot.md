# WhatsApp AI assistant

Unknown inbound WhatsApp text goes to Gemini `gemini-3.5-flash-lite` after the
existing command handlers. `HELP`, vehicle reports, challans, payments, and
interactive buttons retain their existing paths. Natural-language questions
containing a truck number and balance, challan, trip, PDF, or Excel terms route
to the existing read-only handlers. Those handlers check that the sender is a
registered owner, driver, clerk, or admin for that vehicle. The AI receives
only the user's text and up to three recent exchanges from that sender; it
has no database access and must direct other live-data questions to commands.

## Local setup: paste values in `server/.env`

`server/.env` is gitignored. Blank placeholders are already present. Paste each
value after `=` and restart the server. `server/.env.example` shows the same
keys for a fresh installation. Never paste keys into client code or commit them.

```dotenv
# Create in https://aistudio.google.com/api-keys
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
WHATSAPP_AI_ENABLED=true

# Meta for Developers > your app > App Settings > Basic > App Secret
META_APP_SECRET=

# Meta WhatsApp API Setup / Getting Started, or set these in WhatsApp Control
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_WABA_ID=

# Choose a long random value. Enter same value in Meta webhook configuration.
META_WEBHOOK_VERIFY_TOKEN=
```

`GEMINI_API_KEY` and `META_APP_SECRET` must be server environment variables.
WhatsApp sending credentials and verify token can instead be entered and saved
in **WhatsApp Control** in the VGTC admin UI. Set **Enabled**, Phone Number ID,
WABA ID, Access Token, Webhook Verify Token, and correct admin/clerk/labour phone
numbers there. Saved UI values take precedence over environment values. Use a
long-lived production Meta access token; Meta's temporary setup token expires.
An old access token was previously embedded in source; rotate it if it was
active.

## Meta webhook

In Meta app's WhatsApp configuration, set callback URL to
`https://<public-backend-host>/api/whatsapp/webhook`. Set Verify Token to the
same value as `META_WEBHOOK_VERIFY_TOKEN` or the WhatsApp Control field. Subscribe
to the `messages` webhook field. Meta must reach this HTTPS URL from the public
internet. GET challenge uses the verify token. POST callbacks require the Meta
App Secret and valid `X-Hub-Signature-256`; missing secret returns HTTP 503.

## Firebase App Hosting

`apphosting.yaml` already references `GEMINI_API_KEY` and `META_APP_SECRET` as
Cloud Secret Manager secrets. Create them before deploying this revision:

```powershell
firebase apphosting:secrets:set GEMINI_API_KEY --project vgtc-management
firebase apphosting:secrets:set META_APP_SECRET --project vgtc-management
```

The CLI prompts for each value. Deploy a new App Hosting rollout, then fill
WhatsApp sending credentials in VGTC's WhatsApp Control UI. Alternatively,
configure `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, and
`META_WEBHOOK_VERIFY_TOKEN` as server environment variables for that backend.
The UI's saved values take precedence. Keep Meta access tokens in a server-side
secret store in production.

## Smoke test

1. Verify Meta webhook setup succeeds; GET challenge must return HTTP 200.
2. Send `HELP` from a WhatsApp number to confirm existing replies work.
3. Send `What are your working hours?` to check the Gemini fallback. It should
   answer generally and must not invent a live VGTC value.
4. Send `BALANCE <registered-truck-number>` from that vehicle's registered phone
   to check existing database-backed commands.

Empty Gemini key disables AI replies. `WHATSAPP_AI_ENABLED=false` disables AI
without changing existing commands. A live Meta/Gemini round-trip cannot be
verified until valid credentials and a reachable callback are configured.

References: [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key),
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
[Firebase App Hosting secrets](https://firebase.google.com/docs/app-hosting/configure).

## Behavior and limits

- Existing commands run before AI. Only unmatched inbound text enters Gemini.
- `PAID` and `LOADED` actions accept configured clerk/admin or labour/admin
  sender numbers respectively.
- Interactive button replies, delivery-status callbacks, and `fromMe` legacy
  events never enter Gemini.
- Meta message IDs are deduplicated in memory for one hour. Conversation
  context expires after 30 minutes; deployment restarts clear it.
- Five AI requests per sender per minute. Input is capped at 1,200 characters,
  output at 1,400 characters. Gemini timeout is 40 seconds.
- Failure sends a short busy response. Webhook acknowledges Meta immediately.
- Gemini free-tier prompts may be used by Google to improve its products.
  Do not send private business records to this free-tier assistant.

## Verify

Run `node --test server/tests/whatsappAiService.test.js
server/tests/whatsappAiWebhook.test.js
server/tests/metaWebhookSignature.test.js` from repository root.

The AI gives general answers only. It does not execute actions or read live
records on behalf of the sender. Some older interactive cashbook and document
update handlers still need a separate sender-authorization audit.
