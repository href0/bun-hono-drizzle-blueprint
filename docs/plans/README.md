# Plan kerja

Pekerjaan yang lebih besar dari satu perubahan mengikuti sebuah plan di folder ini (aturan agent: `.agents/AGENTS.md` → *Work Plans*). Satu file per pekerjaan: `docs/plans/<YYYY-MM-DD>-<topik>-plan.md`. Plan bersifat **sementara**: setelah selesai, setiap keputusannya pindah ke [`docs/decisions.md`](../decisions.md) (satu baris), yang ditunda ke Backlog di sana, lalu file plan dihapus — riwayat langkahnya tetap ada di git.

## Cara memakai

1. Salin kerangka di bawah, isi tujuan dan keputusan; minta persetujuan user sebelum langkah pertama.
2. Kerjakan **satu langkah** sekali jalan: branch `<type>/<slug>`, penuhi "Selesai bila", jalankan gate (`docs/standards/quality-gates.md` §4), laporkan dengan template laporan, lalu STOP untuk review. Commit / merge hanya atas permintaan user.
3. Setiap langkah: perbarui tabel progres dan tambahkan baris log (apa yang dikerjakan, penyimpangan, verifikasi, commit). Blok **Lanjut dari sini** selalu menggambarkan posisi terkini (skill `handoff` / `pickup` membacanya).
4. Keputusan baru diberi ID berikutnya: `D…` di boilerplate, `PD…` di proyek yang dibuat darinya (lihat `decisions.md`). Kode dan dokumen boleh merujuk ID itu sejak langkah pertama — ID-nya tetap valid setelah plan dihapus.
5. Plan selesai → keputusan ke `decisions.md` §1 (atau §4 di proyek), item tertunda ke §3, hapus file plan di commit terakhir pekerjaan itu. **Sebelum menghapus**, baca plan dari atas ke bawah dan pastikan setiap isinya punya tempat permanen: setiap keputusan (termasuk ID lokal seperti `E1` yang dikutip kode → ID `D…` baru, lalu kutipannya diganti), detail rancangan yang masih berlaku (ke baris keputusannya atau ke `docs/standards/`), setiap item terbuka / "nanti saja" (ke §3), item backlog yang kini sudah dikerjakan (dihapus dari §3), dan rujukan ke plan di kode atau dokumen (`git grep` nama plan, "plan <topik> step") — tidak ada yang tersisa.
6. Sebelum penutupan: **review penutupan** dan, di plan panjang, **checkpoint** di tengah jalan (bagian berikut).

## Review checkpoints

Gate tiap langkah hanya membuktikan langkah itu; celah *antar* langkah (dokumen yang tertinggal, aturan tanpa enforcer, test yang bergantung pada modul contoh, kontrak yang bergeser) baru terlihat bila beberapa langkah dibaca bersama.

- **Review penutupan (wajib)** — langkah terakhir setiap plan yang punya lebih dari satu langkah, sebelum dokumen akhir dan rilis: semua langkah yang sudah di-commit dibaca ulang terhadap kode sekarang dengan daftar periksa di bawah. Hasilnya daftar temuan (fakta, file:line, usul perbaikan) → STOP; yang disetujui diperbaiki di langkah berikutnya, sisanya ke Backlog (`decisions.md` §3).
- **Checkpoint (ditentukan agent)** — saat menyusun plan, agent menandai 🔍 di tabel langkah: setelah langkah yang mengubah kontrak publik atau API inti, setiap 3–4 langkah, sebelum langkah yang bergantung pada beberapa langkah sebelumnya, dan setiap kali plan dipecah ulang. Di checkpoint: daftar periksa yang sama untuk langkah sejak checkpoint terakhir, laporan, STOP.

Daftar periksa:

1. **Keputusan** di plan ↔ implementasi (setiap ID).
2. **Dokumen** ↔ kode: `docs/standards/`, `ARCHITECTURE.md` §12 (setiap aturan baru punya enforcer), README, panduan di `docs/`, template skill — cari istilah yang sudah diganti (`git grep`).
3. **Gate**: `validate:full` (lint, depcruise, knip, `lint:setup`, `openapi:check`, coverage), `build`, `test:int`, `verify:scaffold`, `docs:build` (tautan), acceptance (`--combo a`) pada commit terakhir.
4. **Kontrak API**: `docs/api/` mencerminkan perubahan, label BREAKING yang tercatat dan disengaja.
5. **Proyek turunan**: `setup` default, `--keep-examples`, `--no-partner` — kode, test (termasuk `test:int`) dan dokumen inti tidak bergantung pada modul contoh atau partner.
6. **Keamanan**: jalur lain menuju hal yang sama (route lain, modul lain, seed, job) ikut dijaga, bukan hanya endpoint baru.
7. **Backlog dan temuan terbuka**: dicatat, tidak hilang di chat.

## Kerangka

```markdown
# Plan — <judul>

| Atribut | Nilai |
|---|---|
| Status | IN PROGRESS — <langkah yang sedang berjalan / berikutnya> |
| Tanggal | <YYYY-MM-DD> |
| Tujuan | <satu-dua kalimat: hasil yang diharapkan> |

## Lanjut dari sini

**Posisi repo**: branch, commit terakhir, apa yang belum di-commit / di-push.
**Sudah diputuskan — jangan tanya lagi**: <daftar singkat, dengan ID keputusan>.
**Berikutnya**: <langkah berikutnya dan aksi pertama yang mengubah sesuatu>.

## Keputusan

| ID | Keputusan | Opsi | Dipilih | Alasan |
|---|---|---|---|---|
| D42 | … | … | … | … |

## Langkah

| # | Langkah | 🔍 | Status | Commit |
|---|---|---|---|---|
| 1 | … |  | ⬜ |  |
| n | Review penutupan (`README.md` → *Review checkpoints*) | 🔍 | ⬜ |  |

Legenda: ⬜ belum · 🔄 dikerjakan · 👀 menunggu review · ✅ selesai · ⏸ ditunda

### Langkah 1 — <judul>

**Langkah**: <apa yang dikerjakan, file / area yang disentuh>.

**Selesai bila**:
- [ ] <perilaku yang dibuktikan test / gate>
- [ ] Gate (`quality-gates.md` §4) hijau; dokumen di `docs/standards/` diperbarui di perubahan yang sama

## Log

| Tanggal | Langkah | Catatan |
|---|---|---|
| <YYYY-MM-DD> | 1 | <apa, penyimpangan, verifikasi> |
```

## Template laporan langkah

Format laporan perubahan: `docs/standards/quality-gates.md` §4 (Change, Branch, Summary, Files, Verification, Chaos tests, Not verified, Suggested commit).
