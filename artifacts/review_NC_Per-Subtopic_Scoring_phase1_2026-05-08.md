Review — Phase 1: Update AI Prompt Constraints
Date: 2026-05-08
Status: NEEDS FIXES

Summary
Codex successfully implemented the `tc` (topic_coverage) prompt modifications by adding the `st` (subtopic) field and explicitly handling leaf parents where the parent topic name is used for both `t` and `st`. However, a legacy constraint remains in the prompt that directly contradicts the new strict `t` (parent) and `st` (subtopic) separation rules, which could cause AI hallucinations during extraction.

Fix List
Gemini 3.1 Flash: You are in Ammar's Workflow. Implement each fix below exactly as described. Do not change anything not listed here.

Fix 1 — Remove Contradictory Legacy Constraint
- File: `lib/ai-prompts.ts`
- Lines: ~330-331
- Issue: The constraint `- Use child-topic names (e.g., "Static Unit Testing"), not parent names (e.g., "Unit Testing"), unless the parent itself is the only topic at that level.` contradicts the new `tc` rules which explicitly require `t` to be the parent and `st` to be the child.
- Required fix: Delete those two lines entirely. The new constraints `- For tc, t MUST be the exact parent topic name and st MUST be the exact subtopic name.` and `- If a topic has no sub_topics, use the parent topic name for BOTH t and st.` fully handle the naming rules safely.
- Priority: HIGH

Verdict
- Total fixes: 1
- Fix model: Gemini 3.1 Flash
- Escalate to Codex: NO
- Needs Opus re-plan: NO
