# Plan — RBAC: penetapan permission dan role secara bulk (checklist)

| Atribut | Nilai |
|---|---|
| Status | IN PROGRESS — langkah 6 + checkpoint menunggu review; acceptance dijalankan setelah commit |
| Tanggal | 2026-11-08 |
| Tujuan | Frontend bisa menampilkan checklist permission / role untuk satu role atau satu user, lalu menyimpannya dalam **satu request atomik**, tanpa mengirim N request per item. Endpoint per item yang ada tetap berlaku (perubahan aditif, rilis MINOR `v2.1.0`). |

## Lanjut dari sini

**Posisi repo**: branch `feat/rbac-bulk-assignment`; langkah 1–5 di-commit (`2bc904e`, `e5adb62`, `bea6372`, `9f093c2`, `f366f69`); langkah 6 di working tree, belum di-commit. Kontrak API tidak berubah di langkah 6.
**Sudah diputuskan — jangan tanya lagi** (2026-11-08): D72–D76 di bawah. Dikerjakan sebelum plan `feature:enable`.
**Berikutnya**: review langkah 6 + checkpoint → commit oleh user → agent menjalankan `bun run env dev acceptance --combo a` pada commit itu (~6 menit, database lokal) → langkah 7 (review penutupan).

## Konteks

Saat ini (v2.0.0, D68) semua penulisan RBAC per item: `PUT` / `DELETE /roles/:id/permissions/:childId`, `/users/:id/roles/:childId`, `/users/:id/permissions/:childId`. Layar checklist harus menghitung beda sendiri dan mengirim N request: tidak atomik (request ke-7 gagal → setengah tersimpan), N transaksi dan N invalidasi cache. Katalog `GET /permissions` dipaginasi (`per_page` ≤ 100), jadi checklist lebih dari 100 permission butuh beberapa halaman. Mencabut (per item) belum dicek escalation (`src/modules/rbac/rbac.service.ts` `unmapPermission`, `revokeRole` untuk role selain `super_admin`, `revokePermission`).

## Keputusan

| ID | Keputusan | Opsi | Dipilih | Alasan |
|---|---|---|---|---|
| D72 | Penyimpanan checklist = **replace** per relasi: `PUT /roles/:id/permissions` `{ permission_ids }`, `PUT /users/:id/roles` `{ role_ids }`, `PUT /users/:id/permissions` `{ grants: [{ permission_id, expires_at?, note? }] }`. Body = keadaan akhir; yang tidak dikirim dicabut. Server membandingkan dengan baris hidup dan **hanya menyentuh yang berubah** (insert yang baru, soft delete yang hilang, update `expires_at` / `note` grant), dalam satu transaksi; `unchanged` tidak disentuh. Field wajib ada (`{}` → 400), `[]` = cabut semua, ID duplikat / tidak dikenal / retired → 400 dengan index. Respons 200 `{ added, removed, unchanged }` (+ `updated` untuk grant), tiap item `{ id, key }`. Invalidasi cache sekali setelah commit, hanya bila ada perubahan (R88). Endpoint per item tetap | replace / delta `{ add, remove }` / per item paralel | replace | Cocok dengan checklist yang menampilkan semua dan disimpan sekali; atomik dan idempoten; audit per baris tetap bermakna |
| D73 | `GET /permissions/options`: semua permission hidup dan tidak retired, **tanpa paginasi**, dikelompokkan per `group` (urut group, lalu key), tiap item `{ id, key, label, source, grantable }` — `grantable` = pemanggil memegangnya (super admin: semua). `GET /permissions` tetap dipaginasi (layar manajemen dengan filter dan endpoint) | tanpa paginasi / naikkan `per_page` | endpoint baru tanpa paginasi | Jumlah permission tumbuh per modul, bukan per transaksi; paginasi seragam D41 / R85 tetap tanpa pengecualian; FE bisa menonaktifkan kotak yang pasti ditolak |
| D74 | **Escalation juga saat mencabut**: siapa pun yang mencabut permission dari role, mencabut role dari user, atau mencabut grant user harus memegang setiap permission yang terlibat (perluasan D69) — berlaku di endpoint replace **dan** `DELETE` per item. 403 `ERR_PERMISSION_ESCALATION_FORBIDDEN` dengan `details` berisi key yang ditolak. Aturan `super_admin` (hanya super admin, tidak dari diri sendiri, bukan super admin terakhir) tidak berubah | hanya replace / replace + per item / tidak sama sekali | replace + per item | Admin terbatas tidak bisa menghapus akses yang tidak bisa ia kembalikan; satu aturan di dua jalur — jalur per item tidak menjadi celah |
| D75 | Guard route replace (R89): `PUT /roles/:id/permissions` → `roles.update` (sama dengan per item); `PUT /users/:id/roles` → permission baru **`user-roles.update`**; `PUT /users/:id/permissions` → permission baru **`user-permissions.update`**; `GET /permissions/options` → `permissions.read`. Permission `.update` bisa dipetakan ke role mana pun oleh yang memegangnya (D69); super admin memegangnya otomatis; proyek turunan memetakannya ke role admin-nya setelah upgrade (CHANGELOG). *Revisi 2026-11-08 (langkah 4)*: semula `create` **dan** `delete` (dua guard) — ditolak karena `x-allowed-callers` berisi alternatif (`openapi.md`), sehingga dua guard terdokumentasi sebagai "salah satu" dan `permissionEndpointsOf` mencantumkan route itu di bawah `create` | `create` + `delete` / permission `.update` / guard "semua dari" di core / `create` + cek `delete` di service | permission `.update` | Kontrak dan daftar endpoint per permission tetap akurat tanpa mengubah core; sama dengan pola role (`roles.update` menjaga tambah, cabut dan replace); "ganti seluruh set" memang setara memberi + mencabut |
| D76 | Dua admin menyimpan role yang sama bersamaan → yang terakhir menang (tanpa optimistic lock); optimistic lock (`If-Match` / versi) masuk Backlog | last write wins / optimistic lock | last write wins | Layar admin RBAC jarang diedit bersamaan; unique index baris hidup tetap mencegah duplikat |

## Catatan untuk CHANGELOG `v2.1.0`

Ditulis saat rilis (skill `update-version`), bagian untuk proyek turunan:

- **Added**: `GET /permissions/options`; `PUT /roles/:id/permissions`, `PUT /users/:id/roles`, `PUT /users/:id/permissions` (replace, D72); 403 escalation membawa `details` per key.
- **Changed (perilaku)**: mencabut permission dari role, role dari user, atau grant dari user kini butuh permission yang dicabut (D74) — admin terbatas yang sebelumnya bisa mencabut kini bisa mendapat 403.
- **Upgrade**: permission baru `user-roles.update` dan `user-permissions.update` (D75) ditambahkan oleh registry sync saat migrate; hanya `super_admin` yang otomatis memegangnya — petakan ke role admin proyek yang memakai layar checklist.

## Langkah

| # | Langkah | 🔍 | Status | Commit |
|---|---|---|---|---|
| 1 | Katalog `GET /permissions/options` (D73, D75) |  | ✅ | `2bc904e` |
| 2 | Escalation saat mencabut di endpoint `DELETE` per item (D74) |  | ✅ | `e5adb62` |
| 3 | Mekanisme replace + `PUT /roles/:id/permissions` (D72, D74, D75) | 🔍 | ✅ | `bea6372` |
| 4 | `PUT /users/:id/roles` (D72, D74, D75; aturan `super_admin`) |  | ✅ | `9f093c2` |
| 5 | `PUT /users/:id/permissions` dengan `expires_at` / `note` (D72, D74, D75) |  | ✅ | `f366f69` |
| 6 | Dokumen dan acceptance: `docs/standards/auth-and-inbound.md`, langkah HTTP acceptance bila perlu, kontrak API (`openapi:update` oleh user) | 🔍 | 👀 |  |
| 7 | Review penutupan (`README.md` → *Review checkpoints*) | 🔍 | ⬜ |  |
| 8 | Tutup plan: keputusan ke `docs/decisions.md` §1, D76 optimistic lock ke §3, hapus file plan |  | ⬜ |  |

Legenda: ⬜ belum · 🔄 dikerjakan · 👀 menunggu review · ✅ selesai · ⏸ ditunda

Checkpoint: setelah langkah 3 (pola kontrak replace pertama ditetapkan, langkah 4–5 menirunya), setelah langkah 6 (semua kontrak dan dokumen), dan review penutupan. Rilis `v2.1.0` mengikuti alur rilis biasa (`git-workflow.md` §1.1) setelah plan ditutup.

### Langkah 1 — Katalog `GET /permissions/options`

**Langkah**: DTO respons (group → permissions), query repository (hidup, tidak retired, urut `group`, `key`), service menghitung `grantable` dari permission efektif pemanggil (`rbacService.getEffectivePermissions`; super admin → semua `true`), route di `rbac-permissions.routes.ts` dengan `requirePermission(PERMISSION_PERMISSIONS.read)` dan `describeEndpoint`, didaftarkan **sebelum** `/:id`.

**Selesai bila**:
- [x] Test service / transformer: urutan, pengelompokan, `grantable` untuk admin biasa dan super admin (retired / soft-deleted disaring oleh `findCounting` yang sudah ada dan teruji di `test:int`)
- [x] Test e2e: 200 dengan bentuk envelope, 403 tanpa `permissions.read` (R89), tanpa `meta` / paginasi
- [x] Gate (`quality-gates.md` §4) hijau kecuali `openapi:check` (endpoint baru, safe — menunggu `openapi:update` oleh user)

### Langkah 2 — Escalation saat mencabut (per item)

**Langkah**: `unmapPermission`, `revokeRole` (role selain `super_admin`: semua permission role yang tidak retired), `revokePermission` memanggil `requireActorHolds` seperti jalur memberi. 403 membawa `details` key yang ditolak (juga di jalur memberi, agar seragam). Route `DELETE` menambahkan 403 escalation di `errors`.

**Selesai bila**:
- [x] Test: admin tanpa permission X ditolak 403 saat mencabut X dari role / grant, dan saat mencabut role yang membawa X; pemegang X lolos; permission yang tidak lagi berlaku (retired / dihapus) dicabut tanpa cek; tanpa user login tidak dicek (test `requireActorHolds` yang sudah ada)
- [x] `details` escalation berisi key (`field` = key, verbatim), diuji di guard (dipakai jalur memberi dan mencabut) dan di wire (e2e)
- [x] Chaos: hapus pemanggilan cek di salah satu jalur cabut → test gagal
- [x] Gate hijau kecuali `openapi:check` (0 BREAKING, 2 safe, 3 docs — menunggu `openapi:update` oleh user); `test:int rbac` 29 pass

### Langkah 3 — Mekanisme replace + `PUT /roles/:id/permissions` 🔍

**Langkah**: helper beda murni (keadaan sekarang vs body → added / removed / unchanged) yang dipakai ketiga endpoint; DTO `{ permission_ids }` (wajib, unik, UUID, maks wajar); service dalam `@Transactional()`: role bisa dipetakan (bukan `super_admin` → 409), semua ID dikenal dan tidak retired (400 dengan index), escalation pada added ∪ removed (D74), insert / soft delete hanya yang berubah, `forget` pemegang role sekali bila ada perubahan; route + `describeEndpoint` (deskripsi menyebut semantik replace).

**Selesai bila**:
- [x] Test helper beda: kosong, sama, tambah saja, cabut saja, campuran, urutan input tidak berpengaruh
- [x] Test service: tidak ada tulis untuk `unchanged`, body sama → tanpa tulis dan tanpa invalidasi, `[]` mencabut semua, satu item ditolak → tidak ada tulis (semua cek sebelum tulis pertama), `super_admin` → 409, race → 409; `test:int`: baris `unchanged` sama `id` dan tanpa entri audit baru, mapping permission yang dihapus tetap
- [x] Test e2e: 200 dengan ringkasan urut key, 400 `{}` / bukan UUID / duplikat (`permission_ids.1`), 403 guard (R89); 403 escalation dan 400 tidak dikenal di test service
- [x] Chaos: hapus-semua-lalu-insert → test service dan `test:int` gagal
- [x] Gate hijau kecuali `openapi:check` (1 safe), lalu **checkpoint** → STOP

### Langkah 4 — `PUT /users/:id/roles`

**Langkah**: DTO `{ role_ids }`; memakai helper beda; per role yang ditambah / dicabut: aturan memberi dan mencabut yang ada (`super_admin` hanya oleh super admin, tidak mencabut dari diri sendiri, super admin terakhir → 409 dengan kunci baris pemegang lain seperti `revokeRole`), escalation D74; `forget([userId])` sekali.

**Selesai bila**:
- [x] Test service: setiap aturan `super_admin` lewat replace (tambah, cabut diri sendiri, terakhir), escalation tambah dan cabut (satu 403 menyebut semua key), tidak ada tulis bila satu ditolak, tanpa perubahan → tanpa tulis; `test:int`: assignment yang tetap sama `id`, assignment role yang dihapus tetap
- [x] Test e2e: 200 ringkasan; 403 dengan `user-roles.create` + `.delete` tanpa `.update` (D75 revisi)
- [x] Gate hijau kecuali `openapi:check` (1 safe)

### Langkah 5 — `PUT /users/:id/permissions`

**Langkah**: permission `user-permissions.update` di registry (D75; ditambah di langkah ini, bukan langkah 4: R89 menolak permission registry yang belum menjaga route); DTO `{ grants: [{ permission_id, expires_at?, note? }] }` (`expires_at` di masa depan, seperti `putGrantSchema`); helper beda + kelompok `updated` bila `expires_at` / `note` berubah; escalation D74 pada added ∪ removed ∪ updated; `forget([userId])` sekali.

**Selesai bila**:
- [x] Test service: added / updated / removed / unchanged, grant kedaluwarsa yang dikirim balik apa adanya = unchanged, grant tanpa `note` kehilangan note-nya (= updated), tidak ada tulis bila satu ditolak (400 permission / `expires_at`, 403 escalation); `test:int`: baris yang tetap sama `id`, `expires_at` mikrodetik yang dikirim balik dalam milidetik tetap unchanged
- [x] Test e2e: 200 ringkasan, 400 `{}` / `expires_at` tidak valid / duplikat (`grants.1.permission_id`), 403 dengan `create` + `delete` tanpa `user-permissions.update`
- [x] Gate hijau kecuali `openapi:check` (1 safe)

### Langkah 6 — Dokumen, acceptance, kontrak 🔍

**Langkah**: bagian RBAC di `docs/standards/auth-and-inbound.md` (checklist: katalog + replace, D72–D76); langkah HTTP acceptance (`scripts/lib/acceptance.ts` stage C) memanggil satu replace bila belum ada cakupan RBAC di sana — dengan `manual-acceptance.md` sinkron (R81); user menjalankan `bun run openapi:update` untuk `docs/api/`.

**Selesai bila**:
- [x] Dokumen menyebut semantik replace, `[]`, `grantable`, escalation saat mencabut (`auth-and-inbound.md` sejak langkah 3–5; kini juga `docs/auth-guide.md` untuk FE, `README.md`, `structure.md`)
- [ ] `test:docs-sync` hijau ✅; acceptance `--combo a` pada commit langkah ini — **menunggu commit** (acceptance menguji HEAD)
- [x] Checkpoint (daftar periksa untuk langkah 4–6) → STOP

### Langkah 7 — Review penutupan 🔍

Daftar periksa `README.md` → *Review checkpoints* untuk langkah 1–6, termasuk butir 6 (jalur lain ke hal yang sama: seed, `seed:admin`, `users` yang memberi role default) → daftar temuan → STOP.

### Langkah 8 — Tutup plan

D72–D76 ke `docs/decisions.md` §1 (D76 dengan optimistic lock sebagai item §3), item terbuka ke §3, hapus file plan, tanpa rujukan tersisa (`git grep rbac-bulk-assignment`).

## Log

| Tanggal | Langkah | Catatan |
|---|---|---|
| 2026-11-08 | — | Plan dibuat setelah diskusi: replace (bukan delta), katalog tanpa paginasi + `grantable`, escalation saat mencabut juga di per item, sebelum `feature:enable`. |
| 2026-11-08 | 1 | `GET /permissions/options`: `actorCanGive()` di `rbac-grant-guard.util.ts` (jawaban yang sama dengan `requireActorHolds`), service memakai `findCounting()` yang sudah ada (tanpa query baru), transformer mengelompokkan per group lalu key, route sebelum `/:id`. Chaos: `grantable` selalu true → test service + e2e gagal; route setelah `/:id` → e2e 400. Gate: typecheck, lint, format, arch, deps, setup, branch, `test:cov` (1387 pass, line 99.77%), build hijau; `openapi:check` 1 safe (operation added). Baris backlog playground RBAC (opsi C, hanya env dev) dan RBAC arah reverse (baca dulu; bulk tulis reverse hanya sebagai delta) ditambahkan ke `docs/decisions.md` §3. |
| 2026-11-08 | 1 | Di-commit oleh user sebagai `2bc904e` (dengan `docs/api/` dari `openapi:update`). |
| 2026-11-08 | 2 | `unmapPermission`, `revokePermission`: cek escalation bila permission masih berlaku (`findGrantableById`; retired / dihapus tidak memberi apa-apa, jadi tanpa cek — kalau dicek, hanya super admin yang bisa mencabutnya). `revokeRole` (role selain `super_admin`): semua permission role yang berlaku, lewat helper `countingKeysOf` yang kini juga dipakai `assignRole`. 403 escalation membawa `details` per key yang kurang (`field` = key, `verbatimField`); pesan `PERMISSION_ESCALATION` dan arti di `error-catalog.ts` kini "memberikan atau mencabut"; pesan detail baru `PERMISSION_NOT_HELD`. Route: deskripsi + 403 escalation di `DELETE /roles/:id/permissions/:childId` dan `DELETE /users/:id/permissions/:childId`; deskripsi `DELETE /users/:id/roles/:childId`. Chaos: tiap jalur cabut tanpa cek → test service gagal; tanpa `details` → test guard, service dan e2e gagal. Gate: `test:cov` 1391 pass (line 99.77%), build, `test:int rbac` 29 pass (lewat `bun run env dev`: env file test tidak ada di mesin ini). |
| 2026-11-08 | 2 | Di-commit atas permintaan user sebagai `e5adb62` (dengan `docs/api/` dari `openapi:update` user). |
| 2026-11-08 | 3 | `rbac-replace.util.ts` (`diffIds`, murni) dan `rbac-replace.dto.ts` (`idSetField`: UUID, unik — duplikat 400 dengan index, maks `REPLACE_MAX_ITEMS` = 1000; `accessChangeSchema`). Repository: `findMappingsOf(roleId)` (mapping hidup + permission hidup, retired ikut, yang dihapus tidak — mapping-nya menunggu restore) dan `findGrantableByIds`. `RbacService.replaceRolePermissions`: semua cek sebelum tulis pertama (role bisa dipetakan, yang ditambah bisa diberikan → 400 `permission_ids.<index>`, escalation satu kali atas added ∪ removed yang masih berlaku, dengan `details` semua key yang kurang), lalu insert / soft delete hanya yang berubah, `forget` sekali bila ada perubahan. Route `PUT /roles/:id/permissions` (`roles.update`). Chaos: hapus-semua-lalu-insert → service + `test:int` gagal; cabut tanpa cek → gagal; retired ikut dicek → gagal; cache selalu dibuang → gagal; duplikat lolos → e2e gagal. Gate: `test:cov` 1402 pass (line 99.71%; coverage per file sempat gagal untuk dua query baru → test bentuk SQL ditambah), build, lint, `test:int rbac` 30 pass. |
| 2026-11-08 | 🔍 1–3 | Checkpoint. (1) Keputusan ↔ kode: D72–D75 sesuai untuk langkah 1–3. (2) Dokumen: `docs/standards/auth-and-inbound.md` (baris RBAC) dan `docs/auth-guide.md` (baris 403 escalation) belum menyebut escalation saat mencabut (seharusnya ikut di langkah 2), `details`, katalog dan replace → **diperbaiki di langkah ini**. (3) Gate di atas. (4) Kontrak: aditif, menunggu `openapi:update`. (5) Proyek turunan: modul `rbac` inti; test memakai permission `users` / `roles`, tidak bergantung modul contoh. (6) Jalur lain: `seed-admin` menulis `user_roles` sebagai system; role default `user` (D59) dipegang semua pengguna termasuk sign-up, memetakan permission ke role itu tetap dicek — bukan celah. (7) Backlog: playground dan RBAC arah reverse sudah di `decisions.md` §3. |
| 2026-11-08 | 3 | Di-commit oleh user sebagai `bea6372` (dengan `docs/api/`). |
| 2026-11-08 | 4 | `PUT /users/:id/roles`: `findAssignmentsOf(userId)` (assignment hidup + role hidup; assignment role yang dihapus menunggu restore), `findLiveByIds` di repository role; `RbacService.replaceUserRoles` dengan semua cek sebelum tulis (user hidup, role dikenal → 400 `role_ids.<index>`, `super_admin` hanya oleh super admin, escalation sekali atas semua permission role yang ditambah / dicabut, cabut `super_admin` lewat helper `requireSuperAdminRevocable` yang kini juga dipakai `revokeRole`); helper `refuseUnknown` dipakai bersama `requireGrantableAll`. **Penyimpangan / revisi D75**: dua guard `create` + `delete` terdokumentasi sebagai alternatif di `x-allowed-callers` → user memilih permission baru `user-roles.update` (dicek dengan skrip `buildContract`: route kini `["permission:user-roles.update"]`). `user-permissions.update` sempat ditambah juga, R89 menolaknya (belum menjaga route) → dipindah ke langkah 5. Dokumen: baris "What a user holds" di `auth-and-inbound.md`. Chaos: guard kembali ke `create` + `delete` → e2e gagal; role yang dicabut tidak dicek → service gagal; cabut `super_admin` tanpa aturan → service gagal; hapus-semua-lalu-insert → `test:int` gagal. Gate: `bun test` 1409 pass, `test:cov` (line 99.72%), build, `test:int rbac` 31 pass. |
| 2026-11-08 | 4 | Di-commit oleh user sebagai `9f093c2` (dengan `docs/api/`). |
| 2026-11-08 | 5 | `PUT /users/:id/permissions` (`user-permissions.update`, D75): `grantItemSchema` = `putGrantSchema` + `permissionId`, duplikat 400 di `grants.<i>.permission_id` (helper `refuseRepeats` dipakai bersama `idSetField`); `RbacService.replaceUserGrants`: grant yang tetap dibandingkan `expires_at` + `note` (absen = tidak ada) → `updated` bila berbeda; semua cek sebelum tulis (user hidup, yang diberikan / diubah bisa diberikan → 400 `grants.<i>.permission_id`, `expires_at` di masa depan hanya untuk yang diberikan / diubah → 400 `grants.<i>.expires_at`, escalation sekali atas yang diberikan, diubah dan dicabut yang masih berlaku); respons + `updated`. **Temuan saat menguji**: API mengirim instant dalam milidetik (`toIsoUtc`), PostgreSQL menyimpan mikrodetik → grant kedaluwarsa yang dikirim balik dari GET akan dianggap berubah dan ditolak 400; perbandingan kini per milidetik (dibuktikan `test:int`). Query tidak ada yang baru (`findGrantsOf` sudah ada). Dokumen: baris "What a user holds" di `auth-and-inbound.md`. Chaos: perbandingan eksak → `test:int` gagal; grant yang diubah tidak dicek escalation → service gagal; `expires_at` dicek juga pada yang tidak berubah → service gagal; guard `create` → e2e gagal. Gate: `bun test` 1414 pass, `test:int rbac` 32 pass. |
| 2026-11-08 | 5 | Di-commit oleh user sebagai `f366f69` (dengan `docs/api/`). |
| 2026-11-08 | 6 | Acceptance stage C: langkah RBAC kini memakai jalur checklist — `GET /permissions/options` (`users.read` grantable), `PUT /roles/:id/permissions` (`added` berisi `users.read`), `GET /users/:id/roles` lalu `PUT /users/:id/roles` dengan role yang dipegang + role baru (tidak ada yang `removed`; role bawaan `user` tetap). Judul langkah berubah → `manual-acceptance.md` §3 disinkronkan (R81 menangkapnya lebih dulu). Fake machine di `acceptance.test.ts` hanya memberi role bila role bawaan ikut dikirim. Chaos: langkah mengirim role baru saja → ketiga combo di test runner gagal. Dokumen: bagian checklist di `docs/auth-guide.md` (FE), `README.md`, `structure.md` (`rbac-replace.*`). |
| 2026-11-08 | 🔍 4–6 | Checkpoint. (1) Keputusan ↔ kode: D72 di tiga endpoint, D73, D74 (per item + tiga replace), D75 (revisi: `.update`), D76 (tanpa lock — tidak ada kode). (2) Dokumen ↔ kode: `auth-and-inbound.md`, `auth-guide.md`, `README.md`, `structure.md`, `manual-acceptance.md` sesuai; tidak ada rule baru, `ARCHITECTURE.md` §12 tidak berubah. (3) Gate: `validate:full` (1414 pass, line 99.72%), `build`, `test:int` penuh 65 pass, `docs:build` (42 halaman, tanpa tautan rusak), `verify:scaffold` lulus; acceptance menunggu commit. (4) Kontrak: semua perubahan safe / docs, sudah di `docs/api/` per langkah. (5) Proyek turunan: modul `rbac` inti, test tidak bergantung modul contoh; `verify:scaffold` lulus. (6) Jalur lain: role bawaan `user` (D59) — replace mencabutnya bila FE tidak mengirimnya kembali; ditulis di `auth-guide.md` dan dibuktikan langkah acceptance. (7) Backlog: optimistic lock (D76) ke §3 saat penutupan; catatan CHANGELOG `v2.1.0` di plan ini. |
