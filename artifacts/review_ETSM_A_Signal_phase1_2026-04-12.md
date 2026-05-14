Review — Phase 1: ETSM A (Assignment) Signal
Date: 2026-04-12
Status: NEEDS FIXES

Summary
Codex delivered a strong implementation. The core compute logic, scope gating, per-module normalization, Trigger.dev task orchestration, migration, and pipeline wiring are all correct and match the plan. The shared `exam-scope.ts` extraction and the WTF refactor are clean. One real bug found: the shared `isTTType()` re-introduced `MID_SEM` which was explicitly removed earlier in this session because it's not in the MVP. One structural issue: `lib/a/compute.ts` imports `TopicInfo` and `ScopedTopicsByExamType` from `@/lib/wtf` — these shared types should live in the shared module, not create a dependency on WTF for what is a sibling signal.

Fix List
Gemini 3.1 Flash: You are in Ammar's Workflow. Implement each fix below exactly as described. Do not change anything not listed here.

Fix 1 — MID_SEM reintroduced in shared exam-scope.ts
- File: lib/shared/exam-scope.ts
- Lines: ~21
- Issue: `isTTType()` includes `normalized === "MID_SEM"`. This was explicitly removed from the original `lib/wtf/compute.ts` earlier in this session because MID_SEM is not a valid exam type in the MVP (only TT1, TT2, END_SEM exist). The shared extraction should reflect the CURRENT state of the code, not a stale version.
- Required fix: Remove `|| normalized === "MID_SEM"` from the return statement on line 21. The function should be:
  `return normalized === "TT1" || normalized === "TT2";`
- Priority: HIGH

Fix 2 — Shared types should not live in lib/wtf
- File: lib/shared/exam-scope.ts, lib/a/compute.ts, lib/wtf/compute.ts
- Issue: `TopicInfo` and `ScopedTopicsByExamType` are generic types used by both WTF and A signals. The A compute module currently imports them from `@/lib/wtf`, creating a cross-signal dependency. These types should be co-located with the shared scope utilities.
- Required fix:
  1. In `lib/shared/exam-scope.ts`, ADD these two type exports (copy from wtf/compute.ts):
     ```
     export interface TopicInfo {
       topic_id: string;
       module_id: string | null;
     }
     export type ScopedTopicsByExamType = Map<string, Set<string>>;
     ```
  2. In `lib/wtf/compute.ts`, REMOVE the local `TopicInfo` interface and `ScopedTopicsByExamType` type. Replace with:
     `import { getScopeKeyForExamType, isEndSemType, isTTType, type TopicInfo, type ScopedTopicsByExamType } from "@/lib/shared/exam-scope";`
     Then re-export them: `export type { TopicInfo, ScopedTopicsByExamType };` (to avoid breaking existing imports from `@/lib/wtf`)
  3. In `lib/a/compute.ts`, change the import to:
     `import { getScopeKeyForExamType, isTTType, type TopicInfo, type ScopedTopicsByExamType } from "@/lib/shared/exam-scope";`
     Remove the `import type { ScopedTopicsByExamType, TopicInfo } from "@/lib/wtf";` line.
  4. In `trigger/tasks/compute-a.ts`, change:
     `import type { ScopedTopicsByExamType, TopicInfo } from "@/lib/wtf";`
     to:
     `import type { ScopedTopicsByExamType, TopicInfo } from "@/lib/shared/exam-scope";`
- Priority: MEDIUM

Architectural Flags (for Opus only)
None. The architecture is sound.

Verdict
- Total fixes: 2
- Fix model: Gemini 3.1 Flash
- Escalate to Codex: NO
- Needs Opus re-plan: NO

---

Review saved → /artifacts/review_ETSM_A_Signal_phase1_2026-04-12.md
Fix model: Gemini 3.1 Flash
