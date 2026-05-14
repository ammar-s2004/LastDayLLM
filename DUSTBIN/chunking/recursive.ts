/* ============================================================================
   FILE: lib/chunking/recursive.ts
   ============================================================================
   
   Recursive Text Chunking for RAG
   
   Smart chunking strategy:
   - Split by paragraphs first
   - Then by sentences if chunk too large
   - Maintain overlap for context
   - Track page numbers for reference
   
   NO AI CALLS - pure text processing
   
============================================================================ */

export interface TextChunk {
    content: string;
    index: number;
    startChar: number;
    endChar: number;
    pageNumber?: number;
}

export interface ChunkingOptions {
    maxChunkSize?: number;      // Target size in characters (default: 1500)
    minChunkSize?: number;      // Minimum chunk size (default: 200)
    overlap?: number;           // Overlap between chunks (default: 150)
    preserveNewlines?: boolean; // Keep paragraph structure (default: true)
}

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
    maxChunkSize: 1500,    // ~375 tokens at 4 chars/token
    minChunkSize: 200,
    overlap: 150,
    preserveNewlines: true,
};

/**
 * Split text at sentence boundaries
 */
function splitSentences(text: string): string[] {
    // Match sentence endings: . ! ? followed by space or end
    const sentenceRegex = /[.!?]+(?:\s+|$)/g;
    const sentences: string[] = [];
    let lastIndex = 0;

    let match;
    while ((match = sentenceRegex.exec(text)) !== null) {
        const sentence = text.slice(lastIndex, match.index + match[0].length).trim();
        if (sentence) {
            sentences.push(sentence);
        }
        lastIndex = match.index + match[0].length;
    }

    // Add remaining text if any
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
        sentences.push(remaining);
    }

    return sentences;
}

/**
 * Split text at paragraph boundaries
 */
function splitParagraphs(text: string): string[] {
    // Split on double newlines or multiple newlines
    return text
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
}

/**
 * Recursive chunking - splits text into optimal chunks
 */
export function chunkText(text: string, options: ChunkingOptions = {}): TextChunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const chunks: TextChunk[] = [];

    // Clean up text
    const cleanText = text.replace(/\r\n/g, '\n').trim();

    if (cleanText.length === 0) {
        return [];
    }

    // If text is small enough, return as single chunk
    if (cleanText.length <= opts.maxChunkSize) {
        return [{
            content: cleanText,
            index: 0,
            startChar: 0,
            endChar: cleanText.length,
        }];
    }

    // First, split by paragraphs
    const paragraphs = splitParagraphs(cleanText);

    let currentChunk = '';
    let currentStart = 0;
    let charPosition = 0;

    for (const paragraph of paragraphs) {
        // If adding this paragraph exceeds max size
        if (currentChunk.length + paragraph.length + 2 > opts.maxChunkSize) {
            // Save current chunk if it has content
            if (currentChunk.length >= opts.minChunkSize) {
                chunks.push({
                    content: currentChunk.trim(),
                    index: chunks.length,
                    startChar: currentStart,
                    endChar: currentStart + currentChunk.length,
                });

                // Start new chunk with overlap
                const overlapText = currentChunk.slice(-opts.overlap);
                currentChunk = overlapText;
                currentStart = charPosition - opts.overlap;
            }

            // If paragraph itself is too large, split by sentences
            if (paragraph.length > opts.maxChunkSize) {
                const sentences = splitSentences(paragraph);
                for (const sentence of sentences) {
                    if (currentChunk.length + sentence.length + 1 > opts.maxChunkSize) {
                        if (currentChunk.length >= opts.minChunkSize) {
                            chunks.push({
                                content: currentChunk.trim(),
                                index: chunks.length,
                                startChar: currentStart,
                                endChar: currentStart + currentChunk.length,
                            });
                            const overlapText = currentChunk.slice(-opts.overlap);
                            currentChunk = overlapText + ' ' + sentence;
                            currentStart = charPosition - opts.overlap;
                        } else {
                            currentChunk += ' ' + sentence;
                        }
                    } else {
                        currentChunk += (currentChunk ? ' ' : '') + sentence;
                    }
                }
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            }
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }

        charPosition += paragraph.length + 2; // +2 for \n\n
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
        chunks.push({
            content: currentChunk.trim(),
            index: chunks.length,
            startChar: currentStart,
            endChar: currentStart + currentChunk.length,
        });
    }

    return chunks;
}

/**
 * Chunk text with page number tracking (for PDFs)
 * Input format: Array of {pageNumber, text}
 */
export function chunkTextWithPages(
    pages: Array<{ pageNumber: number; text: string }>,
    options: ChunkingOptions = {}
): TextChunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const allChunks: TextChunk[] = [];

    // Process each page
    for (const page of pages) {
        const pageChunks = chunkText(page.text, opts);

        // Add page number to each chunk
        for (const chunk of pageChunks) {
            allChunks.push({
                ...chunk,
                index: allChunks.length,
                pageNumber: page.pageNumber,
            });
        }
    }

    return allChunks;
}

/**
 * Simple word count estimation
 */
export function estimateTokenCount(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
}
