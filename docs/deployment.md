# Panduan Deploy

Untuk tim yang menjalankan aplikasi di server (DevOps / SRE / developer yang men-deploy). Jalur ini dibuktikan oleh job CI `docker` di setiap push: kedua image di-build, image tools memigrasi PostgreSQL sungguhan, lalu image production dijalankan dengan setelan production sampai status `healthy`.

## 1. Dua image dari satu `Dockerfile`

| Image | Perintah build | Isi | Dipakai untuk |
|---|---|---|---|
| **runner** (default) | `docker build -t <app>:<versi> .` | `src/`, `drizzle/`, dependency production saja; user non-root `bun` | API yang melayani trafik |
| **tools** | `docker build --target tools -t <app>-tools:<versi> .` | semua dependency, `scripts/`, `drizzle.config.ts` | job sekali jalan: migrasi, admin pertama, pembersihan token |

Bangun keduanya dari commit yang sama dan beri tag yang sama, supaya migrasi yang dijalankan selalu cocok dengan kode yang akan naik.

## 2. Konfigurasi production

Semua konfigurasi lewat environment variable. Daftar lengkap dan defaultnya ada di `.env.example`; aturan validasinya di [configuration.md](standards/configuration.md). Aplikasi **menolak start** dan menyebut nama setiap variabel yang salah (tanpa nilainya).

- Secret diberikan oleh orchestrator (secret store, `--env-file` di server). Image tidak pernah membawa file env: `.dockerignore` mengecualikannya.
- Wajib diisi:
  - `NODE_ENV=production`;
  - `DATABASE_URL`;
  - `REDIS_HOST` / `REDIS_PORT` (dan `REDIS_PASSWORD` bila ada);
  - `JWT_SECRET` (minimal 32 karakter, acak);
  - `PARTNER_SECRET_KEYS` + `PARTNER_SECRET_ACTIVE_KEY_ID`. Cara membuat kuncinya ada di komentar `.env.example`. Simpan kunci ini dengan aman: tanpanya, secret partner yang tersimpan tidak bisa dibaca. <!-- partner -->
- Periksa juga:
  - `CORS_ORIGINS`: origin frontend yang diizinkan. `*` ditolak di production.
  - `TRUST_PROXY_HOPS`: jumlah reverse proxy / load balancer di depan aplikasi (biasanya `1`). Dengan `0`, aplikasi memakai alamat socket, sehingga rate limit per IP menghitung semua klien sebagai satu IP proxy.
  - `AUTH_COOKIE_SAMESITE`: `None` hanya untuk frontend di site lain lewat HTTPS ([auth-guide.md](auth-guide.md)).
  - `API_DOCS_ENABLED`: di production defaultnya mati.
  - Secret webhook setiap vendor. Bila kosong, webhook vendor itu ditolak (401).

## 3. Urutan deploy

1. **Build** kedua image (§1).
2. **Migrasi** sebelum versi baru naik:
   `docker run --rm --env-file <file-env-production> <app>-tools:<versi>`
   (perintah default image tools = `bun run db:migrate`). Versi lama masih melayani trafik selama migrasi, jadi migrasi harus tetap cocok dengan kode lama: tambah kolom / tabel dulu, hapus yang lama di rilis berikutnya.
3. **Admin pertama** (sekali, saat database masih kosong), interaktif:
   `docker run --rm -it --env-file <file-env-production> <app>-tools:<versi> bun run seed:admin --email <email>`
   Password ditanyakan di terminal, tidak pernah lewat argumen ([quality-gates.md](standards/quality-gates.md), tabel perintah).
4. **Jalankan** image runner (port `3000`, atau `PORT`). Saat start, aplikasi memeriksa PostgreSQL dan berhenti bila database tidak terjangkau. Redis direkomendasikan, bukan wajib: tanpa Redis aplikasi tetap jalan dalam mode *degraded*, tetapi cache, rate limit, dan kunci login tidak aktif ([cache.md](standards/cache.md) §6) — di production, jalankan Redis.
5. **Alihkan trafik** setelah readiness merespons 200 (§4), lalu hentikan versi lama dengan `SIGTERM`. Aplikasi menyelesaikan request yang sedang berjalan, lalu menutup koneksi database dan Redis.

## 4. Health check

| Endpoint | Dipakai oleh | Arti |
|---|---|---|
| `<API_BASE_PATH>/health/liveness` | `HEALTHCHECK` image, liveness probe | proses hidup |
| `<API_BASE_PATH>/health/readiness` | load balancer, readiness probe | 503 hanya bila PostgreSQL tidak terjangkau |
| `<API_BASE_PATH>/health` | monitoring, manusia | selalu 200; `status` = `UP` / `DEGRADED` (Redis mati) / `DOWN` |

`HEALTHCHECK` di `Dockerfile` membaca `PORT` dan `API_BASE_PATH` dari env container saat berjalan (bawaan `3000` dan `/api`), jadi mengubah keduanya tidak perlu mengedit `Dockerfile`.

## 5. Job terjadwal

- **Pembersihan refresh token kedaluwarsa**, harian (cron, CronJob k8s, atau job CI terjadwal):
  `docker run --rm --env-file <file-env-production> <app>-tools:<versi> bun run auth:purge-tokens`
  (default: token yang kedaluwarsa lebih dari 7 hari; `--days <n>` untuk mengubahnya).

## 6. Log

Log ditulis ke stdout sebagai JSON satu baris per event (pino). Setiap baris membawa `app`, `env` dan, untuk request, `requestId`. Kumpulkan dengan log collector platform. Aturan isi log ada di [logging.md](standards/logging.md).

## 7. Mencoba stack lengkap di lokal

`docker compose --profile full up -d` menjalankan PostgreSQL, Redis dan image runner dengan file env lokal. Migrasi tetap dijalankan dulu (`bun run db:migrate` dari host, atau image tools di network compose).
