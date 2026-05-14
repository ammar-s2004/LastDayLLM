# Context Sheet: Single-Pass Notes RAG — Phase 2/4

## WHAT TO WRITE
Target file: `lib/extraction/ai.ts` (existing)
Add the following interface and 2 functions right above the existing `condenseExtractedNotes` legacy function.

- `export interface SinglePassResult` — defines the structured output schema for the new AI pass.
- `export async function condenseFileDirectly(fileUri: string, mimeType: string, syllabusTopics: string[], pageInfo?: string): Promise<SinglePassResult>` — Calls Google GenAI passing the fileUri natively, returning the structured `SinglePassResult`.
- `export async function condensePDFWithSegmentation(buffer: Buffer, filename: string, syllabusTopics: string[]): Promise<SinglePassResult>` — Splits a PDF if it's too large, processes each segment using `condenseFileDirectly`, and merges the results.

## Existing Context in Target File to USE (Do not rewrite these):
```typescript
import { GoogleGenAI, FileState } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import { GEMINI_MODEL_NOTES } from '@/lib/ai-limits';
import { buildNotesCondensationPrompt } from '@/lib/ai-prompts';

const PAGES_PER_SEGMENT = 25;
const MAX_TOTAL_PAGES = 2000;

export function getExtractionAI(): GoogleGenAI { ... }
export async function uploadToGoogleFileAPI(buffer: Buffer, mimeType: string, displayName: string): Promise<{name: string, uri: string}> { ... }
export async function deleteGoogleFile(fileName: string): Promise<void> { ... }
export async function extractPDFPages(pdfDoc: PDFDocument, startPage: number, endPage: number): Promise<Buffer> { ... }
```

## EXACT SDK DOCS TO FOLLOW FOR `condenseFileDirectly`:
```javascript
// Google Gen AI SDK v0.1+
// Passing a File API URI directly to the model
const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
        { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
        'Describe this file focusing on X.'
    ],
    config: {
        maxOutputTokens: 8192,
        temperature: 0.2,
        responseMimeType: 'application/json'
    }
});
const result = JSON.parse(response.text);
```

## INPUTS & OUTPUTS & BUSINESS LOGIC

### 1. `SinglePassResult` (Interface)
- Output Shape:
```typescript
export interface SinglePassResult {
    doc_summary: string;
    key_topics: string[];
    digest_chunks: Array<{ section_title: string; content: string; teacher_emphasis: string[]; matched_topics: string[]; source_page_range?: string; }>;
    verbatim_chunks: Array<{ section_title: string; content: string; verbatim_type: 'formula' | 'definition' | 'example' | 'code'; matched_topics: string[]; source_page_range?: string; }>;
}
```

### 2. `condenseFileDirectly`
- Logic: 
  - Call `getExtractionAI()`. 
  - Get the prompt from `buildNotesCondensationPrompt({ syllabusTopics })`. 
  - Add `pageInfo` to the prompt text if it's provided (e.g. "Focus on pages 1 to 25.").
  - Call `generateContent` using `GEMINI_MODEL_NOTES` with `responseMimeType: 'application/json'`.
  - Parse the output string and return as `SinglePassResult`.
  - Edge cases: Handle missing `response.text` gracefully (throw error).

### 3. `condensePDFWithSegmentation`
- Logic:
  - Load buffer with `PDFDocument.load(buffer)`.
  - Throw error if page count > `MAX_TOTAL_PAGES`.
  - If page count <= `PAGES_PER_SEGMENT`:
    - Upload whole buffer `uploadToGoogleFileAPI(buffer, 'application/pdf', filename)`.
    - Call `condenseFileDirectly` on the returned URI.
    - MUST clean up using `deleteGoogleFile` inside a `finally` block.
    - Return result.
  - If page count > `PAGES_PER_SEGMENT`:
    - Loop through document in chunks of `PAGES_PER_SEGMENT`.
    - Extract sub-buffer using `extractPDFPages`.
    - Upload sub-buffer to Google File API.
    - Call `condenseFileDirectly` with `pageInfo` string (e.g., "pages 1 to 25").
    - Clean up `deleteGoogleFile` inside `finally`.
    - Catch individual segment errors so one failure doesn't crash the loop.
    - Complete the loop and merge all segment results (`doc_summary` joined by double horizontal newlines, `key_topics` deduped using a Javascript Set, merge all elements of the chunk arrays).
    - Throw an error if all segments resulted in errors.

## DO NOT
- Do not add imports.
- Do not write completely separate boilerplate or wrapper classes.
- Do not make assumptions about external missing methods. Use strictly what's supplied.
