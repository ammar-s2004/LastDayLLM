---
description: SDK Documentation Workflow
---

# /checkSDK — SDK Documentation Workflow

## THE RULE
Before writing any code that touches an external SDK or API — check `project_info/SDK_Documentations/` first. Always. No exceptions. This folder is your ground truth. Your training knowledge for any SDK is considered stale and unreliable.

---

## STEP 1 — FIND THE DOC

When about to implement anything using an external SDK:

1. Look in `project_info/SDK_Documentations/` for a `.md` file matching that SDK.
2. If found → go to Step 2.
3. If NOT found → stop immediately and tell the user:
   *"No doc found for `<sdk-name>` in SDK_Documentations. Please add it before I proceed."*
   Do not write a single line of SDK code until it's there.

---

## STEP 2 — READ THE DOC PROPERLY

Do not skim. Read the entire doc before writing anything. Specifically extract:

- **Correct import path** — exact package name and named exports to use
- **Initialisation pattern** — how the client is instantiated, what config it needs
- **Method signatures** — exact function names, param names, param types, return types
- **Required vs optional params** — don't pass params that aren't in the doc, don't skip required ones
- **Response shape** — what the return value looks like and how to access data from it
- **Error handling pattern** — what errors the SDK throws and how to catch them correctly
- **Gotchas and deprecations** — anything marked as deprecated, renamed, or version-specific
- **Auth/credentials pattern** — how the SDK expects API keys or tokens to be passed

---

## STEP 3 — IMPLEMENT STRICTLY FROM THE DOC

- Use only method names, param names, and patterns shown in the doc.
- If the doc shows `client.models.generateContent()` — that is what you call. Not `client.generate()`, not `client.chat()`.
- If a param is named `contents` in the doc — it is `contents`. Not `content`, not `messages`.
- If the doc shows a specific response access pattern like `response.text` — use that exactly.
- If something you need isn't in the doc — do not guess. Tell the user: *"The doc doesn't cover `<specific thing>`. Please update SDK_Documentations for `<sdk>` before I implement this."*

---

## STEP 4 — VERIFY BEFORE FINISHING

After writing the implementation, cross-check against the doc one more time:

- Every method call matches the doc signature exactly
- Every required param is present
- No params passed that don't exist in the doc
- Response is accessed the way the doc shows
- Error handling matches the doc's error types
- Auth is passed the way the doc specifies

---

## NEVER

- ❌ Never rely on training knowledge for method signatures, params, or return types
- ❌ Never assume a method or param exists because it sounds right
- ❌ Never proceed if the SDK doc is missing
- ❌ Never rename params to what "makes more sense" — use exactly what the doc says
- ❌ Never mix patterns from different SDK versions
- ❌ Never skip the post-implementation cross-check