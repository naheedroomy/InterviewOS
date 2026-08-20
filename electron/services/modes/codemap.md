# electron/services/modes/

## Responsibility

This folder owns the **retrieval layer for custom-mode reference files** — the
mechanism that turns a user's active-mode context documents into grounded,
query-relevant snippets fed to the AI during an interview.

The folder currently contains a single module, `ModeHybridRetriever.ts`, which
performs **hybrid retrieval** (lexical FTS/BM25 + vector semantic search) over
mode reference files, with graceful degradation to lexical-only when the
embedding provider is unavailable.

Note on scope: the broader custom-mode **lifecycle** (create/edit/delete modes,
persisting reference files, wiring them into the active session) lives in the
parent `ModesManager` module (`../ModesManager`), which is outside this folder.
This folder is the read-side retrieval engine that consumes those persisted
reference files. See [Integration](#integration).

## Design

### Hybrid score fusion

- Each reference file is split into overlapping chunks (`CHUNK_WORDS = 140`,
  `CHUNK_OVERLAP = 30`).
- For a query, every chunk gets two scores:
  - **FTS score** — a BM25-style lexical match over tokenized words
    (`computeFtsScore`), using the same `wordsOf` tokenizer as
    `ModeContextRetriever` so hybrid score fusion stays consistent.
  - **Vector score** — cosine similarity between the query embedding and the
    chunk embedding (`computeVectorScore`).
- Combined score = `FTS_WEIGHT * fts + (1 - FTS_WEIGHT) * vector`, with
  `FTS_WEIGHT = 0.4` (alpha).
- Chunks are filtered by a **minimum combined score** (`MIN_COMBINED_SCORE =
  0.15`), deduplicated to the best chunk per file, then packed under a token
  budget (`DEFAULT_TOKEN_BUDGET = 1800`, `DEFAULT_TOP_K = 6`).

### Graceful degradation / fallback

- If the embedding provider is not ready, or hybrid retrieval throws, the
  retriever falls back to **lexical-only** (`performLexicalRetrieval`), so a
  provider outage never blocks retrieval.
- A batch-embed failure degrades only the vector path for that query (each
  chunk's `vectorScore` becomes 0) rather than dropping the whole mode to
  lexical — preserving the pre-batch graceful-degradation contract.

### Adaptive threshold

- The minimum-combined-score floor is scaled down by `min(1, querySize / 5)`
  for short bare queries (no transcript context yet), and restored to the full
  `0.15` once a meaningful transcript is present (`hasTranscript`). This
  compensates for the mechanically lower theoretical max score on short
  queries (see FINDING-001).

### Persistence / index state

- A SQLite table `mode_reference_index_state` (`file_id`, `file_hash`,
  `indexed_at`, `chunk_count`) tracks which reference files have been embedded.
- A content hash (`hashContent`, polynomial/Java-style `String.hashCode`
  variant over the first 10k chars + length) detects file changes so
  re-indexing is incremental (`needsReindexing` / `markIndexed` / `removeFile`).
- Reference file *content* itself is stored externally in the
  `mode_reference_files` table (owned by `ModesManager`); this module reads it
  via the `ModeReferenceFile[]` passed in.

### Telemetry (throttled)

- On fallback to lexical-only, a `rag_lexical_fallback` telemetry event is
  emitted (reason: `embedding_unavailable` | `hybrid_threw` | `db_unavailable`).
- Emission is throttled to at most once per 60s per `(modeId, reason)` key to
  avoid flooding the JSONL during a sticky outage (see FINDING-007).
- Telemetry is loaded lazily via `require` so the file stays unit-testable
  without dragging the telemetry log path into the test working directory, and
  failures are swallowed so telemetry never blocks retrieval.

### Output format

- Retrieved chunks are formatted as an XML block
  (`<active_mode_retrieved_context>`) with a grounding guard instructing the
  model to treat snippets as **untrusted evidence only**, plus per-snippet
  `<source>` (JSON citation payload) and `<text>` (XML-escaped) elements.
- Every chunk carries `trustLevel: 'untrusted_reference'`.

## Flow

`retrieve()` is the single entry point:

1. **Short-circuits**: no files → empty context; query collapses to zero
   searchable tokens → fallback shape (empty, `usedFallback: true`); no chunks
   → empty context.
2. **Tokenize query** into a set of search words via `wordsOf`.
3. **Chunk all reference files** into `ChunkCandidate`s (`getModeFileChunks`).
4. **Compute adaptive threshold** from `hasTranscript` + query size.
5. **Retrieve**:
   - If embeddings available → `performHybridRetrieval` (embed query + all
     chunks in one batch, compute FTS + vector scores, filter by threshold).
     On throw → emit `hybrid_threw` telemetry, fall back to lexical.
   - Else → `performLexicalRetrieval` (FTS only), emit
     `embedding_unavailable` telemetry.
6. **Sort** by combined score desc, **deduplicate** to best chunk per file,
   **enforce token budget** (top-K + token cap).
7. **Format** selected chunks into the XML context string.
8. Return `ModeRetrievedContext { chunks, formattedContext, usedFallback,
   usedHybrid }`.

Index-state lifecycle helpers (`needsReindexing`, `markIndexed`, `removeFile`,
`getIndexStats`) are separate public methods used by the embedding/indexing
side to keep the `mode_reference_index_state` table in sync with file content.

## Integration

- **`../ModesManager`** — source of `ModeReferenceFile[]` (id, fileName,
  content) passed into `retrieve()`. Owns the custom-mode lifecycle and the
  `mode_reference_files` persistence table. This folder is the retrieval
  consumer of those files.
- **`../../rag/VectorStore`** — injected dependency; provides the vector
  store abstraction (`ScoredChunk`).
- **`../../rag/EmbeddingPipeline`** — injected dependency; provides
  `isReady()`, `getEmbeddingForQuery()`, and the batch `getEmbeddings()`
  endpoint (with a `getEmbedding`-only fallback for older/mocked pipelines).
- **`better-sqlite3` Database** — injected; owns the
  `mode_reference_index_state` table created by `ensureIndexTable()`.
- **`../telemetry/TelemetryService`** — lazily required to emit
  `rag_lexical_fallback` events (throttled). `emitFallbackTelemetryStatic` is
  exposed for external callers (e.g. `ModeContextRetriever`'s db-unavailable
  branch) to share the same throttle.
- **`ModeContextRetriever`** (sibling, referenced in comments) — shares the
  `wordsOf` tokenizer and chunking so hybrid score fusion stays consistent.
- **`docs/testing/MODES_PROFILE_INTELLIGENCE_BUGFIX_LOG.md`** — referenced for
  FINDING-001 (adaptive threshold) and FINDING-003 (batch-embed degradation);
  FINDING-007 covers the throttled fallback telemetry.
