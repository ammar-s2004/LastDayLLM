# Project Structure - LastDayLLM
**Last Updated:** Sunday, February 15, 2026

***

## 📁 Directory Tree

```
lastdayllm/
│
├── project_info/             ← [RENAMED from DB_info]
│   ├── database_reference_manual.md
│   ├── database_schema_report.md
│   ├── project_tree.md
│   ├── project_updates.md
│   └── tobedonenext.md       ← [NEW Priority Tracker]
│
├── app/
│   ├── api/
│   │   ├── notes-v2/
│   │   │   ├── upload/       ← [Modified for v2 pipeline]
│   │   │   └── ...
│
├── lib/
│   ├── extraction/
│   │   ├── ai.ts             ← [NEW Multimodal AI]
│   │   ├── images.ts         ← [NEW PPTX extraction]
│   │   └── native.ts
│
├── trigger/
│   ├── tasks/
│   │   ├── process-notes-qdrant.ts ← [Overhauled Pipeline]
```

***

## 📄 Key Files

### `lib/extraction/ai.ts`
**Purpose:** Handles AI-powered multimodal text extraction and meta-summarization using Gemini 2.0 Flash Lite.
**Created:** 2026-02-15
**Key Functions:** `extractTextWithAI`, `generateMetaSummary`.

### `lib/extraction/images.ts`
**Purpose:** Extracts images and diagrams from PPTX files (ZIP binary parsing) and uploads to Supabase.
**Created:** 2026-02-15
**Key Functions:** `extractPPTXImages`, `injectDiagramUrls`.

### `project_info/tobedonenext.md`
**Purpose:** Tracks immediate technical priorities and next session goals.
**Created:** 2026-02-15

***
**End of Project Tree**
