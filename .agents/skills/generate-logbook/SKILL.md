---
name: generate-logbook
description: Generate logbook text entries for a given date range based on git commits authored by the configured git user. Output is formatted as a table matching the project's work logbook format (No, Tanggal, Aktivitas, Jam Mulai, Jam Selesai, Durasi, Status).
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

Format target range as:
- `TARGET_START`: first day of target month in WIB (e.g. `2026-09-01`)
- `TARGET_END`: last day of target month in WIB (e.g. `2026-09-30`)

Compute ISO 8601 timestamps with **explicit WIB offset (`+07:00`)**:
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
- Timestamp (Local WIB)
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
