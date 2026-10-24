# Users (`user-posts`)

> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

[Kontrak API](README.md) › user-posts

| Endpoint | Ringkasan |
|---|---|
| `GET /api/v1/users/{id}/external-posts` | List the user's posts from the external JSONPlaceholder service (example) |

## `GET /api/v1/users/{id}/external-posts`

**List the user's posts from the external JSONPlaceholder service (example)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: pemilik resource (`id` = id Anda) atau role `admin`

**Path parameter**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `id` | string (uuid) | ya |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
GET /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/external-posts
Authorization: Bearer <access_token>
```

**200 — External posts**

Pesan: `Postingan eksternal pengguna berhasil diambil` (en: `User external posts retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Postingan eksternal pengguna berhasil diambil",
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "title": "string",
      "body": "string"
    }
  ]
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_ROLE_FORBIDDEN` | Role pengguna tidak diizinkan untuk endpoint ini |
| 429 | `ERR_RATE_LIMITED` | Batas request terlampaui: tunggu `Retry-After` detik |
| 500 | `ERR_INTERNAL` | Error tak terduga di server (detail tidak pernah dikirim) |
| 502 | `ERR_EXT_ERROR` | Layanan vendor menjawab dengan error |
| 502 | `ERR_EXT_UNREACHABLE` | Layanan vendor tidak bisa dihubungi |
| 504 | `ERR_EXT_TIMEOUT` | Layanan vendor tidak menjawab tepat waktu |

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
  "message": "Access token kedaluwarsa: refresh lalu ulangi",
  "error": {
    "type": "UNAUTHORIZED",
    "code": "ERR_AUTH_TOKEN_EXPIRED",
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
  "message": "Role pengguna tidak diizinkan untuk endpoint ini",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_ROLE_FORBIDDEN",
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

<details><summary>Contoh 502</summary>

```json
{
  "success": false,
  "status_code": 502,
  "message": "Layanan vendor menjawab dengan error",
  "error": {
    "type": "EXTERNAL_SERVICE_ERROR",
    "code": "ERR_EXT_ERROR",
    "origin": "<KODE_INTEGRASI>",
    "institution": "<nama vendor>"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 504</summary>

```json
{
  "success": false,
  "status_code": 504,
  "message": "Layanan vendor tidak menjawab tepat waktu",
  "error": {
    "type": "EXTERNAL_SERVICE_ERROR",
    "code": "ERR_EXT_TIMEOUT",
    "origin": "<KODE_INTEGRASI>",
    "institution": "<nama vendor>"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>
