---
title: "Partner gateway (partner-gateway)"
description: "Kontrak API modul partner-gateway"
---
> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

[Kontrak API](../) › partner-gateway

| Endpoint | Ringkasan |
|---|---|
| `POST /api/v1/partner/echo` | Check a signed partner request with a JSON body (echoed back) |
| `GET /api/v1/partner/ping` | Check a signed partner request (no body) |

## `POST /api/v1/partner/echo`

**Check a signed partner request with a JSON body (echoed back)**

- Tanda tangan partner (header `x-partner-*`, signing v1 — lihat panduan partner)

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `message` | string | ya | panjang ≥ 1; panjang ≤ 1000 |

**Contoh request**

```http
POST /api/v1/partner/echo
Content-Type: application/json

{
  "message": "string"
}
```

**200 — Signature verified**

Pesan: `Signature partner valid; body diterima` (en: `Partner signature verified; body received`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Signature partner valid; body diterima",
  "data": {
    "partner_code": "string",
    "server_time": "2026-01-01T00:00:00.000Z",
    "message": "string"
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_PARTNER_HEADERS_MISSING` | Header `x-partner-*` tidak ada atau formatnya salah |
| 401 | `ERR_PARTNER_INVALID_KEY` | API key partner tidak dikenal atau nonaktif |
| 401 | `ERR_PARTNER_REPLAY_REJECTED` | Timestamp di luar toleransi atau nonce sudah dipakai |
| 401 | `ERR_PARTNER_SIGNATURE_INVALID` | Signature partner tidak cocok |
| 403 | `ERR_PARTNER_IP_FORBIDDEN` | IP pemanggil tidak ada di `ip_whitelist` partner |
| 403 | `ERR_PARTNER_ROUTE_FORBIDDEN` | Route tidak termasuk `allowed_routes` partner (atau khusus partner lain) |
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
        "field": "message",
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
  "message": "Header `x-partner-*` tidak ada atau formatnya salah",
  "error": {
    "type": "UNAUTHORIZED",
    "code": "ERR_PARTNER_HEADERS_MISSING",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 403</summary>

```json
{
  "success": false,
  "status_code": 403,
  "message": "IP pemanggil tidak ada di `ip_whitelist` partner",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PARTNER_IP_FORBIDDEN",
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

## `GET /api/v1/partner/ping`

**Check a signed partner request (no body)**

- Tanda tangan partner (header `x-partner-*`, signing v1 — lihat panduan partner)

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
GET /api/v1/partner/ping
```

**200 — Signature verified**

Pesan: `Signature partner valid; koneksi berhasil` (en: `Partner signature verified; connection works`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Signature partner valid; koneksi berhasil",
  "data": {
    "partner_code": "string",
    "server_time": "2026-01-01T00:00:00.000Z"
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 401 | `ERR_PARTNER_HEADERS_MISSING` | Header `x-partner-*` tidak ada atau formatnya salah |
| 401 | `ERR_PARTNER_INVALID_KEY` | API key partner tidak dikenal atau nonaktif |
| 401 | `ERR_PARTNER_REPLAY_REJECTED` | Timestamp di luar toleransi atau nonce sudah dipakai |
| 401 | `ERR_PARTNER_SIGNATURE_INVALID` | Signature partner tidak cocok |
| 403 | `ERR_PARTNER_IP_FORBIDDEN` | IP pemanggil tidak ada di `ip_whitelist` partner |
| 403 | `ERR_PARTNER_ROUTE_FORBIDDEN` | Route tidak termasuk `allowed_routes` partner (atau khusus partner lain) |
| 429 | `ERR_RATE_LIMITED` | Batas request terlampaui: tunggu `Retry-After` detik |
| 500 | `ERR_INTERNAL` | Error tak terduga di server (detail tidak pernah dikirim) |

<details><summary>Contoh 401</summary>

```json
{
  "success": false,
  "status_code": 401,
  "message": "Header `x-partner-*` tidak ada atau formatnya salah",
  "error": {
    "type": "UNAUTHORIZED",
    "code": "ERR_PARTNER_HEADERS_MISSING",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 403</summary>

```json
{
  "success": false,
  "status_code": 403,
  "message": "IP pemanggil tidak ada di `ip_whitelist` partner",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PARTNER_IP_FORBIDDEN",
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
