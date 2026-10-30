# Plan — Rilis boilerplate v1.0.0

| Atribut | Nilai |
|---|---|
| Status | IN PROGRESS — R1 menunggu review; tersisa R2 (riwayat git) dan R3 (rilis) |
| Tanggal | 2026-10-30 |
| Konteks | Adopsi dari blueprint NestJS selesai (D0–D41, alasan di [`docs/decisions.md`](../decisions.md)); plan adopsi dan arsipnya dihapus, keputusannya pindah ke `decisions.md` |
| Akhir | Plan ini dihapus di commit rilis (R3); proyek dari tag `v1.0.0` tidak membawanya |

## Lanjut dari sini

**Posisi repo**: `main` = `origin/main` @ `af829e4` (Step 7.4k, CI hijau). R1 dikerjakan di branch `docs/decision-log` (belum di-commit). Backup lengkap (mirror + bundle, sebelum R1) di `../_backup/` di samping repo. Repo GitHub publik, tanpa fork / bintang.

**Sudah diputuskan — jangan tanya lagi**:
- Plan adopsi **dihapus**, bukan diarsipkan; keputusan D0–D41 + pengecualian + backlog di `docs/decisions.md` (cara A, keputusan user 2026-10-30).
- Riwayat git dibersihkan: blueprint awal, plan lama dan arsipnya dihapus dari **semua** commit (`git-filter-repo`, sudah terpasang); 55 branch lama + `backup-before-clean` dihapus; repo GitHub **dihapus lalu dibuat ulang** dengan nama sama (publik), lalu riwayat bersih di-push.
- Tag `v1.0.0` hanya atas permintaan user, setelah CI hijau.

**Aksi pertama sesi baru**: laporkan posisi repo dan status langkah di tabel; jangan mulai langkah berikutnya tanpa persetujuan user.

## Langkah

| # | Langkah | Status |
|---|---|---|
| R1 | Log keputusan: `docs/decisions.md`; rujukan plan di kode / dokumen diarahkan ke ID keputusan atau standar; plan adopsi + arsip dihapus | 👀 |
| R2 | Pembersihan riwayat git (destruktif) | ⬜ |
| R3 | Rilis v1.0.0 | ⬜ |

### R1 — Log keputusan

**Selesai bila**: tidak ada rujukan ke plan adopsi, langkah plan (`step 2.5`), lampiran (`L3`) atau `docs/archive/` di kode dan dokumen; setiap ID `D…` yang dirujuk ada di `decisions.md`; `validate:full`, `build`, `docs:build`, `verify:scaffold` hijau; `acceptance --combo a` hijau.

### R2 — Pembersihan riwayat git

1. Salinan baru dari `main` (bukan repo kerja) → `git filter-repo --invert-paths` untuk blueprint awal (kedua lokasinya), `docs/plans/from-nestjs-plan.md`, plan adopsi, dan `docs/archive/`.
2. Verifikasi di salinan: tidak ada istilah atau path blueprint awal di semua commit; isi `main` sama dengan sebelum R2; semua gate hijau.
3. Repo kerja: hapus branch lama, ambil riwayat bersih.
4. User menghapus dan membuat ulang repo GitHub (nama sama, publik, tanpa README) → **konfirmasi user** → push `main` → aktifkan lagi GitHub Pages dan *private vulnerability reporting*; CI hijau.

### R3 — Rilis v1.0.0

Branch `chore/release-v1.0.0` (`git-workflow.md` §1.1) → hapus plan ini → `bun run acceptance --combo a` pada commit rilis → skill `update-version` (versi sudah `1.0.0`: `CHANGELOG.md` pertama) → PR → CI hijau → merge → tag `v1.0.0` atas permintaan user.

## Log

| Tanggal | Langkah | Catatan |
|---|---|---|
| 2026-10-30 | R1 | Rujukan diukur: ±370 di 126 file (`D…` 203, langkah plan 168, tautan 16). Penggantian mekanis (`plan D13` → `D13`, `(plan step 2.5)` dihapus) + rumusan ulang manual; lampiran dipindah ke standar: registry env → `.env.example`, spesifikasi auth → `auth-and-inbound.md` §2 (claims + langkah refresh), urutan pipeline → `bootstrap.md` §3, backlog → `decisions.md` §3, pengecualian repository refresh-token → `decisions.md` §2. Koreksi: `bun run setup` **tidak** menghapus `docs/plans/` / `docs/archive/` (plan sengaja ikut ke proyek turunan); kini proyek turunan mewarisi `decisions.md` |
| 2026-10-30 | R1 | Atas permintaan user (cara melanjutkan dengan plan setelah rilis): `docs/plans/README.md` — cara kerja + kerangka plan + format laporan (tetap ada, ikut ke proyek turunan); penomoran: `D…` milik boilerplate, proyek turunan `PD1`… di `decisions.md` §4 (baru) agar update dari `upstream` tidak bentrok — `AGENTS.md`, `documentation.md`, `project-setup.md` §5 |
| 2026-10-30 | R1 | **Verifikasi**: `validate:full` 1225 test (99.78 %), `build`, `docs:build` (41 halaman, `decisions.md` di portal *Overview*), `verify:scaffold` hijau; `bun run acceptance --combo a` (commit sementara) hijau ketiga kombinasi **termasuk tahap D**; tidak ada rujukan ke plan lama / langkah / lampiran / `docs/archive/`; setiap `D…` yang dirujuk (35) ada di `decisions.md`; tidak ada istilah atau path blueprint awal di pohon kerja | — |
