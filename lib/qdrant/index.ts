/* ============================================================================
   FILE: lib/qdrant/index.ts
   ============================================================================
   
   Qdrant Module Exports
   
============================================================================ */

// Client
export {
    getQdrantClient,
    initializeCollection,
    getCollectionInfo,
    healthCheck,
    NOTES_COLLECTION,
    EMBEDDING_DIMENSIONS,
} from './client';

// Operations
export {
    upsertNoteChunks,
    searchNotes,
    searchNotesHybrid,
    detectTopicsFromQuestion,
    deleteByUploadId,
    deleteExpiredNotes,
    getCollegeNotes,
    getStorageStats,
    hasExistingNotes,
} from './operations';

// Types
export type {
    ContentType,
    NoteProcessingStatus,
    NoteChunkPayload,
    UpsertChunkInput,
    NoteSearchFilters,
    NoteSearchResult,
    NoteDiscoveryItem,
    QdrantStorageStats,
} from './types';
