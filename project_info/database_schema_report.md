# Database Schema Report - LastDayLLM
**Last Updated:** Sunday, February 15, 2026, 10:28 PM IST
**Schema Version:** 1.2

***

## 📊 Overview
- **Total Tables:** 18
- **RLS Policies:** 22
- **Functions:** 7
- **Triggers:** 5
- **Last Modified:** 2026-02-15

***

## 📋 Tables

### `public.qdrant_notes_metadata`
**Purpose:** Tracks note uploads synced to Qdrant vector database.
**RLS Enabled:** True
**Last Modified:** 2026-02-15

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | uuid | PK | gen_random_uuid() | Identity |
| `upload_id` | text | | | Qdrant collection identifier |
| `subject_id` | uuid | FK | | FK to subjects |
| `college_id` | uuid | FK | | FK to colleges |
| `file_name` | text | | | Original filename |
| `file_hash` | text | | | For deduplication |
| `chunk_count` | int | | | Total segments created |
| `quality_score` | float | | | AI-derived quality metric |
| `is_active` | boolean | | true | |
| `is_best_collection` | boolean | | true | Flag for smart deduplication |
| `doc_summary` | text | | | High-level AI summary |
| `key_topics` | text[] | | '{}' | Major technical keywords |
| `expires_at` | timestamptz | | | Expiry for non-best collections |
| `created_at` | timestamptz | | now() | |

**Indexes:**
- `qdrant_notes_metadata_pkey` (Primary Key)
- `idx_qdrant_notes_topics` (GIN index on `key_topics`)

***

## 9. Migration History
| Version | Name | Description |
| :--- | :--- | :--- |
| `20250101` | `add_db_constraints` | Initial schema setup and core constraints. |
| `20260104` | `add_topic_ordering` | Added ordering fields for topics/modules. |
| `20260106120000` | `save_module_with_topics_secure` | Added secure transaction function for module creation. |
| `20260106150000` | `exam_scopes_normalized` | Created `exam_scopes` and `exam_scope_topics` tables. |
| `20260207000000` | `drop_old_notes_system` | **Qdrant Migration**: Dropped legacy note tables. |
| `20260207000003` | `create_qdrant_notes_metadata` | Tracking table for Qdrant-synced uploads. |
| `20260215000000` | `add_summary_columns` | **Phase 4**: Added `doc_summary` and `key_topics` to metadata. |

***
**End of Report**
