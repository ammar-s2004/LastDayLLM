/* ============================================================================
   FILE: lib/qdrant/types.ts
   ============================================================================
   
   Type definitions for Qdrant RAG system
   
============================================================================ */

/**
 * Classification of content within a chunk
 */
export type ContentType =
    | 'theory'          // Explanatory text
    | 'diagram'         // Chunk contains diagram descriptions
    | 'formula'         // Mathematical equations/derivations
    | 'table'           // Structured data tables
    | 'example'         // Worked examples
    | 'definition'      // Term definitions
    | 'mixed'           // Multiple types in one chunk
    | 'general';        // Unclassified content

/**
 * Processing status for notes
 */
export type NoteProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Payload stored with each vector point in Qdrant
 */
export interface NoteChunkPayload {
    // Identifiers
    upload_id: string;          // UUID from qdrant_notes_metadata
    chunk_index: number;        // Position in the document

    // College & Subject context
    college_id: string;
    college_name: string;
    subject_id: string;
    subject_name: string;

    // File metadata
    filename: string;
    file_type: string;          // 'pdf' (MVP: PDF only, convert PPT/PPTX before uploading)
    teacher_name: string | null;

    // Content
    content: string;            // Original text content
    content_type?: ContentType;  // Made optional; legacy global classifier
    has_diagram?: boolean;       // Made optional; legacy boolean indicator

    // NEW: Condensation tier fields
    chunk_tier: 'concept_intel' | 'verbatim' | 'diagram';
    digest_text?: string;            // Legacy
    teacher_emphasis?: string[];     // Legacy
    matched_syllabus_topics?: string[];
    verbatim_type?: string;
    subtopic?: string;
    label?: string;
    page?: string;
    section_context?: string;

    // NEW: Source tracking (from ---SECTION--- headers)
    source_page_range?: string;       // "12-15" or "25"
    section_title?: string;           // "Flip Flops - SR Latch"

    // NEW: Content classification
    topic_tags?: string[];            // ["SR Flip Flop", "Sequential Circuits"]
    diagram_descriptions?: string[];  // Text from [DIAGRAM: "..."] tags
    diagram_urls?: string[];          // URLs to diagram images (Phase 3)

    // NEW: Document-level context (Phase 4)
    file_summary?: string;            // High-level summary of the entire file
    key_topics?: string[];            // Major technical keywords

    // Uploader (anonymized for discovery)
    uploader_id: string;

    // Timestamps
    created_at: string;         // ISO string
    expires_at?: string | null;  // ISO string, null/undefined = never expires
}

/**
 * Input for upserting note chunks to Qdrant
 */
export interface UpsertChunkInput {
    id: string;                 // UUID for the point
    vector: number[];           // Embedding vector (768 dims for Google)
    payload: NoteChunkPayload;
}

/**
 * Search filters for querying notes
 */
export interface NoteSearchFilters {
    college_id?: string;
    subject_id?: string;
    teacher_name?: string;
    content_type?: ContentType;       // Changed from chunk_type
    has_diagram?: boolean;            // NEW: Filter by diagram presence
    section_title?: string;           // NEW: Filter by section
    exclude_expired?: boolean;        // Default true
    chunk_tier?: 'digest' | 'verbatim';
    matched_syllabus_topics?: string[];
}

/**
 * Search result from Qdrant
 */
export interface NoteSearchResult {
    id: string;
    score: number;
    payload: NoteChunkPayload;
}

/**
 * Discovery metadata (no content, just info)
 */
export interface NoteDiscoveryItem {
    upload_id: string;
    filename: string;
    file_type: string;
    teacher_name: string | null;
    subject_name: string;
    chunk_count: number;
    created_at: string;
}

/**
 * Storage stats for monitoring Qdrant usage
 */
export interface QdrantStorageStats {
    total_points: number;
    colleges_count: number;
    subjects_count: number;
    estimated_size_mb: number;
}

/**
 * Condensed section returned by the AI Condensation engine
 */
export interface CriticalItem {
    type: 'formula' | 'numerical' | 'table' | 'example' | 'diagram';
    content: string;
}

export interface CondensedSection {
    section_title: string;
    page_range: string;
    digest: string;
    teacher_emphasis: string[];
    keywords: string[];
    matched_syllabus_topics: string[];
    critical_verbatim: CriticalItem[];
    has_diagrams: boolean;
}

/**
 * Full result from the AI condensation process
 */
export interface CondensedNotesResult {
    sections: CondensedSection[];
    document_summary: string;
    all_keywords: string[];
}
