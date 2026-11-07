# Permissions (`rbac`)

> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

[Kontrak API](README.md) › rbac

| Endpoint | Ringkasan |
|---|---|
| `GET /api/v1/permissions` | List permissions with the endpoints they open (paginated, sortable, searchable) |
| `POST /api/v1/permissions` | Create a menu permission (key menu.…) |
| `GET /api/v1/permissions/{id}` | Get a permission by id, with the endpoints it opens |
| `PATCH /api/v1/permissions/{id}` | Update a menu permission (label, group) |
| `DELETE /api/v1/permissions/{id}` | Delete a menu permission (soft delete; restorable) |
| `POST /api/v1/permissions/{id}/restore` | Restore a deleted menu permission |
| `GET /api/v1/roles` | List roles (paginated, sortable, searchable) |
| `POST /api/v1/roles` | Create a role |
| `GET /api/v1/roles/{id}` | Get a role by id |
| `PATCH /api/v1/roles/{id}` | Update a role (name, description; super_admin cannot be changed) |
| `DELETE /api/v1/roles/{id}` | Delete a role (soft delete; system roles cannot be deleted) |
| `GET /api/v1/roles/{id}/permissions` | List the permissions of a role (super_admin: every permission) |
| `PUT /api/v1/roles/{id}/permissions/{childId}` | Add a permission to a role (201 added, 200 already there) |
| `DELETE /api/v1/roles/{id}/permissions/{childId}` | Remove a permission from a role |
| `POST /api/v1/roles/{id}/restore` | Restore a deleted role (the caller must hold its permissions) |

## `GET /api/v1/permissions`

**List permissions with the endpoints they open (paginated, sortable, searchable)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `permissions.read`

**Query**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `page` | integer | tidak | > 0; default `1` |
| `per_page` | integer | tidak | ≤ 100; > 0; default `10` |
| `sort` | string | tidak | Comma-separated, `-` = descending, at most 3; allowed: key, group, created_at. Default: newest first |
| `q` | string | tidak | panjang ≥ 1; panjang ≤ 100; Text searched in the listed columns (case-insensitive, substring) |
| `source` | string | tidak | salah satu: `api`, `menu` |
| `group` | string | tidak | panjang ≥ 1; panjang ≤ 100 |
| `retired` | boolean | tidak |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
GET /api/v1/permissions
Authorization: Bearer <access_token>
```

**200 — A page of permissions**

Pesan: `Daftar permission berhasil diambil` (en: `Permissions retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar permission berhasil diambil",
  "data": [
    {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "key": "string",
      "label": "string",
      "group": "string",
      "source": "api",
      "retired_at": "2026-01-01T00:00:00.000Z",
      "endpoints": [
        {
          "method": "string",
          "path": "string",
          "summary": "string"
        }
      ],
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
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
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

## `POST /api/v1/permissions`

**Create a menu permission (key menu.…)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `permissions.create`

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `key` | string | ya | panjang ≤ 100; pola `^menu(\.[a-z0-9]+(-[a-z0-9]+)*)+$` |
| `label` | string | ya | panjang ≥ 1; panjang ≤ 150 |
| `group` | string | ya | panjang ≥ 1; panjang ≤ 100 |

**Contoh request**

```http
POST /api/v1/permissions
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "key": "string",
  "label": "string",
  "group": "string"
}
```

**201 — Menu permission created**

Pesan: `Permission menu berhasil dibuat` (en: `Menu permission created successfully`)

```json
{
  "success": true,
  "status_code": 201,
  "message": "Permission menu berhasil dibuat",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "key": "string",
    "label": "string",
    "group": "string",
    "source": "api",
    "retired_at": "2026-01-01T00:00:00.000Z",
    "endpoints": [
      {
        "method": "string",
        "path": "string",
        "summary": "string"
      }
    ],
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
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
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
        "field": "key",
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

## `GET /api/v1/permissions/{id}`

**Get a permission by id, with the endpoints it opens**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `permissions.read`

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
GET /api/v1/permissions/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — The permission**

Pesan: `Permission berhasil diambil` (en: `Permission retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Permission berhasil diambil",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "key": "string",
    "label": "string",
    "group": "string",
    "source": "api",
    "retired_at": "2026-01-01T00:00:00.000Z",
    "endpoints": [
      {
        "method": "string",
        "path": "string",
        "summary": "string"
      }
    ],
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

## `PATCH /api/v1/permissions/{id}`

**Update a menu permission (label, group)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `permissions.update`

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
| `label` | string | tidak | panjang ≥ 1; panjang ≤ 150 |
| `group` | string | tidak | panjang ≥ 1; panjang ≤ 100 |

**Contoh request**

```http
PATCH /api/v1/permissions/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "label": "string",
  "group": "string"
}
```

**200 — The updated menu permission**

Pesan: `Permission menu berhasil diperbarui` (en: `Menu permission updated successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Permission menu berhasil diperbarui",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "key": "string",
    "label": "string",
    "group": "string",
    "source": "api",
    "retired_at": "2026-01-01T00:00:00.000Z",
    "endpoints": [
      {
        "method": "string",
        "path": "string",
        "summary": "string"
      }
    ],
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
  "message": "Input tidak memenuhi skema (lihat `details`)",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [
      {
        "field": "label",
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

## `DELETE /api/v1/permissions/{id}`

**Delete a menu permission (soft delete; restorable)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `permissions.delete`

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
DELETE /api/v1/permissions/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Menu permission deleted**

Pesan: `Permission menu berhasil dihapus` (en: `Menu permission deleted successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Permission menu berhasil dihapus",
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

## `POST /api/v1/permissions/{id}/restore`

**Restore a deleted menu permission**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `permissions.restore`

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
POST /api/v1/permissions/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/restore
Authorization: Bearer <access_token>
```

**200 — The restored menu permission**

Pesan: `Permission menu berhasil dipulihkan` (en: `Menu permission restored successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Permission menu berhasil dipulihkan",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "key": "string",
    "label": "string",
    "group": "string",
    "source": "api",
    "retired_at": "2026-01-01T00:00:00.000Z",
    "endpoints": [
      {
        "method": "string",
        "path": "string",
        "summary": "string"
      }
    ],
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

## `GET /api/v1/roles`

**List roles (paginated, sortable, searchable)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.read`

**Query**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `page` | integer | tidak | > 0; default `1` |
| `per_page` | integer | tidak | ≤ 100; > 0; default `10` |
| `sort` | string | tidak | Comma-separated, `-` = descending, at most 3; allowed: created_at, updated_at, key, name. Default: newest first |
| `q` | string | tidak | panjang ≥ 1; panjang ≤ 100; Text searched in the listed columns (case-insensitive, substring) |
| `is_system` | boolean | tidak |  |

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Contoh request**

```http
GET /api/v1/roles
Authorization: Bearer <access_token>
```

**200 — A page of roles**

Pesan: `Daftar role berhasil diambil` (en: `Roles retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar role berhasil diambil",
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
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
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

## `POST /api/v1/roles`

**Create a role**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.create`

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `key` | string | ya | panjang ≥ 2; panjang ≤ 50; pola `^[a-z][a-z0-9_]*$` |
| `name` | string | ya | panjang ≥ 1; panjang ≤ 100 |
| `description` | string \| null | tidak | panjang ≤ 500 |

**Contoh request**

```http
POST /api/v1/roles
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "key": "string",
  "name": "string",
  "description": "string"
}
```

**201 — Role created**

Pesan: `Role berhasil dibuat` (en: `Role created successfully`)

```json
{
  "success": true,
  "status_code": 201,
  "message": "Role berhasil dibuat",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "key": "string",
    "name": "string",
    "description": "string",
    "is_system": true,
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
| 403 | `ERR_PERMISSION_FORBIDDEN` | Pengguna tidak memiliki permission yang dibutuhkan endpoint ini |
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
        "field": "key",
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

## `GET /api/v1/roles/{id}`

**Get a role by id**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.read`

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
GET /api/v1/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — The role**

Pesan: `Role berhasil diambil` (en: `Role retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Role berhasil diambil",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "key": "string",
    "name": "string",
    "description": "string",
    "is_system": true,
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

## `PATCH /api/v1/roles/{id}`

**Update a role (name, description; super_admin cannot be changed)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.update`

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
| `name` | string | tidak | panjang ≥ 1; panjang ≤ 100 |
| `description` | string \| null | tidak | panjang ≤ 500 |

**Contoh request**

```http
PATCH /api/v1/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "string",
  "description": "string"
}
```

**200 — The updated role**

Pesan: `Role berhasil diperbarui` (en: `Role updated successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Role berhasil diperbarui",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "key": "string",
    "name": "string",
    "description": "string",
    "is_system": true,
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
  "message": "Input tidak memenuhi skema (lihat `details`)",
  "error": {
    "type": "VALIDATION_ERROR",
    "code": "ERR_INVALID_INPUT",
    "origin": "APP",
    "details": [
      {
        "field": "name",
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

## `DELETE /api/v1/roles/{id}`

**Delete a role (soft delete; system roles cannot be deleted)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.delete`

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
DELETE /api/v1/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Role deleted**

Pesan: `Role berhasil dihapus` (en: `Role deleted successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Role berhasil dihapus",
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

## `GET /api/v1/roles/{id}/permissions`

**List the permissions of a role (super_admin: every permission)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.read`

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
GET /api/v1/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/permissions
Authorization: Bearer <access_token>
```

**200 — The permissions of the role, by key**

Pesan: `Daftar permission role berhasil diambil` (en: `The permissions of the role retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar permission role berhasil diambil",
  "data": [
    {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "key": "string",
      "label": "string",
      "group": "string",
      "source": "api",
      "retired_at": "2026-01-01T00:00:00.000Z",
      "endpoints": [
        {
          "method": "string",
          "path": "string",
          "summary": "string"
        }
      ],
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

## `PUT /api/v1/roles/{id}/permissions/{childId}`

**Add a permission to a role (201 added, 200 already there)**

Idempotent. The caller must hold the permission themselves (403 `ERR_PERMISSION_ESCALATION_FORBIDDEN`); `super_admin` has no mapping (409).

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.update`

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
PUT /api/v1/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/permissions/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Already there**

Pesan: `Role sudah memiliki permission ini` (en: `The role already has this permission`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Role sudah memiliki permission ini",
  "data": null
}
```

**201 — Added**

Pesan: `Permission berhasil ditambahkan ke role` (en: `Permission added to the role`)

```json
{
  "success": true,
  "status_code": 201,
  "message": "Permission berhasil ditambahkan ke role",
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
| 403 | `ERR_PERMISSION_ESCALATION_FORBIDDEN` | Pengguna mencoba memberikan permission yang tidak ia miliki sendiri |
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
  "message": "Pengguna mencoba memberikan permission yang tidak ia miliki sendiri",
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

## `DELETE /api/v1/roles/{id}/permissions/{childId}`

**Remove a permission from a role**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.update`

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
DELETE /api/v1/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/permissions/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Removed**

Pesan: `Permission berhasil dicabut dari role` (en: `Permission removed from the role`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Permission berhasil dicabut dari role",
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

## `POST /api/v1/roles/{id}/restore`

**Restore a deleted role (the caller must hold its permissions)**

- Access token: `Authorization: Bearer <access_token>`
- Hanya: permission `roles.restore`

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
POST /api/v1/roles/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/restore
Authorization: Bearer <access_token>
```

**200 — The restored role**

Pesan: `Role berhasil dipulihkan` (en: `Role restored successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Role berhasil dipulihkan",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "key": "string",
    "name": "string",
    "description": "string",
    "is_system": true,
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
| 403 | `ERR_PERMISSION_ESCALATION_FORBIDDEN` | Pengguna mencoba memberikan permission yang tidak ia miliki sendiri |
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
  "message": "Pengguna mencoba memberikan permission yang tidak ia miliki sendiri",
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
