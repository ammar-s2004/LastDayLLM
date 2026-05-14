# Exhaustive Database Reference Manual
**Project:** LastDayLLM
**Generated:** Sunday, February 15, 2026
**Version:** 2.1 (Phase 4 Updates)

***

## 4.12 `public.qdrant_notes_metadata`
**Description**: Tracks note uploads synced to Qdrant vector database.
- **RLS**: ✅ Enabled
- **Policies**: Selectable for all users (shared knowledge base), managed by authenticated uploader.

| Column | Type | Nullable | Default |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `subject_id` | `uuid` | NO | |
| `college_id` | `uuid` | NO | |
| `original_filename` | `text` | NO | |
| `content_hash` | `text` | NO | |
| `chunk_count` | `int4` | NO | |
| `is_best_collection` | `boolean` | NO | `true` |
| `doc_summary` | `text` | YES | |
| `key_topics` | `text[]` | YES | `'{}'` |
| `expires_at` | `timestamptz` | YES | |
| `created_at` | `timestamptz` | YES | `now()` |

---

## 5. Security & RLS Policies (Exhaustive)
- **`qdrant_notes_metadata`**: 
  - `SELECT`: `true` (Public access for shared knowledge base).
  - `INSERT/UPDATE/DELETE`: `auth.uid() = uploader_id`.

---

## 10. Migration History
| Version | Name | Description |
| :--- | :--- | :--- |
| ... | ... | ... |
| `20260207000003` | `create_qdrant_notes_metadata` | Created tracking table for vector uploads. |
| `20260215000000` | `add_summary_columns` | Added `doc_summary` and `key_topics` columns. |

***
**End of Manual**
