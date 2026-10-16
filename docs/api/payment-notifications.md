# Webhooks (`payment-notifications`)

> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

[Kontrak API](README.md) › payment-notifications

| Endpoint | Ringkasan |
|---|---|
| `POST /api/webhooks/demo-pay` | Demo Pay payment notification (vendor webhook, idempotent per event id) |

## `POST /api/webhooks/demo-pay`

**Demo Pay payment notification (vendor webhook, idempotent per event id)**

- Signature webhook vendor (header `x-demo-pay-signature`)

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `id` | string | ya | panjang ≥ 1; panjang ≤ 200 |
| `type` | string | ya | panjang ≥ 1; panjang ≤ 100 |
| `data` | object | ya |  |
| `data.payment_id` | string | ya | panjang ≥ 1; panjang ≤ 100 |
| `data.status` | string | ya | salah satu: `pending`, `succeeded`, `failed` |
| `data.amount` | integer | ya | ≥ 0 |
| `data.currency` | string | ya | panjang ≥ 3; panjang ≤ 3 |

**Contoh request**

```http
POST /api/webhooks/demo-pay
Content-Type: application/json

{
  "id": "string",
  "type": "string",
  "data": {
    "payment_id": "string",
    "status": "pending",
    "amount": 0,
    "currency": "string"
  }
}
```

**200 — Received (or already received)**

Pesan: `Notifikasi pembayaran diterima` (en: `Payment notification received`) · `Notifikasi pembayaran ini sudah pernah diterima` (en: `This payment notification was already received`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Notifikasi pembayaran diterima",
  "data": {
    "received": true,
    "duplicate": true
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_WEBHOOK_SIGNATURE_INVALID` | Signature webhook vendor tidak ada atau tidak cocok |
| 413 | `ERR_PAYLOAD_TOO_LARGE` | Body melebihi `HTTP_BODY_LIMIT_BYTES` |
| 429 | `ERR_RATE_LIMITED` | Batas request terlampaui: tunggu `Retry-After` detik |
| 500 | `ERR_INTERNAL` | Error tak terduga di server (detail tidak pernah dikirim) |

<details><summary>Contoh 400</summary>

```json
{
  "success": false,
  "status_code": 400,
  "message": "Input tidak memenuhi skema (lihat `details`)",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [
      {
        "field": "id",
        "message": "Required"
      }
    ]
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 401</summary>

```json
{
  "success": false,
  "status_code": 401,
  "message": "Signature webhook vendor tidak ada atau tidak cocok",
  "error": {
    "type": "UNAUTHORIZED",
    "code": "ERR_WEBHOOK_SIGNATURE_INVALID",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 413</summary>

```json
{
  "success": false,
  "status_code": 413,
  "message": "Body melebihi `HTTP_BODY_LIMIT_BYTES`",
  "error": {
    "type": "PAYLOAD_TOO_LARGE",
    "code": "ERR_PAYLOAD_TOO_LARGE",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 429</summary>

```json
{
  "success": false,
  "status_code": 429,
  "message": "Batas request terlampaui: tunggu `Retry-After` detik",
  "error": {
    "type": "TOO_MANY_REQUESTS",
    "code": "ERR_RATE_LIMITED",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 500</summary>

```json
{
  "success": false,
  "status_code": 500,
  "message": "Error tak terduga di server (detail tidak pernah dikirim)",
  "error": {
    "type": "INTERNAL_SERVER_ERROR",
    "code": "ERR_INTERNAL",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>
