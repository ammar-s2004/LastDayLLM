---
description: Multi-model, credit-efficient, phase-based development pipeline. Ammar controls the pace. Models execute their role. No model decides what happens next.
---

# Ammar's Workflow — Master Reference

Multi-model, credit-efficient, phase-based development pipeline.  
**Ammar controls the pace. Models execute their role. No model decides what happens next.**

---

## How It Actually Works

Opus writes one big plan — as many phases as the feature needs. That plan lives in `/artifacts/`.  
Ammar reads it, decides which phase to execute, and kicks off the loop for that phase.  
Every phase goes through the full loop independently before the next one starts.

```
OPUS writes full plan (all phases)
        ↓
Ammar picks Phase N
        ↓
CODEX implements Phase N
        ↓
Gemini 3.1 Pro reviews Phase N
        ↓
Gemini 3.1 Flash fixes Phase N
        ↓
OPUS signs off Phase N
        ↓
Ammar picks Phase N+1 → repeat
```

Ammar is the one moving between steps. No model auto-triggers the next.

---

## Model Roles

| Model | Role | What it produces |
|-------|------|-----------------|
| Opus | Architect + Planner + Sign-off | Full multi-phase plan artifact |
| Codex | Implementer | Code — one phase at a time |
| Gemini 3.1 Pro | Static Reviewer | Bug report + model recommendation |
| Gemini 3.1 Flash | Fix Implementer | Patched code from Sonnet's list |

**Opus** — Plans the entire project upfront. No code. Ever. Signs off each phase when done.  
**Codex** — Implements only the phase Ammar hands it. No decisions. No looking ahead.  
**Gemini 3.1 Pro** — Reviews only the phase just implemented. Reports bugs, recommends one model to fix. No fixes, no rewrites.  
**Gemini 3.1 Flash** — Implements only what gemini pro listed. Nothing else.

---

## Artifact Directory

```
/artifacts/[TITLE]_[YYYY-MM-DD].md               ← Full Opus plan (all phases)
/artifacts/review_[TITLE]_phase[N]_[DATE].md      ← Sonnet review per phase
```

This is the shared context layer. Codex and Flash are external tools that can't see the conversation. Files in `/artifacts/` are how they receive their instructions.

---

## When to Skip Steps

- **Skip Gemini 3.1 FLash** if Gemini 3.1 pro returns `Status: CLEAR`
- **Skip Gemini 3.1 pro re-run** after fixes — trust that the fix model did its job
- **Loop back to Opus** only if Gemini 3.1 pro flags an architectural issue — not for regular bugs

---

## Workflow Files

```
/opus-4.6.md      ← paste into Opus at start of session
/gpt-codex.md     ← paste into Codex + tell it which phase to execute
/gemini-3.1-Pro.md    ← paste into gemini 3.1 pro + give it the files Codex touched
/gemini-3.1-Flash.md     ← paste into Flash + give it the review artifact path
```

---

## Credit Logic

- Opus runs once per project (full plan) + once per phase (sign-off)
- Codex does the heavy lifting — no LLM credits
- Gemini Pro runs once per phase — one focused review pass
- Gemini Flash runs once per phase — small targeted fixes only