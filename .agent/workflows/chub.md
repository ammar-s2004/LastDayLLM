---
description: hub` is a CLI that gives you curated, versioned API docs so you never hallucinate method signatures, params, or SDK patterns. **Before writing any code that touches an external SDK or API — run chub. No exceptions.**
---

# /chub — API Docs Workflow (Context Hub)

## WHAT THIS IS
`chub` is a CLI that gives you curated, versioned API docs so you never hallucinate method signatures, params, or SDK patterns. **Before writing any code that touches an external SDK or API — run chub. No exceptions.**

Install once:
```
npm install -g @aisuite/chub
```

---

## THE RULE

**Any time you are about to write code that calls an external SDK or API (OpenAI, Supabase, Trigger.dev, Qdrant, Stripe, etc.) — fetch the docs first via chub. Do not rely on training knowledge for API signatures.**

---

## WORKFLOW

### Step 1 — Check the installed version from package.json
Before fetching any doc, read `package.json` and note the exact installed version of the SDK you're about to use.

```
e.g. "triggerdev/sdk": "3.1.2"
```

### Step 2 — Search for the doc
```
chub search <sdk-name>
```
If results show the SDK → go to Step 3.
If no results → fall back to `fetch_url` on the official docs. Do not guess.

### Step 3 — Fetch docs for the exact installed version
```
chub get <id> --lang js --version <version-from-package.json>
```
e.g. `chub get triggerdev/tasks --lang js --version 3.1.2`

If that version isn't in chub, it will list available versions — pick the closest one and annotate the gap:
```
chub annotate <id> "Project uses v3.1.2 — closest available in chub is v3.0.0. Verified manually against official docs."
```

Read the output fully before writing a single line of code.

### Step 4 — Write the code
Use only what the doc shows. No assumptions beyond what you read.

### Step 5 — Annotate if you hit a gap
```
chub annotate <id> "<what you discovered>"
```

### Step 6 — Vote
```
chub feedback <id> up    # doc was accurate
chub feedback <id> down  # doc was wrong or incomplete
```

---

## VERSION UPGRADE FLOW

When the user wants to upgrade an SDK to a newer version:

1. Read `package.json` — note current version.
2. Run `chub search <sdk>` → `chub get <id> --lang js` (no version flag = fetches latest recommended version).
3. Read the doc. Note every breaking change, renamed method, or removed param.
4. Check existing annotation on this doc — it may already list known gotchas from a previous upgrade.
5. Identify every file in the codebase that imports or calls this SDK.
6. Apply changes file by file — only touch what the diff requires.
7. Annotate any version-specific quirks discovered:
```
chub annotate <id> "Upgraded from v3.1.2 → v4.0.0. trigger() now requires payload schema declared upfront."
```
8. Tell user: *"Upgraded. Run the build and test suite. Here's what changed: [list]"*

---

## WHEN TO USE CHUB

| Situation | Action |
|-----------|--------|
| Writing code with any external SDK for the first time in a session | Always run chub |
| You're unsure about a method signature or param name | Run chub before guessing |
| SDK was recently added to the project | Run chub |
| You're updating code that uses an existing SDK | Run chub to check for version changes |
| Pure internal business logic, no external APIs | Skip chub |

---

## ANNOTATION RULES

- Annotate **immediately** when you discover something the doc doesn't cover.
- Keep annotations short and specific: what the gap was, what the fix is.
- Check existing annotations before coding — they show up automatically on `chub get`.
- Never delete an annotation unless it's been fixed upstream and you've verified with `chub get`.

---

## COMMAND REFERENCE

```
chub search <query>              → find available docs
chub get <id> --lang js          → fetch doc (always use --lang js for this project)
chub get <id> --file <ref>       → fetch a specific sub-section of a doc
chub annotate <id> "<note>"      → add a local note to a doc
chub annotate <id> --clear       → remove your annotation
chub annotate --list             → see all your annotations
chub feedback <id> up|down       → vote on doc quality
chub help                        → full CLI reference
```

---

## NEVER DO

- ❌ Never write code calling an external API from memory — always chub first.
- ❌ Never assume a method exists because it "sounds right" — verify with chub.
- ❌ Never skip chub because you "just used this SDK recently" — annotations may have changed, docs may have updated.