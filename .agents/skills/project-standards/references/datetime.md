# Date & Time Standard — Implementation Guide

Read this file when: a field, column or query involves a date, a time, a duration or a time zone.

---

## 1. Three kinds of time — never mixed

| Kind | Field name | TypeScript | Column | Wire format |
|---|---|---|---|---|
| Instant (an exact moment) | `*_at` | `Temporal.Instant` | `timestamptz` | ISO 8601 UTC, always milliseconds: `2026-10-05T03:00:00.000Z`; requests **must** carry an offset |
| Calendar date (a day, no zone) | `*_date` | `Temporal.PlainDate` | `date` | `YYYY-MM-DD` |
| Local schedule | instant + `*_timezone` | `Temporal.Instant` + IANA name | `timestamptz` + `text` | instant + zone such as `Asia/Jakarta` |

A birthday or a due day is a calendar date — storing it as an instant shifts it by a day for half the world. A meeting "at 09:00 Jakarta time" is an instant plus the zone it was planned in.

---

## 2. The one conversion module: `src/utils/datetime.util.ts`

| Function | Use |
|---|---|
| `nowInstant()` / `nowIsoUtc()` | Current moment (application clock) as an instant / as `…Z` text (envelope `timestamp`, health). Columns set by the server use the database clock instead (`NOW`, [database.md](database.md)) |
| `parseInstant(text)` | ISO 8601 with offset → instant; no offset → `DateTimeError('MISSING_OFFSET')` |
| `parseCalendarDate(text)` | Exactly `YYYY-MM-DD` → `PlainDate`; rejects `2026-02-30` |
| `isValidTimeZone(zone)` | IANA names only; `+07:00` is not a zone |
| `dayRangeInZone(date, zone)` | `[start, end)` instants of a day in a zone — query with `>= start AND < end`; DST-correct (23/25-hour days) |
| `wallTimeToInstant(date, 'HH:mm', zone)` | Wall-clock time → instant; times skipped or repeated by DST are **rejected**, never guessed |
| `instantFromDate(date)` / `instantToDate(instant)` | Boundary with libraries that only speak `Date`. Not needed for columns: the column helpers read and write `timestamptz` / `date` as text |
| `toIsoUtc(instant)` | `…T03:00:00.000Z` (same shape as `Date#toISOString`) |
| `formatWallClock(instant, zone)` | Display only: `2026-10-05 10:00:00.123 +07:00` (offset always printed) |
| `toWireTime(value)` | The API wire form, applied by `ApiResponse` to every response body: instants → `toIsoUtc`, calendar dates → `YYYY-MM-DD` (walks arrays and plain objects) |

Errors are `DateTimeError` with a `reason` (`INVALID_INSTANT`, `MISSING_OFFSET`, `INVALID_DATE`, `INVALID_TIME`, `INVALID_TIME_ZONE`, `NONEXISTENT_LOCAL_TIME`, `AMBIGUOUS_LOCAL_TIME`) — services map them to a `BadRequestError` with a localized message when they come from user input.

---

## 3. Request fields: `src/core/dto/datetime.dto.ts`

```typescript
import { calendarDateField, instantField, timeZoneField } from '../../core/dto/datetime.dto';

export const createMeetingSchema = z.object({
  startsAt: instantField, // "2026-10-05T09:00:00+07:00" → Temporal.Instant
  dueDate: calendarDateField.optional(), // "2026-10-05" → Temporal.PlainDate
  timezone: timeZoneField, // "Asia/Jakarta"
});
```

- Invalid values become 400 `ERR_INVALID_INPUT` with a format message (the submitted value is never echoed).
- They are documented in OpenAPI as `string` with `format: date-time` / `date` automatically.

---

## 4. Responses

- `ApiResponse.toJSON()` writes time values through `toWireTime()`: every instant leaves as `…T03:00:00.000Z` — the database keeps microseconds, `toJSON()` alone would print `…00Z`, `…00.123Z` or `…00.123456Z` depending on the value. `camelToSnakeCase()` keeps class instances intact (it used to turn them into `{}`).
- Values read back from the cache are plain JSON: a cached `Temporal.Instant` is a string. Revive them on a hit (`getOrSet(…, { revive })`, see [redis-cache.md](redis-cache.md)) so cached and fresh values look the same on the wire.
- Columns built with `instant()` / `timestamps()` / `calendarDate()` (`src/database/schema/columns.ts`) give entities `Temporal.Instant` / `Temporal.PlainDate` values — no `Date` reaches services or responses. Document them with `isoInstant()` / `isoCalendarDate()` (see [openapi.md](openapi.md)).

---

## 5. UTC everywhere

- **Runtime**: `src/config/env-source.ts` sets `process.env.TZ = 'UTC'` at startup; `Dockerfile` and the compose files set `TZ=UTC`; the test preload does too. Local-time behaviour of `Date` is therefore identical on every machine.
- **Database session**: `connection: { timezone: 'UTC' }` in `src/database/connection.ts` — server-side `now()`, `date_trunc` and text casts of `timestamptz` never depend on the server's zone.
- Never derive a calendar date from an instant without saying in which zone (`instant.toZonedDateTimeISO(zone).toPlainDate()`).
- **One display-only exception**: `hostTimeZone` (`src/config/env-source.ts`) is the machine's own zone, read before the switch to UTC. Only the development log timestamp uses it (`formatWallClock()`), so a developer sees their local time wherever they are; servers log ISO 8601 UTC. Never use it for business logic.

---

## 6. Enforcement (ESLint `DATETIME_SYNTAX_RULES`, everywhere in `src/` except `datetime.util.ts`)

- `new Date(...)`, **including `new Date()` for "now"**, and `Temporal.Now` — one way to obtain time values: `nowInstant()` / `nowIsoUtc()`, `parseInstant()` / `parseCalendarDate()` for text, `instantFromDate()` / `instantToDate()` for libraries that speak `Date`.
- `Date.parse` — guesses the zone of strings without an offset.
- Local getters/setters/formatters: `getHours`, `getDate`, `getMonth`, `getFullYear`, `getTimezoneOffset`, `setHours`, …, `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `toDateString`, `toTimeString`. UTC variants (`getUTCHours`, `toISOString`) are fine. Format numbers with `Intl.NumberFormat`.

Tests may build fixture dates freely.
