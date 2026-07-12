# VGTC Management System — API Documentation

**Base URL:** `https://<host>/api`
**Authentication:** Bearer JWT token in `Authorization` header unless noted otherwise.
**Content-Type:** `application/json`

All authenticated endpoints require:
```
Authorization: Bearer <token>
```

Role-based access:
- **requireAuth** — Any logged-in user
- **requireAdmin** — Admin role only
- **requireLabourAuth** — Labour worker token

---

## Auth (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None | Login |
| POST | `/api/auth/verify-otp` | None | Verify OTP |
| POST | `/api/auth/resend-otp` | None | Resend OTP |
| GET | `/api/auth/me` | requireAuth | Get current user |
| GET | `/api/auth/status` | None | Firebase connection status |

### POST `/api/auth/login`
**Request Body:**
```json
{ "username": "string", "password": "string", "plant": "string?", "godown": "string?" }
```
**Response:**
```json
{ "token": "jwt_string", "user": { ... } }
```
Or if OTP is enabled:
```json
{ "requireOtp": true, "userId": "string", "email": "string" }
```

### POST `/api/auth/verify-otp`
**Request Body:**
```json
{ "userId": "string", "code": "string", "plant": "string?", "godown": "string?" }
```
**Response:**
```json
{ "token": "jwt_string", "user": { ... } }
```

### POST `/api/auth/resend-otp`
**Request Body:**
```json
{ "userId": "string" }
```

### GET `/api/auth/me`
**Response:** Current user object.

### GET `/api/auth/status`
**Response:** Firebase connection status.

---

## Users (`/api/users`)

All endpoints require **requireAdmin**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| PATCH | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

### POST `/api/users`
**Request Body:**
```json
{
  "name": "string",
  "username": "string",
  "password": "string",
  "role": "string",
  "email": "string?",
  "permissions": "object?"
}
```

---

## Vehicles (`/api/vehicles`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vehicles` | List all vehicles |
| POST | `/api/vehicles` | Create vehicle |
| PATCH | `/api/vehicles/:id` | Update vehicle |
| DELETE | `/api/vehicles/:id` | Delete vehicle |
| POST | `/api/vehicles/deduct-gps` | Deduct GPS fees |
| GET | `/api/vehicles/alerts/report` | Send fleet-wide alert email |
| GET | `/api/vehicles/alerts/vehicle/:id` | Send single vehicle alert email |
| DELETE | `/api/vehicles/owners` | Delete owner + all their vehicles |

### POST `/api/vehicles`
**Request Body:**
```json
{
  "truckNo": "string",
  "ownerName": "string",
  "vehicleType": "string",
  "make": "string",
  "model": "string"
}
```

### POST `/api/vehicles/deduct-gps`
**Request Body:**
```json
{ "date": "string?", "remark": "string?" }
```

### DELETE `/api/vehicles/owners`
**Request Body:**
```json
{ "ownerName": "string" }
```

---

## Vehicle Advances (`/api/vehicle-advances`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vehicle-advances` | List all advances |
| GET | `/api/vehicle-advances/:truckNo` | Advances for a truck |
| POST | `/api/vehicle-advances` | Create advance |
| DELETE | `/api/vehicle-advances/:id` | Delete advance |

### POST `/api/vehicle-advances`
**Request Body:**
```json
{
  "truckNo": "string",
  "type": "debit | credit",
  "amount": "number",
  "date": "string?",
  "remark": "string?"
}
```

---

## Maintenance (`/api/maintenance`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/maintenance/parts-catalog` | Parts catalog |
| GET | `/api/maintenance` | All maintenance records |
| GET | `/api/maintenance/summary/:truckNo` | Summary for vehicle |
| GET | `/api/maintenance/vehicle/:truckNo` | Records for vehicle |
| GET | `/api/maintenance/alerts` | Maintenance alerts |
| POST | `/api/maintenance` | Create record |
| PATCH | `/api/maintenance/:id` | Update record |
| DELETE | `/api/maintenance/:id` | Delete record |

### POST `/api/maintenance`
**Request Body:**
```json
{
  "truckNo": "string",
  "partId": "string",
  "date": "string",
  "kmAtChange": "number",
  "cost": "number"
}
```

---

## Mileage (`/api/mileage`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mileage/last-km/:truckNo` | Last odometer reading |
| GET | `/api/mileage/vehicle/:truckNo` | All trips for vehicle |
| GET | `/api/mileage/all-vehicles` | Summary stats per truck |
| GET | `/api/mileage/fuel` | All fuel logs |
| GET | `/api/mileage/fuel/:truckNo` | Fuel logs for truck |
| POST | `/api/mileage/fuel` | Add fuel log |
| DELETE | `/api/mileage/fuel/:id` | Delete fuel log |

### GET `/api/mileage/fuel`
**Query:** `?truckNo=<string>`

### POST `/api/mileage/fuel`
**Request Body:**
```json
{
  "truckNo": "string",
  "date": "string",
  "amount": "number",
  "pump": "string?"
}
```

---

## Vouchers (`/api/vouchers`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vouchers` | All vouchers |
| GET | `/api/vouchers/:type` | Vouchers by type |
| POST | `/api/vouchers` | Create voucher |
| PATCH | `/api/vouchers/:id` | Update voucher |
| DELETE | `/api/vouchers/:id` | Delete voucher |

**Voucher types:** `Dump`, `JK_Super`, `JK_Lakshmi`

### POST `/api/vouchers`
**Request Body:**
```json
{
  "lrNo": "string",
  "date": "string",
  "truckNo": "string",
  "type": "Dump | JK_Super | JK_Lakshmi",
  "weight": "number",
  "rate": "number"
}
```

---

## Loading Receipts

All endpoints require **requireAuth**. Four location prefixes share identical route structure:

| Location | Base Path |
|----------|-----------|
| JK Super / Dump | `/api/lr` |
| Kosli | `/api/kosli/lr` |
| Jhajjar | `/api/jhajjar/lr` |
| JK Lakshmi | `/api/jkl/lr` |

For each base path `{base}`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `{base}/` | List all LRs |
| POST | `{base}/` | Create LR |
| PATCH | `{base}/:id/billing` | Update billing info |
| PATCH | `{base}/:id` | Update LR |
| PUT | `{base}/:id` | Replace LR |
| DELETE | `{base}/:id` | Delete LR |
| POST | `{base}/invoice/generate` | Generate invoice |

---

## Stock

All endpoints require **requireAuth**. Four location prefixes share identical route structure:

| Location | Base Path |
|----------|-----------|
| JK Super / Dump | `/api/stock` |
| Kosli | `/api/kosli/stock` |
| Jhajjar | `/api/jhajjar/stock` |
| JK Lakshmi | `/api/jkl/stock` |

For each base path `{base}`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `{base}/additions` | List stock additions |
| POST | `{base}/additions` | Add stock |
| DELETE | `{base}/additions/:id` | Delete addition |
| GET | `{base}/challans` | List challans |
| POST | `{base}/challans` | Create challan |
| POST | `{base}/challans/deduct` | Deduct from challan |
| PATCH | `{base}/challans/:id` | Update challan |
| DELETE | `{base}/challans/:id` | Delete challan |
| GET | `{base}/materials/list` | List materials |
| POST | `{base}/materials` | Create material |
| DELETE | `{base}/materials/:id` | Delete material |
| POST | `{base}/sync-lr` | Sync from loading receipts |

---

## Cashbook

All endpoints require **requireAuth**. Two location prefixes:

| Location | Base Path |
|----------|-----------|
| Default | `/api/cashbook` |
| JK Lakshmi | `/api/jkl/cashbook` |

For each base path `{base}`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `{base}/` | All entries |
| POST | `{base}/deposit` | Add deposit |
| POST | `{base}/cash-out` | Add cash-out |
| DELETE | `{base}/:id` | Delete entry |

### POST `{base}/deposit` or `{base}/cash-out`
**Request Body:**
```json
{ "amount": "number", "remark": "string", "date": "string?" }
```

---

## Sales (`/api/sell`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sell` | List sales |
| POST | `/api/sell` | Create sale |
| PATCH | `/api/sell/:id` | Update sale |
| DELETE | `/api/sell/:id` | Delete sale |

### GET `/api/sell`
**Query:** `?brand=dump|jkl`

---

## Stock Transfers (`/api/stock-transfers`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stock-transfers` | All transfers |
| GET | `/api/stock-transfers/locations` | Available locations |
| POST | `/api/stock-transfers` | Create transfer |
| DELETE | `/api/stock-transfers/:id` | Delete transfer |

### POST `/api/stock-transfers`
**Request Body:**
```json
{
  "stockLocation": "string",
  "sourceMaterial": "string",
  "destMaterial": "string",
  "quantity": "number"
}
```

---

## Profiles (`/api/profiles`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profiles` | List profiles |
| POST | `/api/profiles` | Create profile |
| PUT | `/api/profiles/:id` | Update profile |
| DELETE | `/api/profiles/:id` | Delete profile |

---

## Payments (`/api/payments`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/payments` | List payments |
| POST | `/api/payments` | Create payment |

---

## Parties (`/api/parties`)

All endpoints require **requireAuth**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/parties` | List parties |
| POST | `/api/parties` | Create party |
| PATCH | `/api/parties/:id` | Update party |
| DELETE | `/api/parties/:id` | Delete party |

---

## Labour (`/api/labour`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/labour/login` | None | Labour worker login |
| GET | `/api/labour/workers` | requireAdmin | List workers |
| POST | `/api/labour/workers` | requireAdmin | Create worker |
| PATCH | `/api/labour/workers` | requireAdmin | Update worker |
| DELETE | `/api/labour/workers` | requireAdmin | Delete worker |
| GET | `/api/labour/today` | requireLabourAuth | Today's LRs for labourer |
| PATCH | `/api/labour/lr/:godown/:id/heard` | requireLabourAuth | Mark voice heard |
| PATCH | `/api/labour/lr/:godown/:id/status` | requireLabourAuth | Update LR status |

---

## Audit (`/api/audit`)

All endpoints require **requireAdmin**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/audit` | Paginated audit log |

### GET `/api/audit`
**Query:** `?limit=30&offset=0`

---

## Backup (`/api/backup`)

All endpoints require **requireAdmin**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/backup/auth-status` | Google Drive auth status |
| GET | `/api/backup/logs` | Backup logs |
| GET | `/api/backup/auth-url` | Get OAuth URL |
| POST | `/api/backup/submit-code` | Submit OAuth code |
| POST | `/api/backup/now` | Trigger backup now |

---

## Public (No Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/receipt/:truckNo/:date` | Public receipt lookup |
| GET | `/api/public/org/:id` | Public org info |
| GET | `/api/weather` | Weather data |

### GET `/api/weather`
**Query:** `?city=<string>`

---

## Server Root (Inline Routes)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | None | Health check + OAuth callback |
