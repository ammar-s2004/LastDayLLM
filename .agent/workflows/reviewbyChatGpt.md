---
description: Static Analysis Workflow (ChatGPT Codex)
---

# /reviewByGPT — Static Analysis Workflow (ChatGPT Codex)

## WHAT THIS IS
When triggered, you output a prompt in chat for the user to paste into Codex. No file reading. No git diff. You already know what was built — use that context.

---

## TRIGGER
```
/reviewByGPT <feature-name>
```

---

## WHAT YOU DO

From your current conversation context, pull:
- What the feature was supposed to do (the plan)
- What files were added or modified
- What the expected behaviour is

Then output this prompt in chat, filled in. User copies it into Codex.

---

## THE PROMPT YOU OUTPUT IN CHAT

```
Feature: <feature-name>
Description: <one line — what this feature is>

What was planned:
<the original plan for this feature in 2-3 sentences>

Files added/modified:
- <path/to/file.ts> — <what it does>

Expected behaviour:
- <bullet list of what should work when this feature is complete>

Please do a deep static analysis of the files listed above covering:
1. Syntactical correctness & type safety
2. Logical soundness & async correctness
3. Regression risk — does this break anything existing
4. Type & schema alignment
5. SDK & framework compliance
6. Security & auth — missing checks, unvalidated input, exposed secrets
7. Performance — N+1s, unbounded loops, blocking ops
8. Error handling — unhandled rejections, silent failures, missing fallbacks
9. Integration — import paths, circular deps, API contract mismatches
10. State & data flow — race conditions, stale closures, side effects
11. Dependency issues — wrong versions, deprecated APIs

Save the report to: reviewByChatGpt/<feature-name>.md

Do NOT modify any code. Report only.

Use this format:
# Code Review: <feature-name>
**Verdict**: [PASS | NEEDS FIXES]

## Summary
<2-3 sentences>

## Issues Found

### Critical
| # | File | Location | Category | Issue | Recommendation |
|---|------|----------|----------|-------|----------------|

### Warnings
| # | File | Location | Category | Issue | Recommendation |
|---|------|----------|----------|-------|----------------|

### Info
| # | File | Location | Category | Issue | Recommendation |
|---|------|----------|----------|-------|----------------|

## Category Scores
| Category | Score |
|----------|-------|
| 1. Syntactical Correctness | x/10 |
| 2. Logical Soundness | x/10 |
| 3. Regression Risk | x/10 |
| 4. Type & Schema Alignment | x/10 |
| 5. SDK & Framework Compliance | x/10 |
| 6. Security & Auth | x/10 |
| 7. Performance | x/10 |
| 8. Error Handling | x/10 |
| 9. Integration | x/10 |
| 10. State & Data Flow | x/10 |
| 11. Dependencies | x/10 |
| **Overall** | x/10 |

## Risks If Shipped As-Is
- <bullet list>
```

---

## COMMAND REFERENCE
```
/reviewByGPT <feature>    → outputs the Codex prompt in chat
```

---

## AFTER USER SAYS "review done"

1. Read `reviewByChatGpt/<feature-name>.md`.
2. Go through every issue — decide for each one: is this valid, is the recommendation correct, does it fit the project patterns?
3. Apply fixes you're confident about directly.
4. Flag anything that needs a user decision (e.g. requires a schema change, behaviour change, or you disagree with Codex's suggestion) and explain why.
5. Tell the user what you applied, what you skipped, and why.