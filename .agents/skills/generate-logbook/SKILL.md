---
name: generate-logbook
description: Generate a monthly work logbook table (No, Tanggal, Aktivitas, Jam Mulai, Jam Selesai, Durasi, Status) from the current git user's commits. Use when asked for a logbook.
---

# Generate Logbook

Generate logbook entries based on git commit history for the **current git user only** (`git config user.name`). Output is a formatted table matching the daily work logbook, grouped by working day.

---

## Steps

### 1. Identify Git User

Run:
```bash
git config user.name
git config user.email
```

Store `AUTHOR_NAME` as the result. All subsequent git log queries MUST filter by this author.

---

### 2. Determine Date Range

Ask the user which **month and year** to generate the logbook for, unless already specified.

The logbook uses the user's local working time zone: **WIB (`+07:00`) by default** — ask once if the user works in another zone (WITA `+08:00`, WIT `+09:00`, …) and use its offset below instead.

Format target range as:
- `TARGET_START`: first day of target month in that zone (e.g. `2026-09-01`)
- `TARGET_END`: last day of target month in that zone (e.g. `2026-09-30`)

Compute ISO 8601 timestamps with the **explicit offset** (WIB shown):
- `AFTER_TS` = `<TARGET_START minus 1 day>T23:59:59+07:00`
- `BEFORE_TS` = `<TARGET_END>T23:59:59+07:00`

---

### 3. Extract Commits

Run:
```bash
git log --author="<AUTHOR_NAME>" --after="<AFTER_TS>" --before="<BEFORE_TS>" --date=iso-strict-local --pretty=format:"%H|%ad|%s" --reverse
```

Parse each line into:
- Hash
- Timestamp (local, in the chosen zone)
- Subject / Commit Message

---

### 4. Synthesize Activities

For each working day with commits:
- Translate commit subjects into semi-technical, professional activity descriptions (bahasa Indonesia semi-teknis yang komunikatif).
- Assign working hours (e.g. 08:00 - 17:00 with realistic task distribution).
- Mark status as "Selesai".

#### Output Table Format:
| No | Tanggal | Aktivitas | Jam Mulai | Jam Selesai | Durasi | Status |
|---|---|---|---|---|---|---|
| 1 | 2026-09-24 | Implementasi automated test coverage gate >= 95% dan audit dependency | 08:30 | 12:00 | 3.5 jam | Selesai |
| 2 | 2026-09-24 | Refactoring layer controller dan penyesuaian rule agent workspace | 13:00 | 17:00 | 4 jam | Selesai |
