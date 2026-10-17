# Kontrak API

> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

Kontrak setiap endpoint: request, response sukses, dan setiap error beserta code-nya. Sumbernya dokumen OpenAPI yang sama dengan snapshot `openapi.json` di folder ini (dan Scalar di `<API_BASE_PATH>/docs` saat aplikasi berjalan).

## Dasar

- Base URL: `/api` (`API_BASE_PATH`); versi API ada di path (`/api/v1/...`). Health, docs dan webhook vendor berada di luar `/v1`.
- Nama field request & response **snake_case** (key lain → 400 `ERR_NON_SNAKE_CASE_KEY`); waktu dalam ISO 8601 UTC (`2026-01-01T00:00:00.000Z`).
- Bahasa pesan mengikuti `Accept-Language` (`id` / `en`, default `id`); setiap respons membawa `X-Request-ID`.
- Autentikasi: access token (`Authorization: Bearer`) — [panduan frontend](../auth-guide.md); tanda tangan partner — [panduan partner](../partner-integration-guide.md); webhook vendor diverifikasi signature vendornya.

## Envelope

Sukses:

```json
{
  "success": true,
  "status_code": 200,
  "message": "Data berhasil diambil",
  "data": {}
}
```

List berhalaman menambah `meta`:

```json
{
  "meta": {
    "current_page": 1,
    "per_page": 20,
    "total_items": 1,
    "total_pages": 1
  }
}
```

Error:

```json
{
  "success": false,
  "status_code": 400,
  "message": "Validasi data gagal",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [
      {
        "field": "email",
        "message": "Invalid email"
      }
    ]
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

## Modul

- [auth](auth.md) — 6 endpoint
- [health](health.md) — 3 endpoint
- [orders](orders.md) — 11 endpoint
- [partner-credentials](partner-credentials.md) — 10 endpoint
- [partner-gateway](partner-gateway.md) — 2 endpoint
- [payment-notifications](payment-notifications.md) — 1 endpoint
- [projects](projects.md) — 6 endpoint
  - [project-budgets](projects/project-budgets.md) — 5 endpoint
  - [project-tasks](projects/project-tasks.md) — 6 endpoint
- [users](users.md) — 8 endpoint

## Platform

Route di luar modul (didaftarkan langsung oleh `src/app.ts`).

### `GET /`

**Service identity: name, environment and version**

- Publik (tanpa autentikasi)

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
GET /
```

**200 — Service is online**

Pesan: `Layanan aktif` (en: `Service online`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Layanan aktif",
  "data": {
    "name": "string",
    "environment": "development",
    "version": "string"
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 429 | `ERR_RATE_LIMITED` | Batas request terlampaui: tunggu `Retry-After` detik |
| 500 | `ERR_INTERNAL` | Error tak terduga di server (detail tidak pernah dikirim) |

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

## Kode error

| Code | HTTP | `error.type` | Arti |
|---|---|---|---|
| `ERR_AUTH_INVALID_CREDENTIALS` | 401 | `UNAUTHORIZED` | Email atau password salah (sengaja tidak dibedakan) |
| `ERR_AUTH_LOGIN_LOCKED` | 429 | `TOO_MANY_REQUESTS` | Terlalu banyak percobaan login untuk email ini dari klien ini |
| `ERR_AUTH_REFRESH_INVALID` | 401 | `UNAUTHORIZED` | Refresh token tidak ada, kedaluwarsa, atau sudah dicabut: login ulang |
| `ERR_AUTH_REFRESH_REUSED` | 401 | `UNAUTHORIZED` | Refresh token lama dipakai ulang: seluruh sesi dicabut |
| `ERR_AUTH_TOKEN_EXPIRED` | 401 | `UNAUTHORIZED` | Access token kedaluwarsa: refresh lalu ulangi |
| `ERR_AUTH_TOKEN_INVALID` | 401 | `UNAUTHORIZED` | Access token tidak valid |
| `ERR_BAD_REQUEST` | 400 | `BAD_REQUEST` | Aturan bisnis dilanggar |
| `ERR_CONFLICT` | 409 | `CONFLICT` | Bentrok dengan data yang ada (mis. nilai unik sudah dipakai) |
| `ERR_CSRF_ORIGIN_FORBIDDEN` | 403 | `FORBIDDEN` | `Origin` tidak diizinkan untuk endpoint ber-cookie (CSRF) |
| `ERR_EXT_ERROR` | 502 | `EXTERNAL_SERVICE_ERROR` | Layanan vendor menjawab dengan error |
| `ERR_EXT_TIMEOUT` | 504 | `EXTERNAL_SERVICE_ERROR` | Layanan vendor tidak menjawab tepat waktu |
| `ERR_EXT_UNREACHABLE` | 502 | `EXTERNAL_SERVICE_ERROR` | Layanan vendor tidak bisa dihubungi |
| `ERR_FORBIDDEN` | 403 | `FORBIDDEN` | Akses ditolak |
| `ERR_INTERNAL` | 500 | `INTERNAL_SERVER_ERROR` | Error tak terduga di server (detail tidak pernah dikirim) |
| `ERR_INVALID_INPUT` | 400 | `VALIDATION_ERROR` | Input tidak memenuhi skema (lihat `details`) |
| `ERR_INVALID_JSON` | 400 | `VALIDATION_ERROR` | Body bukan JSON yang valid |
| `ERR_NON_SNAKE_CASE_KEY` | 400 | `VALIDATION_ERROR` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| `ERR_NOT_FOUND` | 404 | `NOT_FOUND` | Data tidak ditemukan |
| `ERR_PARTNER_HEADERS_MISSING` | 401 | `UNAUTHORIZED` | Header `x-partner-*` tidak ada atau formatnya salah |
| `ERR_PARTNER_INVALID_KEY` | 401 | `UNAUTHORIZED` | API key partner tidak dikenal atau nonaktif |
| `ERR_PARTNER_IP_FORBIDDEN` | 403 | `FORBIDDEN` | IP pemanggil tidak ada di `ip_whitelist` partner |
| `ERR_PARTNER_REPLAY_REJECTED` | 401 | `UNAUTHORIZED` | Timestamp di luar toleransi atau nonce sudah dipakai |
| `ERR_PARTNER_ROUTE_FORBIDDEN` | 403 | `FORBIDDEN` | Route tidak termasuk `allowed_routes` partner (atau khusus partner lain) |
| `ERR_PARTNER_SIGNATURE_INVALID` | 401 | `UNAUTHORIZED` | Signature partner tidak cocok |
| `ERR_PAYLOAD_TOO_LARGE` | 413 | `PAYLOAD_TOO_LARGE` | Body melebihi `HTTP_BODY_LIMIT_BYTES` |
| `ERR_RATE_LIMITED` | 429 | `TOO_MANY_REQUESTS` | Batas request terlampaui: tunggu `Retry-After` detik |
| `ERR_ROLE_FORBIDDEN` | 403 | `FORBIDDEN` | Role pengguna tidak diizinkan untuk endpoint ini |
| `ERR_ROUTE_NOT_FOUND` | 404 | `NOT_FOUND` | Route tidak ada |
| `ERR_SELF_LOCKOUT_FORBIDDEN` | 403 | `FORBIDDEN` | Admin tidak bisa menghapus, menonaktifkan, atau menurunkan role akunnya sendiri |
| `ERR_SERVICE_UNAVAILABLE` | 503 | `SERVICE_UNAVAILABLE` | Dependensi inti (database) tidak tersedia |
| `ERR_UNAUTHORIZED` | 401 | `UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| `ERR_WEBHOOK_SIGNATURE_INVALID` | 401 | `UNAUTHORIZED` | Signature webhook vendor tidak ada atau tidak cocok |
