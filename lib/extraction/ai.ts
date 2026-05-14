/* ============================================================================
   FILE: lib/extraction/ai.ts
   ============================================================================

   AI-Powered Multimodal Notes Extraction

   Extracts structured notes intelligence from PDFs in a single Gemini call.
   Output covers three categories:
     - concept_intel : teacher-specific teaching angles per subtopic (RAG)
     - verbatim      : exact definitions, formulas, worked examples (RAG)
     - diagrams      : semantic descriptions of figures/visuals (RAG)
     - tm / tc       : topic map + coverage signals for NC scoring

   STRUCTURED OUTPUT ENFORCEMENT:
   The Gemini call uses both `responseMimeType: 'application/json'` AND a
   strict `responseSchema` object. This means the model is structurally
   constrained — it cannot return wrong keys, missing fields, or malformed
   types. The schema uses short compressed keys (e.g. `t`, `md`, `hd`) to
   reduce token usage. The `decodeNotesIntel()` function in notes-intel.ts
   translates these back to the full-key `NotesIntelResult` interface that
   all downstream code (NC scoring, Qdrant mapping) consumes unchanged.

   TO UPDATE THE SCHEMA:
   - Add/remove fields in `RawNotesIntelResult` (notes-intel.ts)
   - Mirror the change in the `responseSchema` object below
   - Mirror the change in `decodeNotesIntel()` (notes-intel.ts)
   - Update the prompt in `buildNotesIntelPrompt()` (ai-prompts.ts)
   All four must stay in sync.

============================================================================ */

import { GoogleGenAI, FileState } from '@google/genai';

import { GEMINI_MODEL_NOTES, AI_BACKUP_MODEL, NO_THINKING_CONFIG, getThinkingConfig } from '@/lib/ai-limits';
import { buildNotesIntelPrompt, type SyllabusHierarchy } from '@/lib/ai-prompts';
import { decodeNotesIntel, type RawNotesIntelResult, type NotesIntelResult } from './notes-intel';

// ============================================================================
// Constants
// ============================================================================

const MAX_OUTPUT_TOKENS = 65536; // API max for gemini-3.1-flash-lite-preview and gemini-2.5-flash-lite

// ============================================================================
// Singleton Client
// ============================================================================

let genAIClient: GoogleGenAI | null = null;

export function getExtractionAI(): GoogleGenAI {
    if (!genAIClient) {
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
        }
        genAIClient = new GoogleGenAI({ apiKey });
    }
    return genAIClient;
}

// ============================================================================
// Google File API Helpers
// ============================================================================

export interface UploadedFileRef {
    name: string;
    uri: string;
}

export async function uploadToGoogleFileAPI(
    buffer: Buffer,
    mimeType: string,
    displayName: string
): Promise<UploadedFileRef> {
    const client = getExtractionAI();
    console.log(`[File API] Uploading ${displayName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    try {
        const uint8Array = new Uint8Array(buffer);
        const blob = new Blob([uint8Array], { type: mimeType });

        const uploadResult = await client.files.upload({
            file: blob,
            config: {
                mimeType,
                displayName
            }
        });

        if (!uploadResult.name || !uploadResult.uri) {
            throw new Error('No name/URI returned from file upload');
        }

        console.log(`[File API] Uploaded: name=${uploadResult.name}, uri=${uploadResult.uri}`);
        await waitForFileActive(uploadResult.name);

        return {
            name: uploadResult.name,
            uri: uploadResult.uri
        };

    } catch (error) {
        console.error('[File API] Upload error:', error);
        throw new Error(
            `Failed to upload file to Google: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

async function waitForFileActive(
    fileName: string,
    maxWaitMs: number = 60000
): Promise<void> {
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < maxWaitMs) {
        attempts++;
        try {
            const client = getExtractionAI();
            const file = await client.files.get({ name: fileName });

            if (file.state === FileState.ACTIVE) {
                console.log(`[File API] File active after ${attempts} checks`);
                return;
            }

            if (file.state === FileState.FAILED) {
                throw new Error(`File processing failed: ${file.error?.message || 'Unknown error'}`);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`[File API] Status check error (attempt ${attempts}):`, error);
            throw error;
        }
    }

    throw new Error(`File did not become active within ${maxWaitMs}ms`);
}

export async function deleteGoogleFile(fileName: string): Promise<void> {
    try {
        const client = getExtractionAI();
        await client.files.delete({ name: fileName });
        console.log(`[File API] Deleted: ${fileName}`);
    } catch (error) {
        console.warn('[File API] Delete warning:', error);
    }
}

// ============================================================================
// Notes Intel Extraction
//
// extractNotesIntel() is the single entry point for the entire notes pipeline.
// It accepts a Google File API URI (pre-uploaded PDF) and the subject's
// syllabus hierarchy, then returns a fully decoded NotesIntelResult.
//
// The Gemini call enforces strict JSON structure via responseSchema — no
// prompt-only enforcement. Calibration instructions (rubric bands, examples)
// still live in the prompt text; the schema handles structural correctness.
// ============================================================================

export async function extractNotesIntel(
    fileUri: string,
    mimeType: string,
    syllabusHierarchy: SyllabusHierarchy[],
    originalFilename: string,
    pageCount: number
): Promise<NotesIntelResult> {
    const ai = getExtractionAI();
    const promptText = buildNotesIntelPrompt({ syllabusHierarchy });

    const makeCall = async (model: string) => ai.models.generateContent({
        model,
        contents: {
            parts: [
                { fileData: { fileUri, mimeType } },
                { text: promptText }
            ]
        },
        config: {
            ...getThinkingConfig(model),
            maxOutputTokens: MAX_OUTPUT_TOKENS, // Always max — never truncate JSON output
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    tm: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                t: { type: 'string' },
                                sc: { type: 'array', items: { type: 'string' } },
                                nc: { type: 'array', items: { type: 'string' } },
                            },
                            required: ['t', 'sc', 'nc'],
                        },
                    },
                    tc: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                t:  { type: 'string' },
                                st: { type: 'string' },
                                md: { type: 'number' },
                                ed: { type: 'number' },
                                cc: { type: 'number' },
                                hd: { type: 'boolean' },
                                he: { type: 'boolean' },
                                hf: { type: 'boolean' },
                                hg: { type: 'boolean' },
                                hc: { type: 'boolean' },
                                eh: { type: 'boolean' },
                            },
                            required: ['t', 'st', 'md', 'ed', 'cc', 'hd', 'he', 'hf', 'hg', 'hc', 'eh'],
                        },
                    },
                    concept_intel: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                t:  { type: 'string' },
                                st: { type: 'string' },
                                i:  { type: 'array', items: { type: 'string' } },
                                p:  { type: 'string', description: 'Page number or range, e.g. "12" or "4-6"' },
                            },
                            required: ['t', 'st', 'i', 'p'],
                        },
                    },
                    verbatim: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                t:  { type: 'string' },
                                st: { type: 'string' },
                                ty: { type: 'string' },
                                l:  { type: 'string' },
                                c:  { type: 'string' },
                                p:  { type: 'string', description: 'Page number or range, e.g. "12" or "4-6"' },
                            },
                            required: ['t', 'st', 'ty', 'l', 'c', 'p'],
                        },
                    },
                    diagrams: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                t:  { type: 'string' },
                                st: { type: 'string' },
                                d:  { type: 'string' },
                                p:  { type: 'string', description: 'Page number or range, e.g. "12" or "4-6"' },
                            },
                            required: ['t', 'st', 'd', 'p'],
                        },
                    },
                },
                required: ['tm', 'tc', 'concept_intel', 'verbatim', 'diagrams'],
            },
        }
    });

    let response;
    try {
        response = await makeCall(GEMINI_MODEL_NOTES);
    } catch (primaryErr: any) {
        const is503 = primaryErr?.message?.includes('503') ||
                      primaryErr?.message?.includes('UNAVAILABLE') ||
                      primaryErr?.status === 503;
        if (!is503) throw primaryErr;
        console.warn(`[extractNotesIntel] Primary model 503, falling back to ${AI_BACKUP_MODEL}`);
        response = await makeCall(AI_BACKUP_MODEL);
    }

    if (!response.text) {
        throw new Error('extractNotesIntel: No text in response from Gemini.');
    }

    const raw = JSON.parse(response.text) as RawNotesIntelResult;
    return decodeNotesIntel(raw, originalFilename);
}
