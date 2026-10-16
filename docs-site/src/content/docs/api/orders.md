---
title: "Orders (orders)"
description: "Kontrak API modul orders"
---
> Di-generate dari kode oleh `bun run openapi:update` — jangan diedit manual (`bun run openapi:check` menolaknya).

[Kontrak API](../) › orders

| Endpoint | Ringkasan |
|---|---|
| `GET /api/v1/orders` | List orders (paginated) |
| `POST /api/v1/orders` | Create a order |
| `GET /api/v1/orders/{id}` | Get a order by id |
| `PATCH /api/v1/orders/{id}` | Update a order (only the given fields) |
| `DELETE /api/v1/orders/{id}` | Delete a order (soft delete; restorable) |
| `GET /api/v1/orders/{id}/items` | List a order's items |
| `POST /api/v1/orders/{id}/items` | Add an item to a order |
| `PUT /api/v1/orders/{id}/items` | Replace a order's item list (update kept ids, add new, delete missing) |
| `PATCH /api/v1/orders/{id}/items/{childId}` | Update an item (only the given fields) |
| `DELETE /api/v1/orders/{id}/items/{childId}` | Delete an item |
| `POST /api/v1/orders/{id}/restore` | Restore a soft-deleted order |

## `GET /api/v1/orders`

**List orders (paginated)**

- Access token: `Authorization: Bearer <access_token>`

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
GET /api/v1/orders
Authorization: Bearer <access_token>
```

**200 — A page**

Pesan: `Daftar pesanan berhasil diambil` (en: `Orders retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar pesanan berhasil diambil",
  "data": [
    {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "code": "string",
      "note": "string",
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

## `POST /api/v1/orders`

**Create a order**

- Access token: `Authorization: Bearer <access_token>`

**Header**

| Nama | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `Accept-Language` | string | tidak | Language of response messages: id \| en (q-values honoured; unsupported or missing = DEFAULT_LOCALE). |
| `X-Request-ID` | string | tidak | pola `^[A-Za-z0-9._:-]{1,128}$`; Correlation id, echoed back and written to every log line. Missing or not matching the pattern = a UUID v7 is generated. |

**Body** (`application/json`)

| Field | Tipe | Wajib | Aturan / keterangan |
|---|---|---|---|
| `code` | string | ya | panjang ≥ 1; panjang ≤ 50 |
| `note` | string | tidak | panjang ≤ 255 |

**Contoh request**

```http
POST /api/v1/orders
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "code": "string",
  "note": "string"
}
```

**201 — Created**

Pesan: `Pesanan berhasil dibuat` (en: `Order created successfully`)

```json
{
  "success": true,
  "status_code": 201,
  "message": "Pesanan berhasil dibuat",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "code": "string",
    "note": "string",
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
        "field": "code",
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

## `GET /api/v1/orders/{id}`

**Get a order by id**

- Access token: `Authorization: Bearer <access_token>`

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
GET /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Found**

Pesan: `Data pesanan berhasil diambil` (en: `Order retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Data pesanan berhasil diambil",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "code": "string",
    "note": "string",
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

## `PATCH /api/v1/orders/{id}`

**Update a order (only the given fields)**

- Access token: `Authorization: Bearer <access_token>`

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
| `code` | string | tidak | panjang ≥ 1; panjang ≤ 50 |
| `note` | string \| null | tidak | panjang ≤ 255 |

**Contoh request**

```http
PATCH /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "code": "string",
  "note": "string"
}
```

**200 — Updated**

Pesan: `Pesanan berhasil diperbarui` (en: `Order updated successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Pesanan berhasil diperbarui",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "code": "string",
    "note": "string",
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
        "field": "code",
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

## `DELETE /api/v1/orders/{id}`

**Delete a order (soft delete; restorable)**

- Access token: `Authorization: Bearer <access_token>`

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
DELETE /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Deleted**

Pesan: `Pesanan berhasil dihapus` (en: `Order deleted successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Pesanan berhasil dihapus",
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

## `GET /api/v1/orders/{id}/items`

**List a order's items**

- Access token: `Authorization: Bearer <access_token>`

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
GET /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/items
Authorization: Bearer <access_token>
```

**200 — Items, oldest first**

Pesan: `Daftar item berhasil diambil` (en: `Items retrieved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar item berhasil diambil",
  "data": [
    {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "description": "string",
      "quantity": 1,
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

## `POST /api/v1/orders/{id}/items`

**Add an item to a order**

- Access token: `Authorization: Bearer <access_token>`

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
| `description` | string | ya | panjang ≥ 1; panjang ≤ 255 |
| `quantity` | integer | ya | > 0 |

**Contoh request**

```http
POST /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/items
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "description": "string",
  "quantity": 1
}
```

**201 — Item added**

Pesan: `Item berhasil ditambahkan` (en: `Item added successfully`)

```json
{
  "success": true,
  "status_code": 201,
  "message": "Item berhasil ditambahkan",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "description": "string",
    "quantity": 1,
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
        "field": "description",
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

## `PUT /api/v1/orders/{id}/items`

**Replace a order's item list (update kept ids, add new, delete missing)**

- Access token: `Authorization: Bearer <access_token>`

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
| `items` | array<object> | ya | item ≤ 500 |
| `items[].description` | string | ya | panjang ≥ 1; panjang ≤ 255 |
| `items[].quantity` | integer | ya | > 0 |
| `items[].id` | string (uuid) | tidak |  |

**Contoh request**

```http
PUT /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/items
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "items": [
    {
      "description": "string",
      "quantity": 1,
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e"
    }
  ]
}
```

**200 — The saved list**

Pesan: `Daftar item berhasil disimpan` (en: `Items saved successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Daftar item berhasil disimpan",
  "data": [
    {
      "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
      "description": "string",
      "quantity": 1,
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
| 400 | `ERR_INVALID_JSON` | Body bukan JSON yang valid |
| 400 | `ERR_NON_SNAKE_CASE_KEY` | Key body / query bukan snake_case (`field` = key seperti dikirim) |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token kedaluwarsa: refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak valid |
| 401 | `ERR_UNAUTHORIZED` | Header `Authorization: Bearer` tidak ada |
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
        "field": "items",
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

## `PATCH /api/v1/orders/{id}/items/{childId}`

**Update an item (only the given fields)**

- Access token: `Authorization: Bearer <access_token>`

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
| `description` | string | tidak | panjang ≥ 1; panjang ≤ 255 |
| `quantity` | integer | tidak | > 0 |

**Contoh request**

```http
PATCH /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/items/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "description": "string",
  "quantity": 1
}
```

**200 — Item updated**

Pesan: `Item berhasil diperbarui` (en: `Item updated successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Item berhasil diperbarui",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "description": "string",
    "quantity": 1,
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
        "field": "description",
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

## `DELETE /api/v1/orders/{id}/items/{childId}`

**Delete an item**

- Access token: `Authorization: Bearer <access_token>`

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
DELETE /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/items/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e
Authorization: Bearer <access_token>
```

**200 — Item deleted**

Pesan: `Item berhasil dihapus` (en: `Item deleted successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Item berhasil dihapus",
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

## `POST /api/v1/orders/{id}/restore`

**Restore a soft-deleted order**

- Access token: `Authorization: Bearer <access_token>`

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
POST /api/v1/orders/0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e/restore
Authorization: Bearer <access_token>
```

**200 — Restored**

Pesan: `Pesanan berhasil dipulihkan` (en: `Order restored successfully`)

```json
{
  "success": true,
  "status_code": 200,
  "message": "Pesanan berhasil dipulihkan",
  "data": {
    "id": "0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e",
    "code": "string",
    "note": "string",
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
