# Panduan Integrasi Partner

Panduan ini untuk developer sistem partner (server-to-server) yang memanggil API ini, dan untuk admin yang mengelola kredensial partner. Isinya: cara mendapatkan kredensial, cara menandatangani request (signing v1), contoh kode, kode error, dan rotasi kredensial.

Ringkasnya:

- Endpoint partner ada di `<API>/api/v1/partner/*`. Endpoint ini **tidak** memakai access token (`Authorization: Bearer`), tetapi request yang ditandatangani dengan **API key + secret HMAC** milik partner.
- Setiap request membawa empat header: `x-partner-key`, `x-partner-timestamp`, `x-partner-nonce`, `x-partner-signature`.
- Signature = HMAC-SHA256 atas *canonical string* (method, path, query, hash body, timestamp, nonce). Body yang sampai berbeda satu byte saja → ditolak.
- Setiap request memakai nonce baru dan timestamp saat ini (toleransi default ±5 menit). Request yang sama tidak bisa dikirim ulang.
- API key dan secret hanya ditampilkan **sekali** (saat dibuat / dirotasi). Simpan di secret manager, jangan di repository.

---

## 1. Mendapatkan kredensial (admin)

Kredensial dibuat oleh admin lewat `POST /api/v1/partner-credentials` (access token role `admin`):

```json
{
  "partner_code": "acme",
  "partner_name": "PT Acme Indonesia",
  "ip_whitelist": ["203.0.113.0/24"],
  "allowed_routes": ["/orders", "/orders/*"],
  "rate_limit_rpm": 120
}
```

| Field | Arti |
|---|---|
| `partner_code` | 3–50 huruf kecil, angka, tanda hubung. **Permanen** dan tidak pernah dipakai ulang (juga setelah dihapus): menjadi identitas audit `partner:<kode>` |
| `ip_whitelist` | Alamat IPv4/IPv6 atau blok CIDR asal request. Kosong = semua alamat. Blok dengan bit host terisi (`10.0.0.5/24`) ditolak |
| `allowed_routes` | Pola route **relatif terhadap `/api/v1/partner`**: `/orders` (persis), `/orders/:id` (satu segmen), `/orders/*` (`/orders` dan semua di bawahnya), `/*` (semua). Minimal satu |
| `rate_limit_rpm` | Batas request per menit untuk partner ini (default 60) |

Respons `201` berisi data kredensial plus `api_key` (`pk_…`) dan `secret`. Keduanya **hanya muncul di respons ini**: server menyimpan API key sebagai hash SHA-256 dan secret dalam bentuk terenkripsi (AES-256-GCM). Serahkan keduanya ke partner lewat kanal aman yang terpisah (bukan email biasa / chat).

Pengelolaan lain (semua admin saja): `GET /` (daftar), `GET /:id`, `PATCH /:id` (nama, IP whitelist, route, rate limit), `POST /:id/deactivate` / `activate`, `POST /:id/secret-rotations`, `POST /:id/api-key-rotations`, `DELETE /:id` (soft delete), `POST /:id/restore`. Perubahan berlaku seketika untuk request berikutnya.

---

## 2. Header request

| Header | Isi |
|---|---|
| `x-partner-key` | API key (`pk_…`) |
| `x-partner-timestamp` | Waktu kirim, Unix epoch **milidetik** (contoh `1760000000000`) |
| `x-partner-nonce` | Nilai acak sekali pakai, `^[A-Za-z0-9_-]{16,64}$` (contoh: 24 byte acak → base64url) |
| `x-partner-signature` | HMAC-SHA256 hex 64 karakter (huruf kecil) |

Request dengan body mengirim `Content-Type: application/json` seperti biasa. Body dan respons memakai `snake_case`, sama seperti API lainnya.

---

## 3. Canonical string & signature (v1)

```
canonical = "v1"            + "\n" +
            timestamp       + "\n" +
            nonce           + "\n" +
            METHOD          + "\n" +
            path            + "\n" +
            canonicalQuery  + "\n" +
            sha256hex(body)

signature = hex( HMAC_SHA256(secret, canonical) )
```

Aturannya:

- `timestamp` dan `nonce`: persis sama dengan nilai header.
- `METHOD`: huruf besar (`GET`, `POST`, …).
- `path`: path URL **persis seperti dikirim**, tanpa query, tanpa normalisasi (`/api/v1/partner/orders/` ≠ `/api/v1/partner/orders`). Termasuk prefix `/api/v1/partner`.
- `canonicalQuery`: setiap pasangan query di-decode (`+` = spasi, `a` tanpa nilai = `a=`, pasangan kosong dibuang), lalu key dan value di-encode ulang menurut RFC 3986 (hanya `A-Z a-z 0-9 - . _ ~` yang tidak di-encode, hex huruf besar: spasi → `%20`, `*` → `%2A`), diurutkan berdasarkan key lalu value (urutan karakter biasa, huruf besar sebelum huruf kecil), digabung `key=value` dengan `&`. Tanpa query → string kosong.
- `sha256hex(body)`: SHA-256 dari **byte body yang benar-benar dikirim**, hex huruf kecil. Tanpa body → `sha256hex("")` = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Jangan menyusun ulang / memformat JSON setelah ditandatangani.
- Secret dipakai sebagai string UTF-8 apa adanya (tidak di-decode dari base64).

Urutan pemeriksaan di server: header lengkap → timestamp dalam toleransi → API key aktif → IP whitelist → route diizinkan → signature → nonce belum pernah dipakai → rate limit.

---

## 4. Contoh kode

### TypeScript (Node.js 18+ / Bun, tanpa dependensi)

```ts
import { createHash, createHmac, randomBytes } from 'node:crypto';

/** RFC 3986: encodeURIComponent plus !'()* */
const encode = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const canonicalQuery = (search: string): string =>
  [...new URLSearchParams(search)]
    .map(([key, value]) => [encode(key), encode(value)] as const)
    .sort(([keyA, valueA], [keyB, valueB]) => compare(keyA, keyB) || compare(valueA, valueB))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

export const signPartnerRequest = (
  secret: string,
  request: { method: string; url: string; body: string; timestamp: string; nonce: string },
): string => {
  const { pathname, search } = new URL(request.url);
  const canonical = [
    'v1',
    request.timestamp,
    request.nonce,
    request.method.toUpperCase(),
    pathname,
    canonicalQuery(search),
    createHash('sha256').update(request.body, 'utf8').digest('hex'),
  ].join('\n');
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
};

/** Sends a signed request; `json` becomes the body (signed exactly as sent). */
export const partnerFetch = async (
  baseUrl: string,
  path: string,
  credentials: { apiKey: string; secret: string },
  options: { method?: string; json?: unknown } = {},
): Promise<Response> => {
  const url = new URL(path, baseUrl).toString();
  const method = options.method ?? 'GET';
  const body = options.json === undefined ? '' : JSON.stringify(options.json);
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString('base64url');
  const signature = signPartnerRequest(credentials.secret, { method, url, body, timestamp, nonce });
  return fetch(url, {
    method,
    body: body === '' ? undefined : body,
    headers: {
      'Content-Type': 'application/json',
      'x-partner-key': credentials.apiKey,
      'x-partner-timestamp': timestamp,
      'x-partner-nonce': nonce,
      'x-partner-signature': signature,
    },
  });
};

// const res = await partnerFetch('https://api.example.com', '/api/v1/partner/echo',
//   { apiKey: process.env.PARTNER_API_KEY!, secret: process.env.PARTNER_SECRET! },
//   { method: 'POST', json: { message: 'halo' } });
```

### Python 3 (standard library)

```python
import hashlib
import hmac
import json
import secrets
import time
import urllib.request
from urllib.parse import parse_qsl, quote, urlsplit


def canonical_query(query: str) -> str:
    pairs = [
        (quote(key, safe="-_.~"), quote(value, safe="-_.~"))
        for key, value in parse_qsl(query, keep_blank_values=True)
    ]
    return "&".join(f"{key}={value}" for key, value in sorted(pairs))


def sign_partner_request(secret: str, method: str, url: str, body: bytes, timestamp: str, nonce: str) -> str:
    parts = urlsplit(url)
    canonical = "\n".join([
        "v1",
        timestamp,
        nonce,
        method.upper(),
        parts.path,
        canonical_query(parts.query),
        hashlib.sha256(body).hexdigest(),
    ])
    return hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def partner_request(base_url: str, path: str, api_key: str, secret: str, method: str = "GET", payload=None):
    url = base_url.rstrip("/") + path
    body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    timestamp = str(int(time.time() * 1000))
    nonce = secrets.token_urlsafe(24)
    request = urllib.request.Request(url, data=body or None, method=method, headers={
        "Content-Type": "application/json",
        "x-partner-key": api_key,
        "x-partner-timestamp": timestamp,
        "x-partner-nonce": nonce,
        "x-partner-signature": sign_partner_request(secret, method, url, body, timestamp, nonce),
    })
    with urllib.request.urlopen(request) as response:  # raises HTTPError for 4xx/5xx
        return response.status, json.loads(response.read())
```

`path` di Python harus sudah dalam bentuk yang dikirim (karakter khusus sudah di-*percent-encode*); `urllib` tidak menormalkannya.

### curl (uji manual)

Signature tidak bisa dibuat oleh curl sendiri. Untuk uji manual dari repository ini:

```bash
# Menampilkan header + perintah curl siap pakai (sekali pakai: nonce habis setelah request pertama)
bun run partner:sign --key pk_xxx --url http://localhost:3000/api/v1/partner/ping

# Langsung mengirim request dengan body
bun run partner:sign --key pk_xxx --method POST \
  --url http://localhost:3000/api/v1/partner/echo --body '{"message":"halo"}' --send
```

Secret ditanyakan tanpa ditampilkan (atau dibaca dari baris pertama stdin: `printf '%s\n' "$PARTNER_SECRET" | bun run partner:sign …`), tidak pernah lewat argumen.

### Menguji koneksi

| Endpoint | Kegunaan |
|---|---|
| `GET /api/v1/partner/ping` | Request tanpa body: cek API key, secret, jam dan IP |
| `POST /api/v1/partner/echo` | Body `{ "message": "…" }` dikembalikan: cek signature dengan body |

Keduanya harus ada di `allowed_routes` kredensial (`/ping`, `/echo`, atau `/*`). Respons sukses berisi `partner_code` dan `server_time`.

---

## 5. Vektor uji

Implementasi signing yang benar menghasilkan nilai di bawah ini (secret `psk_test_9f8e7d6c5b4a39281706f5e4d3c2b1a0`). Nilai yang sama diuji di `src/utils/partner-signature.util.test.ts`.

| # | Request | Canonical query | Signature |
|---|---|---|---|
| 1 | `GET /api/v1/partner/orders`, timestamp `1760000000000`, nonce `n0nce_A1b2C3d4E5f6`, tanpa query & body | (kosong) | `9af5cd123600a57241434c215e422566c48ad95d071accbc992cdd7a401ba766` |
| 2 | Sama seperti #1, query `?status=paid&q=hello+world&a=1&a=0&name=O%27Brien*&city=Bandung%C3%A9&flag&empty=` | `a=0&a=1&city=Bandung%C3%A9&empty=&flag=&name=O%27Brien%2A&q=hello%20world&status=paid` | `8c1c9076a55878c4fadd810313c94c2d0e67dd0e5dd4d512d2f4a22486086d6a` |
| 3 | `POST /api/v1/partner/orders/` (dengan `/` di akhir), timestamp `1760000123456`, nonce `Zy-9_xW8vU7tS6rQ5pO4`, body `{"amount":150000,"currency":"IDR"}` | (kosong) | `c4ed5183646d04628267d9d7ee758744476ec2d75e42fa35e3341345d4df2271` |

Canonical string vektor #3 (baris dipisah `\n`, tanpa `\n` di akhir):

```
v1
1760000123456
Zy-9_xW8vU7tS6rQ5pO4
POST
/api/v1/partner/orders/

e703ba86e6a39e51e8145f59481e41a25f8bfbf7f0267b2dd2af673b9b4b3821
```

---

## 6. Kode error

Respons error memakai envelope standar (`error.type`, `error.code`, `request_id`). Sertakan `request_id` saat melapor ke tim API.

| HTTP | `error.code` | Penyebab | Yang dilakukan partner |
|---|---|---|---|
| 401 | `ERR_PARTNER_HEADERS_MISSING` | Salah satu dari empat header tidak ada atau formatnya salah (timestamp bukan angka milidetik, nonce di luar 16–64 karakter `A-Za-z0-9_-`, signature bukan 64 hex) | Perbaiki pembuatan header |
| 401 | `ERR_PARTNER_REPLAY_REJECTED` | Timestamp di luar toleransi (default ±5 menit), atau nonce sudah pernah dipakai | Sinkronkan jam server (NTP); buat nonce **dan** timestamp baru untuk setiap request, termasuk retry |
| 401 | `ERR_PARTNER_INVALID_KEY` | API key tidak dikenal, sudah dirotasi, kredensial dihapus atau dinonaktifkan | Hubungi admin API |
| 401 | `ERR_PARTNER_SIGNATURE_INVALID` | Signature tidak cocok: secret salah, path/query/body yang dikirim berbeda dari yang ditandatangani | Bandingkan dengan vektor uji §5; pastikan body yang dikirim adalah string yang sama dengan yang ditandatangani |
| 403 | `ERR_PARTNER_IP_FORBIDDEN` | IP asal tidak ada di `ip_whitelist` | Minta admin menambahkan IP / blok CIDR keluar Anda |
| 403 | `ERR_PARTNER_ROUTE_FORBIDDEN` | Route tidak ada di `allowed_routes` | Minta admin menambahkan pola route |
| 429 | `ERR_RATE_LIMITED` | Melebihi `rate_limit_rpm` (jendela 60 detik) atau batas global per IP | Tunggu sesuai header `Retry-After` (detik); header `RateLimit-*` menunjukkan sisa kuota |
| 400 / 404 / 409 / … | lainnya | Error domain endpoint (validasi body, data tidak ada, …) | Seperti API lainnya |
| 5xx | `ERR_INTERNAL`, … | Masalah di sisi API | Retry dengan backoff, **dengan nonce & timestamp baru** |

Retry aman hanya untuk operasi yang idempoten; operasi yang mengubah data sebaiknya membawa kunci idempotensi dari domain (mis. nomor transaksi partner) agar retry tidak menghasilkan data ganda.

---

## 7. Rotasi kredensial

| Yang dirotasi | Cara | Dampak |
|---|---|---|
| Secret partner | Admin: `POST /api/v1/partner-credentials/:id/secret-rotations` → `secret` baru di respons | Secret lama **langsung** tidak berlaku (tanpa masa tumpang tindih). Koordinasikan waktunya dengan partner |
| API key | Admin: `POST /api/v1/partner-credentials/:id/api-key-rotations` → `api_key` baru | Key lama langsung ditolak (`ERR_PARTNER_INVALID_KEY`) |
| Menghentikan sementara | `POST /:id/deactivate` (pulihkan dengan `/activate`) | Semua request partner ditolak `ERR_PARTNER_INVALID_KEY`; key & secret tetap sama |
| Key enkripsi server (`PARTNER_SECRET_KEYS`) | Operator: tambah key baru (`k2:…,k1:…`), set `PARTNER_SECRET_ACTIVE_KEY_ID=k2`, deploy. Secret yang dirotasi setelahnya memakai `k2`. Buang `k1` hanya setelah semua secret partner dirotasi | Tidak terlihat oleh partner selama key lama masih ada. Key yang hilang membuat secret lama tidak bisa dibaca (request partner itu → 500) |

Rotasi secret karena dugaan bocor: rotasi segera, kirim secret baru lewat kanal aman, lalu periksa log audit (§8).

---

## 8. Catatan operasional

- **Jam**: server partner wajib sinkron NTP. Toleransi timestamp diatur `PARTNER_HMAC_TOLERANCE_MS` (default 300000 = 5 menit, berlaku dua arah).
- **IP klien**: server membaca IP dari socket, atau dari `X-Forwarded-For` sejauh `TRUST_PROXY_HOPS` proxy tepercaya. Atur nilainya sesuai infrastruktur sebelum memakai `ip_whitelist`, atau whitelist akan mencocokkan IP proxy.
- **Redis mati**: pencatatan nonce dan rate limit per partner memakai Redis dan **fail-open** — partner tetap dilayani, tetapi selama Redis mati request yang sama bisa diulang di dalam jendela timestamp dan batas rate tidak berlaku (tercatat sebagai `warn` di log). Karena itu operasi penting tetap butuh kunci idempotensi di domain.
- **Log audit**: setiap request partner menghasilkan satu baris log `audit: "partner"` berisi `outcome` (`allowed` / `rejected`), `reason`, `partnerCode`, `method`, `path`, `clientIp`, `statusCode`, `durationMs` dan `requestId` — tanpa API key, nonce atau signature.
- **Cache**: data kredensial di-cache singkat di Redis (60 detik; key tak dikenal 15 detik); setiap perubahan lewat admin API menghapus cache-nya, jadi rotasi/nonaktif berlaku seketika.

---

## 9. Checklist onboarding partner (admin & ops)

**Prasyarat production (sekali per environment)**

- [ ] `PARTNER_SECRET_KEYS` + `PARTNER_SECRET_ACTIVE_KEY_ID` diisi key acak **baru** dari secret manager / deployment (jangan menyalin key lokal) dan dicadangkan — key yang hilang membuat semua secret partner tidak terbaca.
- [ ] `TRUST_PROXY_HOPS` sesuai jumlah proxy / load balancer di depan aplikasi (kalau salah, `ip_whitelist` mencocokkan IP proxy).
- [ ] Redis berjalan (nonce, rate limit, cache) dan jam server tersinkron NTP.
- [ ] Endpoint yang akan dipakai partner sudah ada di bawah `/api/v1/partner/...` (§10).

**Per partner**

1. [ ] Sepakati dengan partner: kode partner (permanen), IP keluar mereka, endpoint yang dibutuhkan, perkiraan request per menit.
2. [ ] Buat kredensial: `POST /api/v1/partner-credentials` dengan `allowed_routes` endpoint bisnisnya **plus** `/ping` dan `/echo` untuk uji, `ip_whitelist` terisi, `rate_limit_rpm` sesuai kesepakatan.
3. [ ] Uji sendiri sebelum diserahkan: `bun run partner:sign --key pk_… --url https://<api>/api/v1/partner/ping --send` → 200.
4. [ ] Serahkan `api_key` dan `secret` lewat kanal aman yang **terpisah** (mis. secret manager bersama, atau key dan secret di dua kanal berbeda) beserta panduan ini.
5. [ ] Partner mencocokkan implementasinya dengan vektor uji (§5), lalu menguji `/ping` dan `/echo` dari server mereka (IP whitelist ikut teruji).
6. [ ] Partner menguji endpoint bisnis di environment non-production.
7. [ ] Go-live: buang `/ping` dan `/echo` dari `allowed_routes` bila tidak dibutuhkan lagi (`PATCH`).
8. [ ] Pantau log `audit: "partner"` untuk `partnerCode` tersebut (`outcome`, `reason`) selama hari-hari pertama.

**Sesudahnya**: rotasi secret / API key berkala atau saat diduga bocor (§7), hentikan sementara dengan `deactivate` (bukan hapus).

---

## 10. Untuk developer backend: menambah endpoint partner

- Mount route di bawah `/api/v1/partner` (lihat `src/modules/partner-gateway/`): `partnerAuth()` sudah melindungi semua route di sana; jangan menambah `authenticate()` atau "skip auth" lain.
- Di controller, partner pemanggil dibaca dengan `currentPartner()` → `{ code }`; actor untuk kolom audit otomatis `partner:<code>`.
- Body tetap divalidasi `validate({ body })` seperti biasa (body mentah sudah dibaca untuk signature dan di-cache).
- Tambahkan pola route baru ke `allowed_routes` partner yang boleh memakainya — route yang tidak terdaftar ditolak 403.
- Dokumen OpenAPI menandai route partner dengan empat header partner secara otomatis; `test/default-deny.e2e.test.ts` memastikan route partner menolak request tanpa header partner.
