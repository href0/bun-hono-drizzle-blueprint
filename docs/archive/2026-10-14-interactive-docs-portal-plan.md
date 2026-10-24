# Implementation Plan: Interactive Documentation Portal (Astro Starlight)

**Tanggal**: 2026-10-14 (direvisi 2026-10-16)  
**Status**: SELESAI — direview dan di-merge (di luar urutan rencana blueprint, dikerjakan sebelum Step 7.4b); diarsipkan di Step 7.4e  
**Target Engine**: Astro Starlight  
**Target Deployment**: GitHub Actions ke GitHub Pages, **manual** (`workflow_dispatch`)  
**Target URL**: `https://<github-user>.github.io/<repo-name>/` (base path diambil otomatis dari `actions/configure-pages`)  

---

## 1. Tujuan & Filosofi

Mentransformasikan 19 dokumen standar di `docs/standards/`, `ARCHITECTURE.md`, `README.md`, dan kedua panduan (`docs/auth-guide.md`, `docs/partner-integration-guide.md`) menjadi portal dokumentasi web modern:
- **Sidebar Navigasi Bertingkat**: Mengelompokkan standar backend berdasarkan domain fungsional.
- **Pencarian Instan (Ctrl + K)**: Menggunakan engine offline *Pagefind* bawaan Starlight.
- **Dark Mode & Syntax Highlighting**: TypeScript, SQL, Diff, Bash.
- **Zero Content Drift (SSOT)**: Dokumen markdown di repo tetap satu-satunya sumber kebenaran; portal hanya *rendering layer*. Salinan hasil sync di-gitignore dan dibangun ulang setiap dev/build.
- **Zero Backend Pollution**: Engine web docs terisolasi penuh (dependensi sendiri di `docs-site/package.json`).

---

## 2. Arsitektur Struktur Folder

```
backend-boilerplate/
├── ARCHITECTURE.md, README.md       <-- Overview
├── docs/
│   ├── standards/                   <-- SSOT konten (19 topik standar)
│   ├── auth-guide.md                <-- Panduan frontend
│   └── partner-integration-guide.md <-- Panduan partner
├── docs-site/                       <-- Portal Web Starlight (terisolasi)
│   ├── package.json                 <-- Astro + Starlight saja
│   ├── astro.config.mjs             <-- Branding; site/base dari env workflow
│   ├── sidebar.mjs                  <-- Menu sidebar (dicek oleh sync-docs.ts)
│   ├── sync-docs.ts                 <-- Salin dokumen → src/content/docs/ + tulis ulang link
│   ├── check-links.ts               <-- Gagal bila ada link/anchor internal rusak di dist/
│   ├── public/favicon.svg
│   └── src/content/docs/index.mdx   <-- Halaman depan (satu-satunya konten yang ditulis tangan)
└── .github/workflows/deploy-docs.yml <-- Build & deploy manual ke GitHub Pages
```

---

## 3. Struktur Navigasi Sidebar

Sumber kebenaran menu: `docs-site/sidebar.mjs`. `sync-docs.ts` gagal bila ada halaman yang tersinkron tetapi tidak ada di menu, atau slug menu tanpa dokumen sumber.

| Menu Kategori | Dokumen Sumber |
|---|---|
| **Overview** | `ARCHITECTURE.md`, `README.md` |
| **Getting Started** | `structure.md`, `configuration.md`, `bootstrap.md` |
| **HTTP & API Contracts** | `http-contract.md`, `naming.md`, `openapi.md` |
| **Inbound Channels & Security** | `auth-and-inbound.md`, `auth-guide.md`, `partner-integration-guide.md` |
| **Data Layer** | `database.md`, `transactions.md`, `raw-queries.md`, `datetime.md` |
| **Infrastructure & Outbound** | `cache.md`, `integrations.md`, `logging.md` |
| **Quality Gates & Workflow** | `new-module.md`, `quality-gates.md`, `testing.md`, `git-workflow.md`, `documentation.md` |

---

## 4. Isolasi Tooling & Quality Gate

Hasil verifikasi: `bun run lint` / `format:check` hanya menyasar `src`, `test`, `scripts` dan dependency-cruiser hanya `src`; ls-lint dan knip tetap hijau dengan `docs-site/` ada. **Tetapi** hook pre-commit (`lint-staged`) menjalankan ESLint pada setiap `*.ts` yang di-stage, termasuk `docs-site/` (proyek Astro dengan dependensi sendiri → `no-unsafe-call`, `no-console`) — maka `docs-site/**` masuk global `ignores` di `eslint.config.mjs`. `bun run validate:full` lulus.

Aturan sync (`sync-docs.ts`):
1. `# Judul` pertama → `title` frontmatter dan dihapus dari isi (Starlight sudah merender judul; tanpa ini judul tampil dua kali).
2. Link relatif ke dokumen yang tersinkron → URL portal relatif (berlaku untuk base path apa pun), anchor dipertahankan.
3. Link relatif ke file lain (kode, rencana, arsip) → URL GitHub `blob/<sha>` saat build di GitHub Actions; saat lokal menjadi teks biasa (tidak ada URL repo tebakan).
4. Dokumen sumber hilang → exit 1.

`check-links.ts` (dijalankan oleh `bun run build`): setiap `href`/`src` internal harus menunjuk file hasil build dan setiap `#anchor` ke `id` yang ada — dibuktikan dengan chaos test (link dan anchor palsu → exit 1).

`scripts/setup.ts` mengganti judul portal (`IDENTITY_RULES`). Link GitHub hanya muncul saat build di GitHub Actions (`GITHUB_REPOSITORY`), jadi tidak ada nama repo yang di-hardcode.

---

## 5. Tahapan Eksekusi

### Fase A: Inisialisasi Engine Starlight ✅
Folder `docs-site/`, `astro.config.mjs` (title, sidebar, Pagefind bawaan).

### Fase B: Pemetaan Konten ✅
`sync-docs.ts` + `sidebar.mjs` (aturan di §4).

### Fase C: Isolasi & Penegakan Gate ✅
`docs-site/**` di global `ignores` ESLint (ditemukan oleh hook pre-commit, lihat §4); `check-links.ts` ditambahkan sebagai gate portal.

### Fase D: Otomatisasi GitHub Actions ✅
`.github/workflows/deploy-docs.yml`, hanya `workflow_dispatch`: GitHub Pages selalu publik (juga untuk repo privat), jadi publikasi adalah keputusan sadar. `actions/configure-pages` memberi `DOCS_SITE` / `DOCS_BASE`. Belum pernah dijalankan: repo belum punya remote.

---

## 6. Acceptance Criteria

- [x] Web dokumentasi dapat dijalankan lokal via `bun run docs:dev` (setelah `bun install` di `docs-site/`).
- [x] Navigasi sidebar, pencarian (Ctrl+K), dan dark mode (bawaan Starlight).
- [x] Syntax highlighting TypeScript, SQL, Bash (Expressive Code bawaan Starlight).
- [x] `bun run validate:full` pada root backend tetap lulus.
- [x] `bun run docs:build` lulus tanpa link rusak, lokal dan dengan base path (`DOCS_BASE=/demo-repo`).
- [ ] Workflow GitHub Actions dijalankan sungguhan — menunggu remote dan nama repo.
