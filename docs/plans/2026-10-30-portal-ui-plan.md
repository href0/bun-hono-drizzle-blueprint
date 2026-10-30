# Plan — Tampilan portal dokumentasi (docs-site)

| Atribut | Nilai |
|---|---|
| Status | IN PROGRESS — U3 menunggu review; berikutnya U4 (rilis v1.2.0) |
| Tanggal | 2026-10-30 |
| Tujuan | Portal `docs-site/` (Astro Starlight) tampil seperti dokumentasi framework profesional: konten memakai lebar layar sehingga teks tidak perlu di-scroll ke kanan, identitas visual yang rapi, halaman depan dan navigasi yang lengkap. Dirilis sebagai v1.2.0 (MINOR) |

## Lanjut dari sini

**Posisi repo**: branch bertumpuk, belum di-push: `feat/portal-layout` (U1 `183ffcf`) → `feat/portal-identity` (U2 `fb132ea`) → `feat/portal-home` (U3, belum di-commit). Satu PR dari `feat/portal-home` membawa ketiganya.
**Sudah diputuskan — jangan tanya lagi**: plan disetujui user 2026-10-30 (U1–U3); tetap Starlight (D42); lebar konten per rentang layar (D43, nilai di `custom.css`); asal permintaan: user 2026-10-17 ("container konten agar full, teks harus di-scroll ke kanan"), sempat tertunda tanpa tercatat di backlog.
**Berikutnya**: review U3 oleh user → commit → U4 (keputusan ke `decisions.md`, plan dihapus, rilis v1.2.0).
**Cara membuktikan tampilan**: portal hasil build dilayani `bunx astro preview` (di `docs-site/`), diukur dengan `puppeteer-core` + Edge terpasang (tanpa unduhan browser) — per halaman: lebar kolom, tabel / blok kode yang di-scroll, halaman yang lebih lebar dari jendela; plus tangkapan layar. Skrip ukur ada di scratchpad sesi, bukan di repo.

## Latar belakang (diukur 2026-10-30)

- Starlight 0.42.6: kolom konten `--sl-content-width: 45rem` (±720 px) di semua lebar layar; setiap tabel `display: block; overflow: auto`, sehingga tabel yang lebih lebar dari kolom di-scroll, bukan dibungkus.
- 35 dari 40 halaman portal memuat tabel. Kolom paling banyak 5, tetapi isi selnya panjang: baris tabel terpanjang 891 karakter (`quality-gates.md`), 583 (`ARCHITECTURE.md`), 558 (`bootstrap.md`). Baris kode terpanjang ±160 karakter.
- `astro.config.mjs` hanya mengatur judul, deskripsi, sidebar dan tautan GitHub; tidak ada CSS kustom.

## Keputusan

| ID | Keputusan | Opsi | Dipilih | Alasan |
|---|---|---|---|---|
| D42 | Mesin portal | Starlight dikustomisasi · pindah ke VitePress / Docusaurus | Starlight dikustomisasi (`customCss`, override komponen) | `sync-docs.ts`, `sidebar.mjs`, `check-links.ts` dan workflow deploy sudah dibangun di atasnya; dokumentasi Astro sendiri memakai Starlight |
| D43 | Lebar konten dan tabel | lebar tetap lebih besar · menyesuaikan layar · lebar penuh | Menyesuaikan layar dengan batas atas (target ±60–64rem, ditetapkan di U1); sel tabel membungkus teks; blok kode tetap scroll horizontal | Baris teks yang terlalu panjang sulit dibaca; masalahnya ada di tabel, bukan di paragraf. Scroll di blok kode wajar di semua dokumentasi framework |
| D44 | Font | CDN (Google Fonts) · di-host sendiri (`@fontsource`) · font sistem | Di-host sendiri | Tanpa permintaan ke pihak ketiga, jalan offline dan di jaringan tertutup |
| D45 | Identitas di portal | ditulis tetap · dibaca dari sumber | Versi dibaca dari `package.json`; nama / judul tetap lewat `IDENTITY_RULES` | Satu sumber; proyek dari `bun run setup` tidak menampilkan identitas boilerplate |

## Langkah

| # | Langkah | Status | Commit |
|---|---|---|---|
| U1 | Tata letak: lebar konten, tabel, mobile, penjaga | ✅ | `183ffcf` |
| U2 | Identitas visual: warna, font, logo, badge versi | ✅ | `fb132ea` |
| U3 | Halaman depan dan navigasi | 👀 |  |
| U4 | Rilis v1.2.0, plan dihapus | ⬜ |  |

Legenda: ⬜ belum · 🔄 dikerjakan · 👀 menunggu review · ✅ selesai · ⏸ ditunda

### U1 — Tata letak

**Langkah**: `docs-site/src/styles/custom.css` lewat `customCss` di `astro.config.mjs`: `--sl-content-width` lebih lebar di layar besar (nilai akhir dicoba di 1280 / 1440 / 1920 px bersama daftar isi di kanan); sel tabel membungkus teks (termasuk kode inline yang panjang), tabel hanya di-scroll bila kolomnya benar-benar tidak muat; tampilan mobile (≤ 50rem) tidak berubah buruk. Penjaga baru (rule berikutnya, `R86`): test yang gagal bila `customCss` atau variabel lebar konten hilang — upgrade Starlight tidak boleh diam-diam mengembalikan kolom sempit. Dokumen: `documentation.md` (baris `docs-site/`), `ARCHITECTURE.md` §12.

**Selesai bila**:
- [ ] Di 1440 px, tabel `ARCHITECTURE.md` §12 dan `quality-gates.md` §1 terbaca tanpa scroll horizontal; paragraf tetap nyaman dibaca (dicek user di `bun run docs:dev`)
- [ ] Penjaga R86 + chaos test (`customCss` dicabut → test gagal → dipulihkan)
- [ ] `validate:full`, `build`, `docs:build` (tanpa tautan rusak) hijau

### U2 — Identitas visual

**Langkah**: warna aksen terang / gelap (`--sl-color-accent-*`, kontras teks memenuhi WCAG AA), font Inter + JetBrains Mono dari `@fontsource` (D44), logo SVG generik di header, badge versi dari `package.json` (D45, override komponen header / `SiteTitle`). Bila logo atau badge membawa nama proyek: aturan baru di `IDENTITY_RULES` dan dibuktikan `bun run acceptance`.

**Selesai bila**:
- [ ] Mode terang dan gelap sama-sama terbaca (dicek user); badge menampilkan versi `package.json`
- [ ] Tidak ada permintaan ke domain luar saat halaman dimuat (font dari `dist/`)
- [ ] `docs:build` hijau; `acceptance --combo a` bila `IDENTITY_RULES` berubah

### U3 — Halaman depan dan navigasi

**Langkah**: `index.mdx` dengan hero, kartu fitur (komponen `Card` / `CardGrid` / `LinkCard` bawaan Starlight), quickstart singkat dan tombol "Mulai"; tautan "Edit halaman ini" ke file sumbernya di GitHub (hanya saat build di GitHub Actions, seperti tautan GitHub sekarang; salinan sinkron menunjuk ke file aslinya, bukan ke `docs-site/`); tanggal terakhir diubah (butuh riwayat git penuh di `deploy-docs.yml`); grup sidebar yang bisa dilipat. Isi halaman depan tidak mengulang standar — hanya menautkannya (`documentation.md` §1).

**Selesai bila**:
- [ ] Halaman depan dan navigasi dicek user; tautan "Edit" membuka file sumber yang benar
- [ ] `check-links.ts` menjaga tautan baru; `docs:build` hijau; `acceptance --combo a` bila `setup` / `IDENTITY_RULES` tersentuh

### U4 — Rilis v1.2.0

**Langkah**: keputusan D42–D45 ke `docs/decisions.md` §1, item tertunda ke §3, plan ini dihapus; branch `chore/release-v1.2.0` mengikuti `git-workflow.md` §1.1 (CHANGELOG, acceptance, PR, tag, GitHub Release).

## Log

| Tanggal | Langkah | Catatan |
|---|---|---|
| 2026-10-30 | — | Plan dibuat atas permintaan user (U1–U3). Diukur: Starlight 0.42.6, `--sl-content-width: 45rem`, tabel `overflow: auto`, 35/40 halaman bertabel, baris tabel terpanjang 891 karakter |
| 2026-10-30 | U1 | Disetujui user. **Diukur di 40 halaman sebelum → sesudah** (Edge headless): 1280 px kolom 632 → 632 px, tabel di-scroll 12 → **0**, blok kode 76 → 76; 1440 px kolom 720 → 792 px, tabel 7 → **0**, blok kode 53 → 38; 1920 px kolom 720 → 1152 px, tabel 7 → **0**, blok kode 53 → 5; 390 px (ponsel) tabel 183 → 19, tidak ada halaman yang lebih lebar dari jendela. `custom.css`: `--sl-content-width` 56 / 64 / 72rem mulai 72 / 90 / 120rem (hanya di media query; ponsel tetap bawaan) + kode di sel tabel `overflow-wrap: anywhere`. **Penyimpangan**: percobaan `--sl-sidebar-width: 17rem` dibatalkan — label grup sidebar terbungkus dua baris. Harga yang diterima: potongan baris di tengah nama file dalam sel tabel (`eslint.config.m` / `js`). Penjaga R86 `test/docs-portal.test.ts`; chaos 4/4 tertangkap (`customCss` dicabut, lebar 45rem, lebar di luar media query, wrap dihapus), file dipulihkan identik |
| 2026-10-30 | U1 | Di-commit `183ffcf` atas permintaan user. Gate: `validate` 9/9 dijalankan satu per satu (gabungan dua kali gagal di knip `Array buffer allocation failed` — commit memory Windows 60,7 / 63,3 GB oleh proses lain), `test:cov` 1234, `build`, `docs:build` |
| 2026-10-30 | U2 | Aksen biru "blueprint" (gelap `#0e2a52` / `#2f6fdc` / `#b6d4fe`, terang `#dbe7ff` / `#1d4ed8` / `#0b2a6b`); kontras dihitung untuk setiap pasangan yang digambar Starlight, semua ≥ AA (terendah 6,24:1). Font `@fontsource-variable/inter` + `jetbrains-mono` 5.2.8 (versi persis). Logo `src/assets/logo.svg` + favicon biru yang sama; badge versi = override `SiteTitle` yang membungkus bawaannya, versi dari `package.json` root saat build (disembunyikan ≤ 30rem). **Dibuktikan di browser**: font terpakai dan termuat, badge `v1.1.0`, **0 permintaan keluar dari localhost**, tema gelap / terang dibedakan dari piksel PNG (`23,24,28` / `255,255,255`) dan warna terhitung. Penjaga R86 diperluas (font sendiri, tanpa `@import` / URL luar, badge dari `package.json`, logo); chaos 3/3 tertangkap. `docs-site/bun.lock`: `typescript` dipindah dari `peerDependencies` ke `devDependencies` (lockfile lama tidak sinkron dengan `package.json`; versi sama). WARN `i18n` / 404 saat build sudah ada sebelum U2 (dibuktikan build di `183ffcf`). Tidak perlu `IDENTITY_RULES`: logo dan badge tidak memuat nama proyek |
| 2026-10-30 | U2 | Di-commit `fb132ea` atas permintaan user. Server preview sempat tertinggal di port 4321 (TaskStop hanya menghentikan shell pembungkus; user yang menyadari) — dihentikan, port dicek bebas |
| 2026-10-30 | U3 | Halaman depan (`index.mdx`): logo di hero, tombol "Mulai", **Mulai dalam empat langkah** (`Steps`, hanya tautan ke standar — tidak mengulang perintah / aturan), enam kartu pilar (+ generator & setup, + kontrak API), enam `LinkCard` "Jelajahi dokumentasi"; tanpa kalimat khusus partner (MDX tidak punya penanda, `project-setup.md` §4.2); baris `title:` hero tetap → `lint:setup` hijau. Navigasi: `sync-docs.ts` menulis `lastUpdated` = tanggal commit terakhir file **sumber** (Starlight membaca salinan yang di-ignore git) dan `editUrl` ke file sumber di branch build (PR: head branch) hanya di GitHub Actions, `false` untuk `docs/api/` (R78); `deploy-docs.yml` checkout `fetch-depth: 0`; grup API Reference terlipat. **Dibuktikan** (build dengan variabel GitHub disimulasikan, Edge headless): beranda 4 langkah / 6 kartu / 6 tautan / logo, tanpa overflow di 1440 dan 390 px; `standards/cache` "Last updated: Oct 29, 2026" + edit ke `docs/standards/cache.md`; `api/users` bertanggal, tanpa edit, grup API terbuka; lokal tanpa edit. R86 diperluas; chaos 2/2 tertangkap |
