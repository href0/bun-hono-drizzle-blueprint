# Panduan Autentikasi untuk Frontend

Panduan ini untuk developer frontend (SPA/web) dan klien lain yang memakai API ini. Isinya: alur login, cara menyimpan token, refresh otomatis, logout, dan pengaturan domain/cookie yang benar.

Ringkasnya:

- **Access token** (JWT, umur 15 menit) dikirim di header `Authorization: Bearer <token>`. Simpan **di memori**, bukan di `localStorage`.
- **Refresh token** ada di cookie `refresh_token` yang `HttpOnly`. JavaScript tidak bisa membacanya, dan browser mengirimnya sendiri, hanya ke endpoint `/api/v1/auth/*`.
- Saat access token habis, panggil `POST /api/v1/auth/refresh`. Setiap refresh mengganti refresh token (rotasi), dan **hanya boleh satu refresh berjalan pada satu waktu**, termasuk lintas tab.
- Semua endpoint `/api/v1/*` wajib access token, kecuali login, refresh, logout dan register.

---

## 1. Endpoint

Base: `<API>/api/v1/auth`. Body dan respons memakai `snake_case`.

| Endpoint | Autentikasi | Request | `data` di respons |
|---|---|---|---|
| `POST /login` | publik | `{ "email", "password" }` | `{ "access_token", "token_type": "Bearer", "expires_in", "user" }` + cookie |
| `POST /refresh` | cookie | tanpa body | `{ "access_token", "token_type", "expires_in" }` + cookie baru |
| `POST /logout` | cookie | tanpa body | `null`, cookie dihapus (aman dipanggil berulang) |
| `POST /logout-all` | access token | tanpa body | `null`, semua sesi user di semua perangkat diakhiri |
| `GET /me` | access token | — | `{ "id", "email", "full_name", "role" }` |
| `POST /register` | publik | `{ "email", "full_name", "password" }` | user baru (201). **Hanya ada bila `AUTH_REGISTRATION_ENABLED=true`**; kalau tidak, 404 |

- `expires_in` adalah umur access token dalam detik (default 900).
- `user.role` bernilai `admin` atau `user`. Endpoint yang tidak diizinkan untuk role tertentu menjawab 403 `ERR_ROLE_FORBIDDEN`.
- Refresh token **tidak pernah** muncul di body respons.

Cookie yang dipasang server:

```
Set-Cookie: refresh_token=<opaque>; Max-Age=604800; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict
```

- Umur cookie 7 hari dan diperbarui di setiap refresh. Satu sesi login berakhir paling lambat 30 hari setelah login, setelah itu user harus login lagi.
- `Path=/api/v1/auth` membuat cookie hanya terkirim ke endpoint auth, tidak ke endpoint API lainnya.

---

## 2. Menyimpan token

| Token | Simpan di | Jangan |
|---|---|---|
| Access token | variabel/state di memori (store aplikasi, closure) | `localStorage`, `sessionStorage`, cookie buatan sendiri |
| Refresh token | tidak disimpan FE; browser yang mengurus cookie-nya | — |

Alasannya: semua yang ada di `localStorage` bisa dibaca skrip apa pun yang berjalan di halaman. Kalau ada celah XSS, token yang tersimpan di sana bisa dicuri dan dipakai dari luar. Access token di memori hilang saat halaman ditutup, dan refresh token `HttpOnly` tidak bisa dibaca skrip sama sekali.

Akibatnya, setelah reload halaman access token hilang. Saat aplikasi dibuka, panggil `POST /auth/refresh`:

- 200 berarti user masih login, dan Anda mendapat access token baru.
- 401 berarti user perlu login.

FE tidak bisa memeriksa cookie-nya sendiri (`HttpOnly`); memanggil refresh adalah satu-satunya cara mengetahui apakah sesi masih ada.

---

## 3. `credentials: 'include'`

Browser hanya mengirim dan menyimpan cookie untuk request lintas origin kalau diminta:

```ts
fetch(`${API}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' });
```

Pakai `credentials: 'include'` untuk **login, refresh, logout dan logout-all**. Dengan axios: `withCredentials: true`.

Server juga harus mengizinkan origin FE: `CORS_ORIGINS` di env server harus berisi origin FE persis, misalnya `https://app.example.com` atau `http://localhost:5173`. Origin yang tidak terdaftar ditolak CORS **dan** ditolak 403 `ERR_CSRF_ORIGIN_FORBIDDEN` (lihat §7).

---

## 4. Refresh otomatis

Pola yang disarankan:

1. Kirim request API dengan access token.
2. Respons 401 dengan `error.code` `ERR_AUTH_TOKEN_EXPIRED` (atau token belum ada) → panggil refresh **sekali**, lalu ulangi request **sekali**.
3. Refresh gagal (401 `ERR_AUTH_REFRESH_INVALID` / `ERR_AUTH_REFRESH_REUSED`) → hapus state login, arahkan ke halaman login.

### Hanya boleh satu refresh pada satu waktu

Setiap refresh **mengganti** refresh token. Token lama yang dipakai lagi dianggap dicuri: server mengakhiri seluruh sesi dan menjawab `ERR_AUTH_REFRESH_REUSED`.

Ini juga terjadi kalau dua refresh dikirim bersamaan dengan cookie yang sama. Contohnya:
- dua request paralel di satu tab sama-sama mendapat 401 lalu masing-masing me-refresh;
- dua tab me-refresh pada saat yang sama.

Refresh pertama berhasil. Refresh kedua membawa token yang sudah diganti, dan user ter-logout.

Karena itu:

- **Di dalam satu tab**: pakai *single-flight*. Simpan promise refresh yang sedang berjalan, dan request lain menunggu promise yang sama.
- **Antar tab**: kunci dengan [Web Locks API](https://developer.mozilla.org/docs/Web/API/Web_Locks_API) (`navigator.locks`, tersedia di semua browser modern). Tab kedua menunggu sampai tab pertama selesai. Cookie dipakai bersama semua tab, jadi tab kedua mengirim cookie yang sudah baru, dan refresh-nya juga berhasil.

### Contoh klien (TypeScript, `fetch`)

```ts
const API = 'https://api.example.com';

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

interface ErrorBody {
  error?: { code: string };
}

/** Satu refresh pada satu waktu: di tab ini (promise bersama) dan lintas tab (Web Lock). */
const refreshAccessToken = (): Promise<boolean> => {
  refreshing ??= navigator.locks
    .request('auth-refresh', async () => {
      const res = await fetch(`${API}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      const body = (await res.json()) as { data: { access_token: string } };
      accessToken = body.data.access_token;
      return true;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

/** Request API dengan access token; satu kali refresh + ulang bila token kedaluwarsa. */
export const api = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const send = () =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  if (!accessToken) await refreshAccessToken();
  let res = await send();
  if (res.status === 401) {
    const code = ((await res.clone().json()) as ErrorBody).error?.code;
    const retryable = code === 'ERR_AUTH_TOKEN_EXPIRED' || code === 'ERR_UNAUTHORIZED';
    if (retryable && (await refreshAccessToken())) res = await send();
  }
  if (res.status === 401) onLoggedOut(); // tampilkan halaman login
  return res;
};

export const login = async (email: string, password: string): Promise<void> => {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(((await res.json()) as ErrorBody).error?.code ?? 'LOGIN_FAILED');
  accessToken = ((await res.json()) as { data: { access_token: string } }).data.access_token;
};

export const logout = async (): Promise<void> => {
  await fetch(`${API}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' });
  accessToken = null;
};

declare function onLoggedOut(): void;
```

Opsional: refresh lebih awal, misalnya 60 detik sebelum `expires_in` habis, supaya request jarang terkena 401. Refresh lebih awal tetap harus lewat `refreshAccessToken()` yang sama.

---

## 5. Logout

| Kebutuhan | Panggil |
|---|---|
| Keluar dari sesi ini | `POST /auth/logout` dengan `credentials: 'include'`, lalu hapus access token dari memori |
| Keluar dari semua perangkat | `POST /auth/logout-all` dengan access token |

Access token yang sudah terbit tetap berlaku sampai umurnya habis (maksimal 15 menit), karena server tidak menyimpan daftar access token. Hapus dari memori FE saat logout. Hal yang sama berlaku saat admin menonaktifkan atau menghapus user: refresh berikutnya ditolak, dan access token yang masih ada habis dengan sendirinya.

---

## 6. Kode error yang perlu ditangani

| HTTP | `error.code` | Arti | Tindakan FE |
|---|---|---|---|
| 401 | `ERR_UNAUTHORIZED` | Tidak ada / format header `Authorization` salah | Refresh lalu ulangi; gagal → login |
| 401 | `ERR_AUTH_TOKEN_EXPIRED` | Access token habis | Refresh lalu ulangi |
| 401 | `ERR_AUTH_TOKEN_INVALID` | Access token tidak sah (dipalsukan, secret server diganti, user dihapus) | Refresh; gagal → login |
| 401 | `ERR_AUTH_INVALID_CREDENTIALS` | Email/password salah atau akun nonaktif (sengaja tidak dibedakan) | Tampilkan pesan dari `message` |
| 401 | `ERR_AUTH_REFRESH_INVALID` | Sesi tidak ada/berakhir (logout, kedaluwarsa, akun dinonaktifkan) | Halaman login |
| 401 | `ERR_AUTH_REFRESH_REUSED` | Refresh token lama dipakai lagi — seluruh sesi dicabut | Halaman login (periksa single-flight, §4) |
| 403 | `ERR_ROLE_FORBIDDEN` | Role tidak boleh mengakses endpoint ini | Sembunyikan fitur / tampilkan pesan |
| 403 | `ERR_CSRF_ORIGIN_FORBIDDEN` | Origin FE tidak terdaftar | Konfigurasi: tambahkan origin ke `CORS_ORIGINS` |
| 429 | `ERR_AUTH_LOGIN_LOCKED` | Terlalu banyak percobaan login untuk email ini dari alamat ini | Tunggu `Retry-After` detik |
| 429 | `ERR_RATE_LIMITED` | Batas request global | Tunggu `Retry-After` detik |

`message` sudah diterjemahkan sesuai header `Accept-Language` (`id` atau `en`) dan aman ditampilkan ke user.

---

## 7. Domain, cookie dan CSRF

### Kenapa ada proteksi CSRF padahal API memakai token?

CSRF bukan soal form, melainkan soal **cookie**. Browser otomatis mengirim cookie ke domain tujuan, siapa pun yang memicu request-nya. Kalau situs lain diam-diam mengirim `POST` ke API, cookie user ikut terkirim.

- Endpoint yang memakai **`Authorization: Bearer`** (hampir semua API) tidak rawan CSRF: browser tidak pernah menambahkan header itu sendiri.
- Endpoint yang memakai **cookie** (`/auth/refresh`, `/auth/logout`, juga `/auth/login` yang memasang cookie) yang perlu dilindungi.

Perlindungannya dua lapis, tanpa token CSRF yang harus dikelola FE:

1. **`SameSite=Strict`** pada cookie: browser tidak mengirim cookie untuk request yang datang dari **situs** lain.
2. **Cek `Origin` / `Sec-Fetch-Site`** di server (`hono/csrf`): request dari origin yang tidak ada di `CORS_ORIGINS` ditolak 403 `ERR_CSRF_ORIGIN_FORBIDDEN`. Header ini diisi browser dan tidak bisa diubah JavaScript.

### "Site" bukan "domain"

`SameSite` membandingkan **site**: skema + domain terdaftar (eTLD+1). Subdomain dan port tidak dihitung.

| Dari → ke | Same-site? | Cookie `Strict` terkirim? |
|---|---|---|
| `https://app.example.com` → `https://api.example.com` | ya | ya |
| `https://blog.example.com` → `https://api.example.com` | ya | **ya** |
| `http://localhost:5173` → `http://localhost:3000` | ya (port diabaikan) | ya |
| `https://app-a.com` → `https://api-b.com` | tidak | **tidak** |
| `https://a.github.io` → `https://b.github.io` | tidak (`github.io` adalah *public suffix*) | tidak |

Akibatnya:

- `SameSite` **tidak** melindungi dari subdomain lain di domain yang sama. Misalnya `blog.example.com` yang menampilkan konten user atau pernah disusupi. Yang menahannya adalah cek `Origin`: `https://blog.example.com` tidak ada di `CORS_ORIGINS`, jadi ditolak.
- **Origin** (dipakai CORS) berbeda dari site: `app.example.com` dan `api.example.com` adalah origin berbeda tetapi site yang sama. CORS tetap perlu diatur.

### Pilihan penempatan FE dan API

| Penempatan | Cookie | Catatan |
|---|---|---|
| **Disarankan**: subdomain satu domain (`app.example.com` + `api.example.com`) | `SameSite=Strict` jalan | `CORS_ORIGINS=https://app.example.com` |
| Satu origin lewat reverse proxy (`example.com` → FE, `example.com/api` → API) | jalan | CORS tidak perlu |
| Domain berbeda (`app-a.com` → `api-b.com`) | `Strict`/`Lax` **tidak** terkirim | Hanya bisa dengan `AUTH_COOKIE_SAMESITE=None` (wajib HTTPS). Browser makin ketat memblokir cookie pihak ketiga (Safari sudah, Chrome bertahap) — rapuh, hindari |

### Pengembangan lokal

- FE `http://localhost:5173` dan API `http://localhost:3000` adalah satu site, jadi cookie terkirim. Isi `CORS_ORIGINS=http://localhost:5173` di env server.
- Cookie memakai `Secure`. Chrome, Edge dan Firefox memperlakukan `http://localhost` sebagai konteks aman, jadi cookie tetap tersimpan. Kalau browser Anda tidak menyimpannya (beberapa versi Safari), jalankan API lewat HTTPS lokal atau pakai browser lain untuk pengembangan.
- Panggil API langsung ke origin API (atau lewat proxy dev server dengan path `/api/v1/auth` yang sama), karena cookie hanya berlaku untuk path `/api/v1/auth`.

### Klien non-browser (mobile, server, CLI)

Klien non-browser tidak mengirim `Origin`. Agar tidak ditolak 403, kirim `Content-Type: application/json` pada `/auth/refresh` dan `/auth/logout`, walaupun body-nya kosong. Klien seperti ini menyimpan refresh token dari header `Set-Cookie` di penyimpanan aman platform (Keychain, Keystore).

### Risiko yang tersisa: cookie dari subdomain lain

Subdomain lain di domain yang sama tidak bisa membaca cookie kita (`HttpOnly`, host-only). Tetapi subdomain itu bisa **menanam** cookie `refresh_token` miliknya untuk `.example.com` ("cookie tossing"). Paling jauh, korban ikut login ke akun penyerang. Awalan `__Host-` (penangkal terkuat) mewajibkan `Path=/`, padahal cookie ini sengaja dibatasi ke `/api/v1/auth`. Jadi: **jangan taruh konten yang tidak tepercaya di subdomain domain API.**

---

## 8. Akun admin pertama

User dibuat oleh admin (`POST /api/v1/users`, role `admin`). Admin pertama dibuat developer di server:

```bash
bun run seed:admin --email admin@example.com --name "Admin"   # password ditanyakan (tidak terlihat)
bun run seed:admin --email someone@example.com --promote      # user yang sudah ada → admin aktif
```

Password tidak pernah diberikan lewat argumen atau env (tercatat di riwayat shell dan daftar proses). Untuk otomasi, kirim lewat stdin: `printf '%s\n' "$PASSWORD" | bun run seed:admin --email …`.
