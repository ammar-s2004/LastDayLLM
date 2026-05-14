# Context Sheet: Smart Notes Condensation — Phase 2/4

## TASK
Implement the core AI Condensation Engine for student notes. 
We are moving from a system that chunks all notes blindly by character count to a two-tiered semantic extraction system.

You must modify TWO files (this counts as two chunks):

### Chunk 1: `lib/ai-prompts.ts`
Export a new prompt builder function: `buildNotesCondensationPrompt({ syllabusTopics }: { syllabusTopics: string[] }): string`.
This prompt must instruct the AI to read notes, identify key sections, check if they map to the provided `syllabusTopics`, and extract information in TWO parallel arrays in JSON format:
1. `digest_chunks`: 200-400 character highly-compressed summaries of the section. Must include an array of `teacher_emphasis` (keywords the text heavily stresses).
2. `verbatim_chunks`: Direct, uncut, strict-verbatim copies of critical formulas, definitions, code, or examples that cannot be summarized. Each verbatim chunk must specify its `verbatim_type` ('formula', 'definition', 'example', 'code').

### Chunk 2: `lib/extraction/ai.ts`
Export an async function: `condenseExtractedNotes(fullMarkdown: string, syllabusTopics: string[]): Promise<CondensationResult>`
It should:
1. Truncate `fullMarkdown` to `50000` chars if it's too long, like `generateMetaSummary` does (Gemini 2.0 output context limit safety).
2. Call `getExtractionAI().models.generateContent({ ... })` using the `GEMINI_MODEL_NOTES` model.
3. Use the above prompt.
4. Clean and parse the JSON block.
5. Define and return a `CondensationResult` interface containing the arrays of digests and verbatims.

---

## TARGET FILE 1 — Chunk 1
- `lib/ai-prompts.ts` — [MODIFY]
- Currently exports `SYLLABUS_EXTRACTION_PROMPT`, `buildQuestionsExtractionPrompt`, `buildPYQExtractionPrompt`

## TARGET FILE 2 — Chunk 2
- `lib/extraction/ai.ts` — [MODIFY]
- Currently exports `getExtractionAI`, `uploadToGoogleFileAPI`, `extractMultiModalContent`, `generateMetaSummary`, `parseChunkMetadata`

## PHASE DEPENDENCIES
- Depends on phases: 1 (Database and Qdrant metadata types for `chunk_tier` have been updated).
- Your infra this relies on: The new Qdrant schema accepts `chunk_tier: 'digest' | 'verbatim'`.

## EXISTING CODE (paste verbatim, include file path)

```ts
// FROM: lib/ai-prompts.ts
export function buildPYQExtractionPrompt({ topicList }: { topicList: string }): string {
    return `Extract all exam questions and map them to these topics:
${topicList}

Return ONLY valid JSON:
{
  "questions": [
    {
      "question_no": 1,
      "text": "Question text",
      "marks": 10,
      "topics": [
        { "topic_name": "Topic", "relevance": 1.0 }
      ]
    }
  ]
}`;
}
```

```ts
// FROM: lib/extraction/ai.ts
import { GoogleGenAI, FileState } from '@google/genai';
import { PDFDocument } from 'pdf-lib';

import { GEMINI_MODEL_NOTES } from '@/lib/ai-limits';

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

// ... internal implementation examples ...
export async function generateMetaSummary(fullMarkdown: string): Promise<DocumentSummary> {
    const client = getExtractionAI();
    console.log('[AI Summary] Generating document-level summary');

    // Use a smaller snippet if the document is excessively long
    const textSnippet = fullMarkdown.slice(0, 50000);

    const prompt = `Analyze the following educational content and provide a high-level summary.
    
    RETURN RAW JSON with this schema:
    {
      "summary": "3-sentence concise summary for students",
      "topics": ["topic 1", "topic 2", ... (5-8 major keywords)]
    }
    
    CONTENT:
    ${textSnippet}`;

    try {
        const response = await client.models.generateContent({
            model: GEMINI_MODEL_NOTES,
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                maxOutputTokens: 8192,
                temperature: 0.1,
            }
        });

        const text = response.text;
        // Clean up potential markdown code blocks
        const jsonStr = text!.replace(/```json[\r\n]*|[\r\n]*```/g, '').trim();
        const result = JSON.parse(jsonStr) as DocumentSummary;

        return result;
    } catch (error) { ... }
}
```

## PROJECT PATTERNS (must follow exactly)
- Parsing JSON: **ALWAYS** wrap in try/catch and use `.replace(/```json[\r\n]*|[\r\n]*```/g, '').trim()` before parsing, just like `generateMetaSummary`.
- Models: Use the new `@google/genai` SDK exactly as shown in the existing code (`client.models.generateContent`). Do not use the legacy `@google/generative-ai` pattern (`genAI.getGenerativeModel`).
- Output limits: For `condenseExtractedNotes`, set `maxOutputTokens: 8192` and `temperature: 0.2`.

## EXPECTED OUTPUT SHAPE (For ai.ts)

```ts
export interface CondensationResult {
    digest_chunks: Array<{
        section_title: string;
        content: string; // The summarized text
        teacher_emphasis: string[];
        matched_topics: string[];
        source_page_range?: string;
    }>;
    verbatim_chunks: Array<{
        section_title: string;
        content: string; // The exact uncut text/formula
        verbatim_type: 'formula' | 'definition' | 'example' | 'code';
        matched_topics: string[];
        source_page_range?: string;
    }>;
}

export async function condenseExtractedNotes(fullMarkdown: string, syllabusTopics: string[]): Promise<CondensationResult>
```
