---
description: Strict workflow for handling database schema changes safely via MCP and Manual Push
---

# /giveToPerplexity — AI Execution Protocol

## ROLES
- **You (AI IDE / Opus)** = Architect + DevOps. You own: planning, infra, DB, MCP, types, verification, integration. You are reading this — these are your instructions.
- **Perplexity** = Junior Dev. Generates code from context sheets only.
- **User** = PM. Shuttles artifacts between you and Perplexity.

---

## HOW THIS WORKFLOW RUNS

```
/giveToPerplexity triggers →
  you discuss + clarify with user →
  user says "go" →
  you output a short phase list (2–4 phases max) →
  user approves →
  for each phase:
    YOURS  → you execute directly, tell user "say go for next phase"
    PERPLEXITY → you write context sheet, user gives it to Perplexity,
                 pastes output back, you verify + integrate, move to next phase
```

**Keep phases large.** You and Perplexity can both generate a lot in one shot. Don't over-chunk. One phase = one meaningful slice (e.g. "entire DB layer", "all API routes", "full UI"). Only split when there's a hard dependency ordering reason.

---

## STEP 0 — DECISION GATE (run before anything else)

Classify every subtask. Do NOT skip this.

**You execute directly (never delegate to Perplexity):**
- Database schema changes, migrations
- MCP server config / tool registration
- Shared type definitions / interfaces (`.d.ts`, barrel types)
- `package.json`, lockfile, `tsconfig`, build config changes
- `.env` / secrets / environment config
- Folder scaffolding, barrel `index.ts` files

**Perplexity-delegatable:**
- Business logic in isolated files
- UI components with no infra dependencies
- Utility/helper functions
- Stateless API route handlers (with full schema + auth pattern provided)

→ Your tasks: execute NOW via Self-Execute Protocols below, then continue to Phase 1.
→ Perplexity tasks: continue to Phase 1.

---

## SELF-EXECUTE PROTOCOLS

### SE-A: Database Migration
> ⚠️ Follow the `.agent\workflows\supabase-migration` (or `.agent\workflows\qdrant-migration`) that already exists in this project. Do NOT execute any schema changes via MCP directly. Your job is to write the migration file only — the user runs it.
1. Read all existing schema files. List every affected table/column/index.
2. Write migration file: up + down. Match existing migration filename convention (timestamp or sequential).
3. Update ORM schema (`schema.ts` / Prisma / Drizzle).
4. Update `project_info/` schema docs if they exist.
5. Output to user: `"Migration written. Run: <exact command> before proceeding."`

### SE-B: MCP Config
1. Read current MCP config file(s).
2. Read MCP SDK docs if tool signatures are unclear (use `fetch_url`).
3. Write the change. Verify no conflicts with existing tool registrations.
4. Output to user: `"MCP config updated. Restart MCP server before next phase."`

### SE-C: Type Definitions
1. Read ALL files that will import this type.
2. Write type to satisfy all consumers simultaneously.
3. Export from correct barrel file.
4. Verify no overlap with existing types.

### SE-D: Scaffolding
1. Create folder structure.
2. Create empty files with correct module format matching project convention.
3. Write barrel `index.ts` files if project uses them.
4. Output to user: `"Scaffold complete. Perplexity chunks: [list]"`

---

## PHASE 1 — DISCUSS & PLAN

**Trigger:** `/giveToPerplexity <feature>`

### 1A — Discuss first
1. Ask any clarifying questions. Do NOT assume. Do NOT proceed until fully aligned.
2. Wait for user to say "go" before doing anything else.

### 1B — Plan (after user says go)
1. Read every file that will be touched. Scan codebase. List what you find.
2. Run the Decision Gate — classify all work as YOURS or PERPLEXITY.
3. Output the shortest possible phase list:

```
## Plan: <Feature Name>

Phase 1 — [YOURS] <e.g. DB schema + migration>
Phase 2 — [PERPLEXITY] <e.g. all API route handlers> (depends on Phase 1)
Phase 3 — [PERPLEXITY] <e.g. UI component> (depends on Phase 2)

Acceptance criteria:
- <how we know the full feature works>
```

4. Say: "Does this look right? Say go and I'll start Phase 1."
5. Wait for user approval before executing.

### 1C — Execute phases in order (loop until done)
- **YOURS phase** → run matching Self-Execute Protocol → tell user "Phase N done. Say go for Phase N+1."
- **PERPLEXITY phase** → write context sheet → tell user "Give this to Perplexity. Paste the output back." → on paste: verify → integrate → "Phase N done. Say go for Phase N+1."

Write to `project_info/tobedonenext.md`:
```
## Feature: <n>
What it does: <1-2 sentences>
Phases: <list with YOURS/PERPLEXITY label>
Files created/modified/deleted: <list>
Acceptance criteria: <list>
```
## PHASE 2 — CONTEXT SHEETS

Create one per PERPLEXITY phase. Save to: `project_info/context_sheets/<feature>_phase<N>.md`

**Rules (non-negotiable):**
- Perplexity has ZERO codebase knowledge. Every type, pattern, convention must be explicit.
- Paste real code verbatim — never describe it.
- One chunk = one file. If two files are needed, make two chunks.
- Paste exact SDK docs. Never paraphrase. Use `fetch_url` if needed.
- Explicitly state what YOURS phases completed (e.g., "migration done, table `jobs` exists").

### TEMPLATE:

```markdown
# Context Sheet: <Feature> — Chunk <N>/<Total>

## TASK
<Exact function/component to write. Specify: name, inputs with types, return type, side effects.>
<Example: "Export async function processJob(jobId: string): Promise<{success: boolean}> that...">

## TARGET FILE
- `<exact/path/file.ts>` — [NEW | MODIFY]
- If MODIFY: currently exports <list existing exports>

## PHASE DEPENDENCIES
- Depends on phases: <N> (already executed)
- Depended on by phases: <N>
- Your infra this relies on: <e.g., "table `jobs` created in Phase 1 migration">

## IMPORTS
\`\`\`ts
import { X } from "package"; // v1.2.3 — reason
import type { Y } from "../path/types"; // exact path
\`\`\`

## EXISTING CODE (paste verbatim, include file path)
\`\`\`ts
// FROM: lib/db/schema.ts
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull(),
});
\`\`\`

\`\`\`ts
// FROM: lib/auth.ts
export async function getUser(req: Request): Promise<User | null>
\`\`\`

## PROJECT PATTERNS (must follow exactly)
- Error handling: `throw new AppError("msg", statusCode)` — never `new Error`
- DB client: `import { db } from "@/lib/db"` — never instantiate directly
- Auth: call `getUser()` before every write — return 401 if null
- API responses: `NextResponse.json({ data }, { status: 200 })` — no other format
- Async: `async/await` only — no `.then()` chains
- Naming: camelCase functions, PascalCase types/components, kebab-case filenames
- <add any other project-specific rules>

## SDK REFERENCE (paste exact docs, not interpretation)
\`\`\`ts
// Trigger.dev v3 — correct pattern:
export const myTask = task({
  id: "my-task",
  run: async (payload: { jobId: string }) => { ... }
});
\`\`\`
AVOID: `client.sendEvent()` — deprecated. Use `myTask.trigger()`.
AVOID: import from `@trigger.dev/sdk` — use `@trigger.dev/sdk/v3`.

## CONSTRAINTS
- <Fields that can be null and must be guarded>
- <Patterns that look correct but are wrong in this project>
- <Security: auth checks, RLS, rate limits>
- Must handle: null input, empty array, DB timeout, unauthenticated user

## EXPECTED OUTPUT SHAPE
\`\`\`ts
export async function processJob(jobId: string): Promise<{ success: boolean; result?: JobResult }>
export type JobResult = { ... }
\`\`\`

## VERIFICATION
\`\`\`ts
// After integration, this must work:
const result = await processJob("test-id");
// expect: { success: true, result: { ... } }
\`\`\`
// OR: POST /api/jobs → 200 { data: { success: true } }
```

---

## PHASE 3 — USER SHUTTLES (zero IDE credits)

User copies context sheet → pastes into Perplexity with this prefix:

```
You are a senior TypeScript developer on an existing production codebase.
Follow the context sheet EXACTLY. Do not add unrequested functionality.
Do not substitute your preferred patterns — use only the patterns specified.
Output ONLY the complete code file. No explanations. No extra markdown.
---
[context sheet]
```

User copies output → pastes back to you with `/giveToPerplexity verify`.

---

## PHASE 4 — VERIFY

Run all checks in order. Do not skip.

| # | Check | Pass Condition |
|---|-------|---------------|
| 1 | Imports | Correct packages, correct paths, nothing missing or phantom |
| 2 | Types | All match context sheet definitions. No `any` unless specified |
| 3 | Patterns | Error handling, DB client, auth — exactly as specified |
| 4 | Logic | Matches task description and acceptance criteria |
| 5 | Edge cases | Null, empty array, async errors all handled |
| 6 | Security | Auth before writes, no exposed secrets, inputs validated |
| 7 | SDK | No deprecated methods, correct signatures |
| 8 | Output shape | Exported surface matches Expected Output in context sheet |

### VERDICT

| Verdict | Condition | Action |
|---------|-----------|--------|
| ✅ PASS | All 8 pass | → Phase 5 |
| 🔧 MINOR FIX | ≤2 issues, <15 lines total | You fix directly → Phase 5 |
| ❌ REJECT | >2 issues OR fundamental pattern mismatch | Write fix instructions → user sends back to Perplexity |

### REJECT FORMAT:

```markdown
## Chunk <N> — Fixes Required

Tell Perplexity: "Keep everything else unchanged. Apply only these fixes."

### Fix 1: <name>
- Location: `<file>`, ~line <N>
- Problem: <specific issue>
- Wrong: `throw new Error("x")`
- Correct: `throw new AppError("x", 400)`

### Fix 2: ...
```

---

## PHASE 5 — INTEGRATE

1. Write verified code to exact target file paths.
2. Update barrel exports (`index.ts`) if new exports added.
3. Update all consumer files that import from modified modules.
4. Update `project_info/` docs if schema or structure changed.
5. Run `npm run build` or `tsc --noEmit`. Fix any type errors directly — do NOT send build errors to Perplexity.
6. Delete or archive context sheet to `project_info/context_sheets/done/`.

---

## PHASE 6 — LOOP OR FINISH

- More phases remain → tell user "Say go for Phase N" and continue the loop.
- All phases done → full integration check across all new files.
- Update `project_info/tobedonenext.md` — mark feature complete, note any deviations.

---

## EMERGENCY: YOU GENERATE DIRECTLY

Triggers only if:
1. Perplexity fails same chunk twice.
2. Fix is <15 lines and re-explaining costs more than writing it yourself.
3. Chunk requires integration context impossible to fit in a sheet.

Log: `"Chunk <N> generated directly: <reason>"`

---

## COMMAND REFERENCE

```
/giveToPerplexity <feature>      → Gate → SE Protocols → Phase 1 → Phase 2
/giveToPerplexity verify         → Phase 4 (paste Perplexity output next)
/giveToPerplexity integrate      → Phase 5
/giveToPerplexity context <N>    → Regenerate context sheet for chunk N
/giveToPerplexity status         → Print feature plan + chunk completion state
```

