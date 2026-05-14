# Sub-Topic Promotion — Codex Execution Plan

**Date**: 2026-04-22  
**Architect**: Opus  
**Your role**: Implement Phases 2, 3, and 4 exactly as described below. Phase 1 (migrations + resolver) is already done.

---

## CONTEXT: What Phase 1 Already Did

The database now has:
- `topics.parent_topic_id` — self-referencing FK. NULL = parent heading, non-null = child (promoted sub-topic)
- ~13 parent rows + ~106 child rows in `topics`
- All signal tables are **empty** (cleared during migration)
- `save_module_with_topics_secure` RPC now creates both parent AND child rows
- `lib/shared/resolve-children.ts` — a utility that maps parent IDs → child UUIDs

**The resolver function signature** (already exists at `lib/shared/resolve-children.ts`):
```typescript
resolveChildTopicIds(
  supabase: SupabaseClient,
  scopeEntries: Array<{ topic_id: string; selected_sub_topics: string[] | null }>
): Promise<string[]>
```

---

## DO NOT TOUCH THESE FILES

- `app/api/exam-scopes/route.ts` — continues passing parent IDs
- `lib/etsm/engine.ts` — generic, ranks whatever TopicData[] it receives
- `lib/etsm/types.ts` — no changes needed
- `trigger/tasks/run-prediction.ts` — no changes needed
- `trigger/tasks/compute-te.ts` — not in scope
- `trigger/tasks/process-notes-qdrant.ts` — not in scope
- `supabase/migrations/*` — all migrations are already written and pushed

---

## Phase 2: SP Signal at Sub-Topic Level

### 2A. MODIFY `lib/ai-prompts.ts` — function `buildSPPrompt()` (starts at line 334)

**Current** response schema in the prompt:
```json
{ "scores": [{ "module": 1, "topic_name": "...", "centrality_score": 0.95 }] }
```

**Change to**:
```json
{ "scores": [{ "module": 1, "topic_name": "Parent Name", "subtopic_name": "Child Name", "centrality_score": 0.95 }] }
```

Changes to make:
1. Change instruction from "Score domain centrality for each topic" → "Score domain centrality for each **sub-topic** within its module context"
2. Update the example JSON in the prompt to include `subtopic_name`
3. Add rules:
   - `subtopic_name must exactly match the input subtopic string`
   - `If a topic has no subtopics, use the topic name for BOTH topic_name and subtopic_name`

The `scope` input structure already includes subtopics — don't change the input format.

### 2B. MODIFY `lib/sp/compute.ts` (entire file, 115 lines)

1. **Update `SPModuleInput` interface** (line 6-10):
   Add `parentName` to topics:
   ```typescript
   export interface SPModuleInput {
     moduleNo: number;
     moduleTitle: string;
     topics: Array<{ id: string; name: string; subtopics: string[]; parentName?: string }>;
   }
   ```

2. **Update `SPPromptResponse` interface** (line 19-25):
   Add `subtopic_name`:
   ```typescript
   interface SPPromptResponse {
     scores?: Array<{
       module: number;
       topic_name: string;
       subtopic_name: string;
       centrality_score: number;
     }>;
   }
   ```

3. **Update `topicLookup` map** (line 80-88):
   Change key to include parentName:
   ```typescript
   const topicLookup = new Map<string, { id: string; name: string; moduleNo: number }>();
   for (const module of modules) {
     for (const topic of module.topics) {
       const parentKey = topic.parentName ?? topic.name;
       topicLookup.set(
         `${module.moduleNo}::${normalizeTopicName(parentKey)}::${normalizeTopicName(topic.name)}`,
         { id: topic.id, name: topic.name, moduleNo: module.moduleNo }
       );
     }
   }
   ```

4. **Update matching** (line 93-103):
   ```typescript
   const key = `${item.module}::${normalizeTopicName(item.topic_name)}::${normalizeTopicName(item.subtopic_name)}`;
   ```

5. **Update `buildSPPrompt` call** (line 51-60):
   The scope needs to carry parent grouping. Build it as:
   ```typescript
   // Group child topics by parent for the prompt
   const parentGroups = new Map<string, { name: string; subtopics: string[] }>();
   for (const topic of module.topics) {
     const parentKey = topic.parentName ?? topic.name;
     const existing = parentGroups.get(parentKey) ?? { name: parentKey, subtopics: [] };
     if (topic.parentName) {
       existing.subtopics.push(topic.name);
     }
     parentGroups.set(parentKey, existing);
   }
   ```
   Then pass `Array.from(parentGroups.values())` as the topics in the scope.

### 2C. MODIFY `trigger/tasks/compute-sp.ts` (lines 47-155)

The payload `topicIds` contains **parent** topic IDs (from `exam-scopes/route.ts`). Must resolve to children.

1. **Add import** at top:
   ```typescript
   import { resolveChildTopicIds } from "@/lib/shared/resolve-children";
   ```

2. **After the payload check** (after line 58), resolve parent IDs to child IDs:
   ```typescript
   // Resolve parent topic IDs to child (sub-topic) IDs
   const scopeEntries = payload.topicIds.map(id => ({ topic_id: id, selected_sub_topics: null }));
   const childTopicIds = await resolveChildTopicIds(supabase, scopeEntries);

   if (childTopicIds.length === 0) {
     logger.warn("[compute-sp] No child topics found after resolution, skipping");
     return { success: true, scoredTopics: 0 };
   }
   ```

3. **Change the topics query** (line 69-71):
   Replace `.in("id", payload.topicIds)` with `.in("id", childTopicIds)`

4. **Fetch parent names** (add new query):
   ```typescript
   const { data: parentTopics } = await supabase
     .from("topics")
     .select("id, name")
     .is("parent_topic_id", null)
     .eq("subject_id", payload.subjectId);

   const parentNameMap = new Map(
     (parentTopics ?? []).map(p => [p.id, p.name])
   );
   ```

5. **Update TopicRow type** (line 12-17):
   Add `parent_topic_id: string | null`

6. **Build spModules** (line 95-105):
   Each child topic entry should include its parent name:
   ```typescript
   topics: (topicsByModule.get(module.id) ?? []).map((topic) => ({
     id: topic.id,
     name: topic.name,
     subtopics: [],  // Children don't have sub-subtopics
     parentName: topic.parent_topic_id
       ? parentNameMap.get(topic.parent_topic_id)
       : undefined,
   })),
   ```

7. **Update topicById map** (line 86):
   This stays the same — it now maps child IDs.

### Done criteria (Phase 2):
- `buildSPPrompt` asks for `subtopic_name` in response
- `compute-sp` task resolves parent IDs → child IDs before scoring
- `topic_sp_scores` rows have child topic IDs

---

## Phase 3: Question Extraction + WTF/A Signals

### 3A. MODIFY `trigger/tasks/process-questions.ts`

**LOAD TOPICS section** (lines 380-426):

1. **Add import** at top (near line 57):
   ```typescript
   import { resolveChildTopicIds } from "@/lib/shared/resolve-children";
   ```

2. **Replace the entire topics loading block** (lines 382-424):

   ```typescript
   // Resolve parent topic IDs to child (sub-topic) IDs
   const scopeEntries = allowedTopicIds.map(id => ({
     topic_id: id,
     selected_sub_topics: null,
   }));
   const childTopicIds = await resolveChildTopicIds(supabaseWorker, scopeEntries);

   if (childTopicIds.length === 0) {
     throw new Error("No child topics found after resolution");
   }

   // Fetch child topic rows
   const { data: childTopics } = await supabaseWorker
     .from("topics")
     .select("id, name, parent_topic_id")
     .in("id", childTopicIds);

   if (!childTopics?.length) {
     throw new Error("No child topics found in database");
   }

   // Fetch parent names for "Parent > Child" format
   const parentIdsFromChildren = [
     ...new Set(
       childTopics
         .filter(t => t.parent_topic_id)
         .map(t => t.parent_topic_id as string)
     ),
   ];

   let parentNameMap = new Map<string, string>();
   if (parentIdsFromChildren.length > 0) {
     const { data: parents } = await supabaseWorker
       .from("topics")
       .select("id, name")
       .in("id", parentIdsFromChildren);
     parentNameMap = new Map((parents ?? []).map(p => [p.id, p.name]));
   }

   // Build topic map: child name → child ID (single map, no subTopicMap)
   const topicMap = new Map(
     childTopics.map(t => [normalize(t.name), t.id])
   );

   // Build expanded topic lines for AI grounding
   const expandedTopicLines: string[] = childTopics.map(t => {
     const parentName = t.parent_topic_id
       ? parentNameMap.get(t.parent_topic_id)
       : null;
     return parentName ? `${parentName} > ${t.name}` : t.name;
   });

   const topicsList = expandedTopicLines
     .map((line, i) => `${i + 1}. ${line}`)
     .join("\n");

   logger.info(`Loaded ${childTopics.length} child topics for matching`);
   ```

3. **Replace the LINK QUESTIONS ↔ TOPICS section** (lines 700-760):

   Delete the `subTopicMap`, `topicNames` map, and the 3-pass resolution. Replace with:

   ```typescript
   allQuestions.forEach(q => {
     const questionId = questionIdMap.get(`${q.resource_id}-${q.question_no}`);
     if (!questionId) return;

     q.topics.forEach((t: any) => {
       const rawName: string = t.topic_name;

       // Resolution: direct child name match
       let matchedTopicId: string | undefined = topicMap.get(normalize(rawName));

       // If AI returned "Parent > Child" format, extract child part
       if (!matchedTopicId && rawName.includes(" > ")) {
         const childPart = rawName.split(" > ").pop()?.trim();
         if (childPart) matchedTopicId = topicMap.get(normalize(childPart));
       }

       if (matchedTopicId) {
         links.push({
           question_id: questionId,
           topic_id: matchedTopicId,
           relevance: t.relevance,
         });

         linksByResource.set(
           q.resource_id,
           (linksByResource.get(q.resource_id) || 0) + 1
         );
       } else {
         skippedTopics++;
       }
     });
   });
   ```

### 3B. `trigger/tasks/compute-wtf.ts` — NO CHANGES NEEDED

WTF already fetches all topics for the subject and computes frequency from `question_topics`. Since questions now link to child IDs and children exist in `topics`, WTF scores children automatically.

### 3C. `trigger/tasks/compute-a.ts` — NO CHANGES NEEDED

Same reasoning as WTF. Assignment signal uses the same `question_topics` links.

### Done criteria (Phase 3):
- `process-questions.ts` resolves parents to children before loading
- `topicMap` built from child names only (no `subTopicMap`)
- `question_topics` inserts use child UUIDs
- WTF/A compute functions naturally score children

---

## Phase 4: ETSM Collect + Predictions API

### 4A. MODIFY `lib/etsm/collect.ts`

1. **Update TopicRow type** (line 8-11):
   ```typescript
   type TopicRow = {
     id: string;
     module_id: string | null;
     parent_topic_id: string | null;
   };
   ```

2. **Update topics query** (line 77):
   Add `parent_topic_id` to select:
   ```typescript
   supabase.from("topics").select("id, module_id, parent_topic_id").eq("subject_id", subjectId),
   ```

3. **Filter scorable topics** (line 201, inside the for loop):
   Add filter before pushing to `topics` array:
   ```typescript
   for (const topic of topicRows) {
     if (!topic.module_id) {
       console.warn("[collectSignals] Topic missing module_id, skipping", { topic_id: topic.id });
       continue;
     }

     // Skip parent headings that have children — they're not scored
     if (topic.parent_topic_id === null) {
       const hasChildren = topicRows.some(t => t.parent_topic_id === topic.id);
       if (hasChildren) continue;
     }

     topics.push({
       topic_id: topic.id,
       module_id: topic.module_id,
       signals: {
         SP: spMap.get(topic.id) ?? 0,
         NC: ncMap.get(topic.id) ?? 0,
         WTF: wtfMap.get(topic.id) ?? 0,
         TE: teMap.get(topic.id) ?? 0,
         A: aMap.get(topic.id) ?? 0,
       },
     });
   }
   ```

### 4B. MODIFY `app/api/predictions/route.ts` (line 101-103)

Change the select query from:
```typescript
.select("*, topics(name, module_id)")
```

To:
```typescript
.select("*, topics(name, module_id, parent_topic_id, parent:topics!parent_topic_id(name))")
```

This adds `topics.parent.name` (parent heading name) to each score for UI grouping.

### Done criteria (Phase 4):
- `collectSignals` skips parent headings that have children
- Predictions API returns `topics.parent.name` for grouping
- End-to-end: scope → SP → questions → WTF/A → predict → GET predictions shows children grouped by parent
