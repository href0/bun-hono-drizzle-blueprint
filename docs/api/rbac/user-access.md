# User access (`rbac/user-access`)

> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

[Kontrak API](../README.md) › [rbac](../rbac.md) › user-access

| Endpoint | Ringkasan |
|---|---|
| `GET /api/v1/users/{id}/permissions` | List the extra permissions of a user (expired ones included) |
| `PUT /api/v1/users/{id}/permissions` | Replace the extra permissions of a user (a checklist saved at once) |
| `PUT /api/v1/users/{id}/permissions/{childId}` | Grant an extra permission to a user, or change its expiry and note |
| `DELETE /api/v1/users/{id}/permissions/{childId}` | Revoke an extra permission from a user |
| `GET /api/v1/users/{id}/roles` | List the roles of a user |
| `PUT /api/v1/users/{id}/roles` | Replace the roles of a user (a checklist saved at once) |
| `PUT /api/v1/users/{id}/roles/{childId}` | Give a role to a user (201 given, 200 already held) |
| `DELETE /api/v1/users/{id}/roles/{childId}` | Revoke a role from a user |

## `GET /api/v1/users/{id}/permissions`

**List the extra permissions of a user (expired ones included)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `user-permissions.read`

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
GET /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/permissions
Authorization: Bearer <access_token>
```

**200 — The live grants of the user, by permission key**

Pesan: `Daftar izin tambahan pengguna berhasil diambil` (en: `The extra permissions of the user retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar izin tambahan pengguna berhasil diambil",
  "data": [
    {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "permission": {
        "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
        "key": "string",
        "label": "string",
        "group": "string",
        "source": "api"
      },
      "expires_at": "2026-01-01T00:00:00.000Z",
      "note": "string",
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
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
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
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
  "message": "Pengguna tidak memiliki permission yang dibutuhkan endpoint ini",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PERMISSION_FORBIDDEN",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 404</summary>

```json
{
  "success": false,
  "status_code": 404,
  "message": "Data tidak ditemukan",
  "error": {
    "type": "NOT_FOUND",
    "code": "ERR_NOT_FOUND",
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

## `PUT /api/v1/users/{id}/permissions`

**Replace the extra permissions of a user (a checklist saved at once)**

The body is the whole set the user should hold, each grant with its `expires_at` and `note` (absent = none — send the current ones to keep them): a permission left out is revoked, `[]` revokes every one, a kept grant with another expiry or note is `updated`, an expired grant sent back as it is stays unchanged. Only the difference is written, in one transaction — nothing is saved when one item is refused. 400 for an unknown, retired or repeated permission or an expiry not in the future (its index in `details`); 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` naming every permission granted, updated or revoked that the caller does not hold (one that no longer counts may be revoked).

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `user-permissions.update`

**Path parameter**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `id` | string (uuid) | ya |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `grants` | array<object> | ya | item ≤ 1000 |
| `grants[].expires_at` | string (date-time) \| null | tidak |  |
| `grants[].note` | string \| null | tidak | panjang ≥ 1; panjang ≤ 500 |
| `grants[].permission_id` | string (uuid) | ya |  |

**Contoh request**

```http
PUT /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/permissions
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "grants": [
    {
      "expires_at": "2026-10-05T03:00:00Z",
      "note": "string",
      "permission_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e"
    }
  ]
}
```

**200 — What was added, updated, removed and kept, each by key**

Pesan: `Permission tambahan pengguna berhasil diperbarui` (en: `The extra permissions of the user updated`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Permission tambahan pengguna berhasil diperbarui",
  "data": {
    "added": [
      {
        "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
        "key": "string"
      }
    ],
    "removed": [
      {
        "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
        "key": "string"
      }
    ],
    "unchanged": [
      {
        "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
        "key": "string"
      }
    ],
    "updated": [
      {
        "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
        "key": "string"
      }
    ]
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_BAD_REQUEST` | Aturan bisnis dilanggar |
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_PERMISSION_ESCALATION_FORBIDDEN` | Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri |
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
| 409 | `ERR_CONFLICT` | Bentrok dengan data yang ada (mis. nilai unik sudah dipakai) |
| 413 | `ERR_PAYLOAD_TOO_LARGE` | Body melebihi `HTTP_BODY_LIMIT_BYTES` |
| 429 | `ERR_RATE_LIMITED` | Batas request terlampaui: tunggu `Retry-After` detik |
| 500 | `ERR_INTERNAL` | Error tak terduga di server (detail tidak pernah dikirim) |

<details><summary>Contoh 400</summary>

```json
{
  "success": false,
  "status_code": 400,
  "message": "Aturan bisnis dilanggar",
  "error": {
    "type": "BAD_REQUEST",
    "code": "ERR_BAD_REQUEST",
    "origin": "APP"
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
  "message": "Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PERMISSION_ESCALATION_FORBIDDEN",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 404</summary>

```json
{
  "success": false,
  "status_code": 404,
  "message": "Data tidak ditemukan",
  "error": {
    "type": "NOT_FOUND",
    "code": "ERR_NOT_FOUND",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 409</summary>

```json
{
  "success": false,
  "status_code": 409,
  "message": "Bentrok dengan data yang ada (mis. nilai unik sudah dipakai)",
  "error": {
    "type": "CONFLICT",
    "code": "ERR_CONFLICT",
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

## `PUT /api/v1/users/{id}/permissions/{childId}`

**Grant an extra permission to a user, or change its expiry and note**

The caller must hold the permission (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`); `expires_at` must lie in the future.

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `user-permissions.create`

**Path parameter**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `id` | string (uuid) | ya |  |
| `childId` | string (uuid) | ya |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `expires_at` | string (date-time) \| null | tidak |  |
| `note` | string \| null | tidak | panjang ≥ 1; panjang ≤ 500 |

**Contoh request**

```http
PUT /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/permissions/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "expires_at": "2026-10-05T03:00:00Z",
  "note": "string"
}
```

**200 — Updated**

Pesan: `Masa berlaku dan catatan izin tambahan berhasil diperbarui` (en: `Expiry and note of the extra permission updated`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Masa berlaku dan catatan izin tambahan berhasil diperbarui",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "permission": {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "key": "string",
      "label": "string",
      "group": "string",
      "source": "api"
    },
    "expires_at": "2026-01-01T00:00:00.000Z",
    "note": "string",
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
}
```

**201 — Granted**

Pesan: `Izin tambahan berhasil diberikan` (en: `Extra permission granted`)

```json
{
  "success": true,
  "status_code": 201,
  "message": "Izin tambahan berhasil diberikan",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "permission": {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "key": "string",
      "label": "string",
      "group": "string",
      "source": "api"
    },
    "expires_at": "2026-01-01T00:00:00.000Z",
    "note": "string",
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_BAD_REQUEST` | Aturan bisnis dilanggar |
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_PERMISSION_ESCALATION_FORBIDDEN` | Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri |
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
| 409 | `ERR_CONFLICT` | Bentrok dengan data yang ada (mis. nilai unik sudah dipakai) |
| 413 | `ERR_PAYLOAD_TOO_LARGE` | Body melebihi `HTTP_BODY_LIMIT_BYTES` |
| 429 | `ERR_RATE_LIMITED` | Batas request terlampaui: tunggu `Retry-After` detik |
| 500 | `ERR_INTERNAL` | Error tak terduga di server (detail tidak pernah dikirim) |

<details><summary>Contoh 400</summary>

```json
{
  "success": false,
  "status_code": 400,
  "message": "Aturan bisnis dilanggar",
  "error": {
    "type": "BAD_REQUEST",
    "code": "ERR_BAD_REQUEST",
    "origin": "APP"
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
  "message": "Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PERMISSION_ESCALATION_FORBIDDEN",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 404</summary>

```json
{
  "success": false,
  "status_code": 404,
  "message": "Data tidak ditemukan",
  "error": {
    "type": "NOT_FOUND",
    "code": "ERR_NOT_FOUND",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 409</summary>

```json
{
  "success": false,
  "status_code": 409,
  "message": "Bentrok dengan data yang ada (mis. nilai unik sudah dipakai)",
  "error": {
    "type": "CONFLICT",
    "code": "ERR_CONFLICT",
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

## `DELETE /api/v1/users/{id}/permissions/{childId}`

**Revoke an extra permission from a user**

The caller must hold the permission (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`), unless it no longer counts (retired or deleted). An expired grant is revoked like a live one.

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `user-permissions.delete`

**Path parameter**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `id` | string (uuid) | ya |  |
| `childId` | string (uuid) | ya |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
DELETE /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/permissions/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Revoked**

Pesan: `Izin tambahan berhasil dicabut` (en: `Extra permission revoked`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Izin tambahan berhasil dicabut",
  "data": null
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_PERMISSION_ESCALATION_FORBIDDEN` | Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri |
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
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
  "message": "Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PERMISSION_ESCALATION_FORBIDDEN",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 404</summary>

```json
{
  "success": false,
  "status_code": 404,
  "message": "Data tidak ditemukan",
  "error": {
    "type": "NOT_FOUND",
    "code": "ERR_NOT_FOUND",
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

## `GET /api/v1/users/{id}/roles`

**List the roles of a user**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `user-roles.read`

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
GET /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/roles
Authorization: Bearer <access_token>
```

**200 — The live roles of the user, by key**

Pesan: `Daftar role pengguna berhasil diambil` (en: `The roles of the user retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar role pengguna berhasil diambil",
  "data": [
    {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "key": "string",
      "name": "string",
      "description": "string",
      "is_system": true,
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
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
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
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
  "message": "Pengguna tidak memiliki permission yang dibutuhkan endpoint ini",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PERMISSION_FORBIDDEN",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 404</summary>

```json
{
  "success": false,
  "status_code": 404,
  "message": "Data tidak ditemukan",
  "error": {
    "type": "NOT_FOUND",
    "code": "ERR_NOT_FOUND",
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

## `PUT /api/v1/users/{id}/roles`

**Replace the roles of a user (a checklist saved at once)**

The body is the whole set the user should hold: a role left out is revoked, `[]` revokes every one. Only the difference is written, in one transaction — nothing is saved when one item is refused. 400 for an unknown or repeated id (its index in `details`); 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` naming every permission of a role added or removed that the caller does not hold; `super_admin` only by a super admin, never from oneself (403 `ERR_SELF_LOCKOUT_FORBIDDEN`) and never from the last active holder (409).

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `user-roles.update`

**Path parameter**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `id` | string (uuid) | ya |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `role_ids` | array<string (uuid)> | ya | item ≤ 1000 |

**Contoh request**

```http
PUT /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/roles
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "role_ids": [
    "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e"
  ]
}
```

**200 — What was added, removed and kept, each by key**

Pesan: `Role pengguna berhasil diperbarui` (en: `The roles of the user updated`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Role pengguna berhasil diperbarui",
  "data": {
    "added": [
      {
        "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
        "key": "string"
      }
    ],
    "removed": [
      {
        "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
        "key": "string"
      }
    ],
    "unchanged": [
      {
        "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
        "key": "string"
      }
    ]
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_BAD_REQUEST` | Aturan bisnis dilanggar |
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_PERMISSION_ESCALATION_FORBIDDEN` | Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri |
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
| 403 | `ERR_SELF_LOCKOUT_FORBIDDEN` | Admin tidak bisa menghapus atau menonaktifkan akunnya sendiri |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
| 409 | `ERR_CONFLICT` | Bentrok dengan data yang ada (mis. nilai unik sudah dipakai) |
| 413 | `ERR_PAYLOAD_TOO_LARGE` | Body melebihi `HTTP_BODY_LIMIT_BYTES` |
| 429 | `ERR_RATE_LIMITED` | Batas request terlampaui: tunggu `Retry-After` detik |
| 500 | `ERR_INTERNAL` | Error tak terduga di server (detail tidak pernah dikirim) |

<details><summary>Contoh 400</summary>

```json
{
  "success": false,
  "status_code": 400,
  "message": "Aturan bisnis dilanggar",
  "error": {
    "type": "BAD_REQUEST",
    "code": "ERR_BAD_REQUEST",
    "origin": "APP"
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
  "message": "Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PERMISSION_ESCALATION_FORBIDDEN",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 404</summary>

```json
{
  "success": false,
  "status_code": 404,
  "message": "Data tidak ditemukan",
  "error": {
    "type": "NOT_FOUND",
    "code": "ERR_NOT_FOUND",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 409</summary>

```json
{
  "success": false,
  "status_code": 409,
  "message": "Bentrok dengan data yang ada (mis. nilai unik sudah dipakai)",
  "error": {
    "type": "CONFLICT",
    "code": "ERR_CONFLICT",
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

## `PUT /api/v1/users/{id}/roles/{childId}`

**Give a role to a user (201 given, 200 already held)**

Idempotent. The caller must hold every permission of the role; `super_admin` only by a super admin (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`).

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `user-roles.create`

**Path parameter**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `id` | string (uuid) | ya |  |
| `childId` | string (uuid) | ya |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
PUT /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Already held**

Pesan: `Pengguna sudah memiliki role ini` (en: `The user already has this role`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Pengguna sudah memiliki role ini",
  "data": null
}
```

**201 — Given**

Pesan: `Role berhasil diberikan ke pengguna` (en: `Role given to the user`)

```json
{
  "success": true,
  "status_code": 201,
  "message": "Role berhasil diberikan ke pengguna",
  "data": null
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_PERMISSION_ESCALATION_FORBIDDEN` | Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri |
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
| 409 | `ERR_CONFLICT` | Bentrok dengan data yang ada (mis. nilai unik sudah dipakai) |
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
  "message": "Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PERMISSION_ESCALATION_FORBIDDEN",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 404</summary>

```json
{
  "success": false,
  "status_code": 404,
  "message": "Data tidak ditemukan",
  "error": {
    "type": "NOT_FOUND",
    "code": "ERR_NOT_FOUND",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 409</summary>

```json
{
  "success": false,
  "status_code": 409,
  "message": "Bentrok dengan data yang ada (mis. nilai unik sudah dipakai)",
  "error": {
    "type": "CONFLICT",
    "code": "ERR_CONFLICT",
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

## `DELETE /api/v1/users/{id}/roles/{childId}`

**Revoke a role from a user**

The caller must hold every permission of the role (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`). `super_admin`: only by a super admin, never from oneself (403 `ERR_SELF_LOCKOUT_FORBIDDEN`) and never from the last active holder (409).

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `user-roles.delete`

**Path parameter**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `id` | string (uuid) | ya |  |
| `childId` | string (uuid) | ya |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
DELETE /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Revoked**

Pesan: `Role berhasil dicabut dari pengguna` (en: `Role revoked from the user`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Role berhasil dicabut dari pengguna",
  "data": null
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_PERMISSION_ESCALATION_FORBIDDEN` | Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri |
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
| 403 | `ERR_SELF_LOCKOUT_FORBIDDEN` | Admin tidak bisa menghapus atau menonaktifkan akunnya sendiri |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
| 409 | `ERR_CONFLICT` | Bentrok dengan data yang ada (mis. nilai unik sudah dipakai) |
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
  "message": "Pengguna mencoba memberikan atau mencabut permission yang tidak ia miliki sendiri",
  "error": {
    "type": "FORBIDDEN",
    "code": "ERR_PERMISSION_ESCALATION_FORBIDDEN",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 404</summary>

```json
{
  "success": false,
  "status_code": 404,
  "message": "Data tidak ditemukan",
  "error": {
    "type": "NOT_FOUND",
    "code": "ERR_NOT_FOUND",
    "origin": "APP"
  },
  "request_id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

</details>

<details><summary>Contoh 409</summary>

```json
{
  "success": false,
  "status_code": 409,
  "message": "Bentrok dengan data yang ada (mis. nilai unik sudah dipakai)",
  "error": {
    "type": "CONFLICT",
    "code": "ERR_CONFLICT",
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
