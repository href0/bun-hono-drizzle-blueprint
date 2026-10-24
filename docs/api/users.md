# Users (`users`)

> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

[Kontrak API](README.md) › users

| Endpoint | Ringkasan |
|---|---|
| `GET /api/v1/users` | List users (paginated) |
| `POST /api/v1/users` | Create a user |
| `GET /api/v1/users/{id}` | Get a user by id |
| `PATCH /api/v1/users/{id}` | Update a user (only the given fields) |
| `DELETE /api/v1/users/{id}` | Delete a user (soft delete; restorable) |
| `PUT /api/v1/users/{id}/password` | Reset a user's password (ends all of their sessions) |
| `POST /api/v1/users/{id}/restore` | Restore a soft-deleted user |

## `GET /api/v1/users`

**List users (paginated)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: role `admin`

**Query**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `page` | integer | tidak | > 0; default `1` |
| `per_page` | integer | tidak | ≤ 100; > 0; default `10` |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
GET /api/v1/users
Authorization: Bearer <access_token>
```

**200 — A page of users**

Pesan: `Daftar pengguna berhasil diambil` (en: `Users retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar pengguna berhasil diambil",
  "data": [
    {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "email": "user@example.com",
      "full_name": "string",
      "role": "string",
      "is_active": true,
      "created_at": "2026-01-01T00:00:00.000Z",
      "updated_at": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 1,
    "total_items": 1,
    "total_pages": 1
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_ROLE_FORBIDDEN` | Role pengguna tidak diizinkan untuk endpoint ini |
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
        "field": "page",
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

## `POST /api/v1/users`

**Create a user**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: role `admin`

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `email` | string (email) | ya | panjang ≤ 255 |
| `full_name` | string | ya | panjang ≥ 1; panjang ≤ 255 |
| `password` | string | ya | panjang ≥ 8; panjang ≤ 1024 |
| `role` | string | tidak | salah satu: `admin`, `user` |

**Contoh request**

```http
POST /api/v1/users
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "user@example.com",
  "full_name": "string",
  "password": "xxxxxxxx",
  "role": "admin"
}
```

**201 — User created**

Pesan: `Pengguna berhasil dibuat` (en: `User created successfully`)

```json
{
  "success": true,
  "status_code": 201,
  "message": "Pengguna berhasil dibuat",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "email": "user@example.com",
    "full_name": "string",
    "role": "string",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_ROLE_FORBIDDEN` | Role pengguna tidak diizinkan untuk endpoint ini |
| 409 | `ERR_CONFLICT` | Bentrok dengan data yang ada (mis. nilai unik sudah dipakai) |
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
        "field": "email",
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

## `GET /api/v1/users/{id}`

**Get a user by id**

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
GET /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — The user**

Pesan: `Data pengguna berhasil diambil` (en: `User retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Data pengguna berhasil diambil",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "email": "user@example.com",
    "full_name": "string",
    "role": "string",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
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

## `PATCH /api/v1/users/{id}`

**Update a user (only the given fields)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: role `admin`

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
| `email` | string (email) | tidak | panjang ≤ 255 |
| `full_name` | string | tidak | panjang ≥ 1; panjang ≤ 255 |
| `role` | string | tidak | salah satu: `admin`, `user` |
| `is_active` | boolean | tidak |  |

**Contoh request**

```http
PATCH /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "user@example.com",
  "full_name": "string",
  "role": "admin",
  "is_active": true
}
```

**200 — The updated user**

Pesan: `Pengguna berhasil diperbarui` (en: `User updated successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Pengguna berhasil diperbarui",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "email": "user@example.com",
    "full_name": "string",
    "role": "string",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_ROLE_FORBIDDEN` | Role pengguna tidak diizinkan untuk endpoint ini |
| 403 | `ERR_SELF_LOCKOUT_FORBIDDEN` | Admin tidak bisa menghapus, menonaktifkan, atau menurunkan role akunnya sendiri |
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
  "message": "Input tidak memenuhi skema (lihat `details`)",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [
      {
        "field": "email",
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

## `DELETE /api/v1/users/{id}`

**Delete a user (soft delete; restorable)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: role `admin`

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
DELETE /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — User deleted**

Pesan: `Pengguna berhasil dihapus` (en: `User deleted successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Pengguna berhasil dihapus",
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
| 403 | `ERR_ROLE_FORBIDDEN` | Role pengguna tidak diizinkan untuk endpoint ini |
| 403 | `ERR_SELF_LOCKOUT_FORBIDDEN` | Admin tidak bisa menghapus, menonaktifkan, atau menurunkan role akunnya sendiri |
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

## `PUT /api/v1/users/{id}/password`

**Reset a user's password (ends all of their sessions)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: role `admin`

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
| `password` | string | ya | panjang ≥ 8; panjang ≤ 1024 |

**Contoh request**

```http
PUT /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "password": "xxxxxxxx"
}
```

**200 — Password changed**

Pesan: `Password berhasil diganti; semua sesi pengguna diakhiri` (en: `Password changed; all of the user's sessions have ended`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Password berhasil diganti; semua sesi pengguna diakhiri",
  "data": null
}
```

**Error**

| Status | Code | Arti |
|---|---|---|
| 400 | `ERR_INVALID_INPUT` | Input tidak memenuhi skema (lihat `details`) |
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
| 403 | `ERR_ROLE_FORBIDDEN` | Role pengguna tidak diizinkan untuk endpoint ini |
| 404 | `ERR_NOT_FOUND` | Data tidak ditemukan |
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
        "field": "password",
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

## `POST /api/v1/users/{id}/restore`

**Restore a soft-deleted user**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: role `admin`

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
POST /api/v1/users/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/restore
Authorization: Bearer <access_token>
```

**200 — The restored user**

Pesan: `Pengguna berhasil dipulihkan` (en: `User restored successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Pengguna berhasil dipulihkan",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "email": "user@example.com",
    "full_name": "string",
    "role": "string",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
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
