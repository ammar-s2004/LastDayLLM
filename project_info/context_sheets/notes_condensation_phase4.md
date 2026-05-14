# Context Sheet: Smart Notes Condensation — Phase 4/4 (API Upgrades)

## WHAT TO WRITE
Modify three existing function blocks across three different files to support the new `chunk_tier` metadata.

1. `lib/qdrant/operations.ts` : Update `searchNotes()` to apply the `chunk_tier` filter if provided.
2. `app/api/notes-v2/search/route.ts` : Update `POST()` to accept `chunk_tier` from request body and return new metadata fields.
3. `app/api/notes-v2/ask/route.ts` : Update `POST()` to use the new `NOTES_RAG_ANSWER_PROMPT` and differentiate digest/verbatim chunks in context.

## TARGET FILE 1: `lib/qdrant/operations.ts`
### Modification: `searchNotes` function
- Input: `queryVector: number[], filters: NoteSearchFilters = {}, limit: number = 10`
- Current logic builds `mustConditions` for `college_id`, `subject_id`, etc.
- What to add: If `filters.chunk_tier` is present, push a match condition for it: `key: 'chunk_tier', match: { value: filters.chunk_tier }`.
- Return exactly the modified `searchNotes` function block.

## TARGET FILE 2: `app/api/notes-v2/search/route.ts`
### Modification: `POST` function
- Inputs: Receives NextRequest.
- What to add: 
  - Parse `chunk_tier` from `req.json()`.
  - Pass `chunk_tier` into the `filters` object of `searchNotes(...)`.
  - In `formattedResults = results.map(...)`, add these new fields to the return object:
    - `chunk_tier: result.payload.chunk_tier`
    - `verbatim_type: result.payload.verbatim_type`
    - `teacher_emphasis: result.payload.teacher_emphasis`
    - `matched_syllabus_topics: result.payload.matched_syllabus_topics`
- Return exactly the modified `POST` function block.

## TARGET FILE 3: `app/api/notes-v2/ask/route.ts`
### Modification: `POST` function
- Inputs: Receives NextRequest.
- What to add:
  - Instead of standard text combination, build `contextParts` by mapping `searchResults` and clearly marking their tier:
    ```
    [Source X: filename] [Tier: chunk_tier] [Verbatim Type: verbatim_type (if present)]
    Content: ...
    ```
  - Instead of hardcoding `systemPrompt`, just generate `import { NOTES_RAG_ANSWER_PROMPT } from '@/lib/ai-prompts'` in the IDE integration step. For your code, just use `const systemPrompt = NOTES_RAG_ANSWER_PROMPT;`
- Return exactly the modified `POST` function block.

## DO NOT
- Do not output full files, just the three specific functions separated by markdown headers.
- Do not add boilerplate imports, I will handle them.
