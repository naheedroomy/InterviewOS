# electron/db/

## Responsibility

This folder owns all SQLite persistence for the Electron main process. It is the single
source of truth for the on-disk database (`natively.db` in Electron's `userData` directory)
and exposes a singleton `DatabaseManager` that every other persistence consumer talks to.

Responsibilities:
- Open/initialize the SQLite database via `better-sqlite3` with WAL journal mode.
- Load the `sqlite-vec` native extension for vector (embedding) search, with a JS
  cosine-similarity fallback when the extension is unavailable.
- Run a versioned, idempotent schema migration system driven by `PRAGMA user_version`.
- Provide typed CRUD for meetings, transcripts, AI interactions, embeddings, the user
  profile, modes/note sections, and a generic KV store.
- Expose the raw DB handle, DB path, and extension path so worker threads and other
  managers (e.g. `ProfileDatabaseManager`) can open their own connections.

## Design

### Singleton
`DatabaseManager` is a private-constructor singleton accessed via `getInstance()`. The
constructor resolves the DB path from `app.getPath('userData')`, calls `init()`, and runs
migrations. All callers share one connection in the main process.

### Migration system (`PRAGMA user_version`)
Migrations are sequential `if (version < N)` blocks, each advancing `user_version` exactly
once. New schema changes append a new block. Notable patterns:
- `CREATE TABLE IF NOT EXISTS` for fresh installs; guarded `ALTER TABLE ... ADD COLUMN`
  (wrapped in try/catch) for columns that may already exist on fresh installs.
- v10 uses an explicit `this.db.transaction()` for the rename-create-copy-drop pattern
  (SQLite can't `ADD CONSTRAINT`), with `INSERT OR IGNORE` to dedupe.
- v8/v9 provision per-dimension `vec0` virtual tables (`vec_chunks_<dim>`,
  `vec_summaries_<dim>`) for `KNOWN_DIMS = [768, 1536, 3072]`; v9 verifies each exists.
- v3/v4/migrateExistingEmbeddings copy legacy BLOB embeddings into `vec0` tables,
  nullifying rows whose dimension mismatches so they get re-embedded later.

### Vector search
- `sqlite-vec` extension path is rewritten from `app.asar` → `app.asar.unpacked` and the
  platform suffix (`.dylib/.so/.dll`) stripped before `loadExtension()`.
- `ensureVecTableForDim(dim)` lazily creates per-dimension `vec0` tables at runtime when a
  new embedding dimension is first seen, guarded against SQL injection and cached in
  `ensuredDims`.
- `hasVecExtension()` probes `vec_chunks_768` to report availability.

### Data model / schema
Core tables (v1): `meetings`, `transcripts`, `ai_interactions`, `chunks`,
`chunk_summaries`, `embedding_queue`, `user_profile`, `resume_nodes`.
Later additions: `app_state` (KV), `modes`, `mode_reference_files`, `mode_note_sections`,
`profile_custom_notes`, `profile_persona`, plus `vec_chunks_<dim>` / `vec_summaries_<dim>`
virtual tables. Child tables (`transcripts`, `ai_interactions`, `chunks`,
`chunk_summaries`) cascade-delete with `meetings`.

### Serialization conventions
- Meeting summary is stored as JSON in `meetings.summary_json` shaped as
  `{ legacySummary, detailedSummary }`; `detailedSummary` holds structured fields
  (overview, actionItems, keyPoints, sections, coachingInsights, etc.).
- AI interactions store `user_query`, `ai_response`, and a JSON `metadata_json`; array
  payloads (e.g. follow-up questions) are serialized into `metadata_json` and re-parsed
  into `items` on read.
- `duration_ms` is stored as an integer and formatted to `MM:SS` on read.
- `title_source` (`placeholder | auto | manual | calendar`) lets async post-call processing
  preserve a user's manually set title.

### Error handling
Public methods defensively return empty defaults (`[]`, `null`, `''`, `false`) and log via
`console.error` rather than throwing, except `addReferenceFile` which rethrows. Writes that
must be atomic use `this.db.transaction()`.

## Flow

1. **Startup**: `DatabaseManager` singleton constructed → `init()` opens DB, sets WAL,
   loads `sqlite-vec`, runs all pending migrations.
2. **Writes**: `saveMeeting()` runs a single transaction inserting/upserting the meeting
   row, all transcript segments, and all AI interactions. `updateMeetingTitle`,
   `updateMeetingSummary` (merge into `summary_json`), and the profile/mode/app_state
   setters write incrementally.
3. **Reads**: `getRecentMeetings()` (list view, no transcript/usage), `getMeetingDetails()`
   (full reconstruction incl. transcript + usage), `getUnprocessedMeetings()` (for async
   post-call processing).
4. **Deletes**: `deleteMeeting()` cascades children; `clearAllData()` clears all tables in
   one transaction.
5. **Embeddings**: `migrateExistingEmbeddings()` / `ensureVecTableForDim()` keep BLOB and
   `vec0` representations in sync; `embedding_queue` (UNIQUE on `meeting_id, chunk_id`)
   drives async embedding with `INSERT OR IGNORE` dedup.
6. **Seeding**: `seedDemoMeeting()` inserts a `demo-meeting` guide row only if absent
   (never flushes user data).

## Integration

- **Main process**: `DatabaseManager` is the persistence entry point for the Electron main
  process; other managers (e.g. `ProfileDatabaseManager`) obtain the raw handle via
  `getDb()`.
- **Worker threads**: `getDbPath()` and `getExtPath()` let worker threads open their own
  DB connection and load the same `sqlite-vec` extension.
- **IPC / renderer**: meeting/profile/mode data flows to the renderer through IPC handlers
  that call the `DatabaseManager` public API (list, details, save, update, delete).
- **Async post-call processing**: `getUnprocessedMeetings()` feeds the pipeline that
  generates summaries/embeddings; `title_source` guards against overwriting manual titles.
- **Vector consumers**: `vec_chunks_<dim>` / `vec_summaries_<dim>` are queried by the
  vector store for semantic search; `hasVecExtension()` selects native vs JS fallback.

### Files
- `DatabaseManager.ts` — the entire persistence layer (schema, migrations, CRUD, vector
  provisioning, seeding). Primary file.
- `seedDemo.ts` — placeholder script (requires Electron context; not wired up).
- `test-db.ts` — placeholder verification script (requires Electron context; not wired up).
