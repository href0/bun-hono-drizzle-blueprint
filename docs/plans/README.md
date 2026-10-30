# Plan kerja

Pekerjaan yang lebih besar dari satu perubahan mengikuti sebuah plan di folder ini (aturan agent: `.agents/AGENTS.md` → *Work Plans*). Satu file per pekerjaan: `docs/plans/<YYYY-MM-DD>-<topik>-plan.md`. Plan bersifat **sementara**: setelah selesai, setiap keputusannya pindah ke [`docs/decisions.md`](../decisions.md) (satu baris), yang ditunda ke Backlog di sana, lalu file plan dihapus — riwayat langkahnya tetap ada di git.

## Cara memakai

1. Salin kerangka di bawah, isi tujuan dan keputusan; minta persetujuan user sebelum langkah pertama.
2. Kerjakan **satu langkah** sekali jalan: branch `<type>/<slug>`, penuhi "Selesai bila", jalankan gate (`docs/standards/quality-gates.md` §4), laporkan dengan template laporan, lalu STOP untuk review. Commit / merge hanya atas permintaan user.
3. Setiap langkah: perbarui tabel progres dan tambahkan baris log (apa yang dikerjakan, penyimpangan, verifikasi, commit). Blok **Lanjut dari sini** selalu menggambarkan posisi terkini (skill `handoff` / `pickup` membacanya).
4. Keputusan baru diberi ID berikutnya: `D…` di boilerplate, `PD…` di proyek yang dibuat darinya (lihat `decisions.md`). Kode dan dokumen boleh merujuk ID itu sejak langkah pertama — ID-nya tetap valid setelah plan dihapus.
5. Plan selesai → keputusan ke `decisions.md` §1 (atau §4 di proyek), item tertunda ke §3, hapus file plan di commit terakhir pekerjaan itu.

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

| # | Langkah | Status | Commit |
|---|---|---|---|
| 1 | … | ⬜ |  |

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
