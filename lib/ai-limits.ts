/* ============================================================================
   FILE: lib/ai-limits.ts
   ============================================================================
   
   CENTRALIZED AI RATE LIMIT CONFIGURATION
   
   This file manages token limits and batching logic for different AI models.
   
   TOKENIZATION (Gemma 4 models):
   - Images and PDF pages are converted into visual tiles
   - Each tile = 258 tokens (for images/pages ≤384px, or each 768x768 crop)
   - PDFs are treated as image input: 1 PDF page = 1 image = 258 tokens
   
   RATE LIMITS (TESTING PHASE):
   - Gemma 4 Flagship (Syllabus primary):         250,000 TPM
   - Gemma 4 Speed (Syllabus fallback):           250,000 TPM
   - gemini-3.1-flash-lite-preview (other tasks): 250,000 TPM
   - gemini-2.5-flash-lite (other fallback):      250,000 TPM
============================================================================ */

// =============================================================================
// TOKEN ESTIMATES (based on Gemma 4 tile tokenization)
// =============================================================================

/** 
 * Tokens per image (each image/PDF page = 1 tile = 258 tokens)
 * Source: https://ai.google.dev/gemini-api/docs/tokens
 */
export const TOKENS_PER_IMAGE_PAGE = 258;

/** 
 * Tokens per PDF page (PDFs treated as images, 1 page = 1 tile = 258 tokens)
 * Same as images in Gemma 4 models
 */
export const TOKENS_PER_PDF_PAGE = 258;

/** Overhead for system prompt + topic list (conservative) */
export const PROMPT_OVERHEAD_TOKENS = 1500;

/** Reserved tokens for AI output (JSON response) */
export const OUTPUT_RESERVE_TOKENS = 3000;

// =============================================================================
// RATE LIMITS
// =============================================================================

/** Tokens Per Minute for all models (shared limit during testing phase) */
export const NOTES_TPM = 250_000;
export const SYLLABUS_TPM = 250_000;

// Default TPM for backward compatibility
export const DEFAULT_TPM = SYLLABUS_TPM;

// =============================================================================
// DERIVED LIMITS (for reference)
// =============================================================================

// With Gemma 4 (250K TPM): ~800+ pages per batch
// (Testing phase: all models share 250K limit)

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate maximum tokens available for input files per API call
 */
export function getMaxInputTokens(tpm: number = DEFAULT_TPM): number {
    return tpm - PROMPT_OVERHEAD_TOKENS - OUTPUT_RESERVE_TOKENS;
}

/**
 * Estimate tokens for a file based on type and page count
 */
export function estimateTokens(mimeType: string, pageCount: number): number {
    if (mimeType === 'application/pdf') {
        return pageCount * TOKENS_PER_PDF_PAGE;
    }
    // Images: treat as 1 page each
    return TOKENS_PER_IMAGE_PAGE;
}

/**
 * Split files into token-safe batches
 * Returns array of file index arrays
 */
export function splitIntoBatches(
    files: Array<{ mimeType: string; pageCount: number }>,
    tpm: number = DEFAULT_TPM
): number[][] {
    const maxInputTokens = getMaxInputTokens(tpm);
    const batches: number[][] = [];
    let currentBatch: number[] = [];
    let currentTokens = 0;

    files.forEach((file, index) => {
        const fileTokens = estimateTokens(file.mimeType, file.pageCount);

        // If single file exceeds limit, it gets its own batch (will be handled by retry/fallback)
        if (fileTokens > maxInputTokens) {
            if (currentBatch.length > 0) {
                batches.push(currentBatch);
                currentBatch = [];
                currentTokens = 0;
            }
            batches.push([index]);
            return;
        }

        // Would this file exceed current batch?
        if (currentTokens + fileTokens > maxInputTokens) {
            batches.push(currentBatch);
            currentBatch = [index];
            currentTokens = fileTokens;
        } else {
            currentBatch.push(index);
            currentTokens += fileTokens;
        }
    });

    // Don't forget last batch
    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
}

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

// --- Syllabus: Gemma 4 (vision-capable, no thinking mode) ---
export const GEMMA_4_FLAGSHIP = "gemma-4-31b-it";   // Syllabus primary
export const GEMMA_4_SPEED = "gemma-4-26b-a4b-it"; // Syllabus fallback

// --- All other tasks: Gemini 3.1 Flash Lite Preview ---
// NOTE: gemini-3.1-flash-lite-preview defaults thinking to "high" if not set.
// Always pass NO_THINKING_CONFIG when calling this model.
export const GEMINI_MODEL_NOTES = "gemini-3.1-flash-lite-preview"; // Notes RAG extraction
export const GEMINI_MODEL_QUESTIONS = "gemini-3.1-flash-lite-preview"; // Questions + Assignments + PYQs
export const GEMINI_MODEL_SYLLABUS = GEMMA_4_FLAGSHIP;                  // Syllabus parsing
export const AI_BACKUP_MODEL = "gemini-2.5-flash-lite";               // Fallback for extraction tasks
export const SYLLABUS_BACKUP_MODEL = GEMMA_4_SPEED;                    // Fallback for syllabus tasks

// --- Weight/scoring tasks: Gemma 4 (pure structured JSON, no vision, cheapest) ---
// SP (Syllabus Prior) and TE (Teacher Emphasis) are pure JSON scoring tasks.
// Gemma 4 is well-suited: no thinking overhead, no vision needed, very cheap.
// Gemma does NOT support thinkingConfig — getThinkingConfig() returns {} for it.
export const GEMINI_MODEL_WEIGHTS = GEMMA_4_SPEED;           // SP + TE primary (cheap Gemma MoE)
export const GEMINI_MODEL_WEIGHTS_FALLBACK = GEMINI_MODEL_QUESTIONS; // Fallback to Gemini 3.1

export const EMBEDDING_MODEL = "gemini-embedding-2";


/**
 * Minimize thinking for Gemini 3.1.x models (e.g. gemini-3.1-flash-lite-preview).
 * These models default to thinking_level="high" — MINIMAL is the lowest level.
 *
 * DO NOT apply to Gemma models or Gemini 2.5 Flash Lite — they do not support thinkingLevel.
 * NOTE: Do NOT set both thinkingBudget and thinkingLevel simultaneously.
 */
export const NO_THINKING_CONFIG = {
    thinkingConfig: { thinkingLevel: 'MINIMAL' as any },
};

/**
 * Disable thinking for Gemini 2.5 Flash Lite (the fallback model).
 * This model uses thinkingBudget instead of thinkingLevel.
 */
export const NO_THINKING_CONFIG_25 = {
    thinkingConfig: { thinkingBudget: 0 },
};

/**
 * Returns the correct no-thinking config for any model.
 * Use this whenever the model string may vary (e.g. primary/fallback logic).
 *
 * - gemini-3.1.x  → thinkingLevel: MINIMAL
 * - gemma-4.x     → thinkingLevel: MINIMAL (Gemma 4 also supports thinkingLevel)
 * - gemini-2.5.x  → thinkingBudget: 0      (uses budget, not level)
 */
export function getThinkingConfig(model: string): object {
    if (model.startsWith('gemini-3.1') || model.startsWith('gemma-4')) {
        return NO_THINKING_CONFIG;
    }
    if (model.startsWith('gemini-2.5')) {
        return NO_THINKING_CONFIG_25;
    }
    // Unknown model — don't send thinking config, let model use its default
    return {};
}

/**
 * Get preferred model for a batch
 */
export function getModelForBatch(resourceType: string, batchIndex: number): string {
    if (resourceType === 'SYLLABUS') {
        return GEMINI_MODEL_SYLLABUS;
    }
    if (resourceType === 'QUESTION' || resourceType === 'ASSIGNMENT') {
        return GEMINI_MODEL_QUESTIONS;
    }
    return GEMINI_MODEL_NOTES;
}
