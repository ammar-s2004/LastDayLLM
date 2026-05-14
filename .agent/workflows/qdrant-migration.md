---
description: This workflow defines how the AI agent interacts with Qdrant to ensure safety, consistency, and no accidental data loss.
---

# Qdrant Migration Workflow (Strict)

This workflow defines how the AI agent interacts with Qdrant to ensure safety, consistency, and no accidental data loss.

**CORE PHILOSOPHY**: Qdrant has no native migration CLI. All "migrations" are TypeScript scripts. The AI agent writes the script — the user runs it manually from the IDE terminal. The AI never executes destructive operations directly.

**KEY QDRANT REALITY**: Some changes are **irreversible**. Vector dimensions, distance metrics, and quantization configs cannot be changed on an existing collection — you must delete and recreate it, which destroys all data. Treat these as destructive migrations and flag them explicitly.

---

## 1. READ ANYTIME (Safe)

You have full permission to inspect Qdrant state at any time.

- **Tools** (via Qdrant MCP or REST):
  - List all collections: `GET /collections`
  - Inspect a collection: `GET /collections/{name}` — returns vector config, indexing status, point count
  - Check collection aliases: `GET /aliases`
  - Count points: `POST /collections/{name}/points/count`
  - Scroll points (sample data): `POST /collections/{name}/points/scroll`

- **Constraint**: Read-only. Do not create, delete, or modify collections/indexes/points during a read phase.

---

## 2. FOR SCHEMA CHANGES (Migration Script Creation)

When a Qdrant change is required (new collection, payload index, alias, quantization config):

### 2A — Classify the change first

| Change Type | Reversible? | Risk |
|-------------|------------|------|
| Create new collection | ✅ Yes | Low |
| Add payload index | ✅ Yes | Low |
| Remove payload index | ✅ Yes | Low |
| Create / update alias | ✅ Yes | Low |
| Update collection `optimizers_config` / `hnsw_config` | ✅ Yes | Low |
| Change vector dimension | ❌ **NO** | **DESTRUCTIVE — data loss** |
| Change distance metric | ❌ **NO** | **DESTRUCTIVE — data loss** |
| Change quantization config | ❌ **NO** | **DESTRUCTIVE — data loss** |
| Delete collection | ❌ **NO** | **DESTRUCTIVE — data loss** |

If the change is **DESTRUCTIVE**: stop, explain the consequence to the user, and get explicit confirmation before writing the script.

### 2B — Analyze current state

Before writing any script, inspect the current collection state:
1. Check if the collection already exists.
2. Check existing vector config (dimension, distance, quantization).
3. Check existing payload indexes.
4. Note current point count — warn user if destructive migration affects non-empty collection.

### 2C — Write the migration script

- **Location**: `scripts/qdrant/`
- **Naming**: `YYYYMMDDHHMMSS_description.ts`
- **Runner**: `npx tsx` (no compile step needed)

**Script template:**

```ts
// scripts/qdrant/20260120120000_description.ts
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({
  url: process.env.QDRANT_URL ?? "http://localhost:6333",
  apiKey: process.env.QDRANT_API_KEY,
});

async function migrate() {
  console.log("🔍 Checking current state...");
  // 1. Read current state first
  const collections = await client.getCollections();
  console.log("Existing collections:", collections.collections.map(c => c.name));

  // 2. Guard — idempotent check
  const exists = collections.collections.some(c => c.name === "your_collection");
  if (exists) {
    console.log("✅ Already exists, skipping.");
    return;
  }

  // 3. Execute change
  console.log("🚀 Creating collection...");
  await client.createCollection("your_collection", {
    vectors: {
      size: 1536,
      distance: "Cosine",
    },
  });

  // 4. Verify
  const info = await client.getCollection("your_collection");
  console.log("✅ Created:", info.config);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
```

**Script rules:**
- Always read current state before making changes (idempotency guard).
- Always verify after making changes.
- Use `process.exit(1)` on failure so the terminal shows a clear error.
- Log each step — user must be able to see exactly what ran.
- For destructive scripts: add a `DRY_RUN` env flag that logs what would happen without executing.

### 2D — Notify user

After writing the script:
1. Tell the user the script was created and what it does.
2. If destructive: clearly state what data will be lost and ask for confirmation.
3. **STOP**. Do not run it.
4. Tell the user to run:

```bash
npx tsx scripts/qdrant/YYYYMMDDHHMMSS_description.ts
```

---

## 3. AFTER USER RUNS THE SCRIPT (Verification)

Once the user confirms it ran:

1. **Verify collection state**: Inspect the collection via MCP or REST — confirm the change exists.
2. **Verify indexes**: Check payload indexes are present if they were created.
3. **Verify aliases**: Confirm alias points to correct collection.
4. **Verify point count**: If migration was non-destructive, confirm point count is unchanged.
5. **Report**: Confirm to user the database is in the desired state. Mark task complete.

---

## 4. STRICT PROHIBITIONS (NEVER DO)

- ❌ **NEVER** delete a collection directly from agent code without a user-approved script.
- ❌ **NEVER** recreate a collection (delete + create) without explicitly warning the user that all vectors will be lost.
- ❌ **NEVER** run the migration script yourself. Write it. The user runs it.
- ❌ **NEVER** modify vector dimension, distance metric, or quantization on an existing collection by deleting it silently — always flag as DESTRUCTIVE.
- ❌ **NEVER** write a script without an idempotency guard (`if already exists → skip`).
- ❌ **NEVER** use hardcoded `localhost:6333` without falling back to `QDRANT_URL` env var.

---

## 5. DESTRUCTIVE MIGRATION PATTERN (Delete + Recreate)

Only use this when vector config must change. Always use aliases to enable zero-downtime swap.

```ts
// DESTRUCTIVE — backs up nothing, data will be lost
// User confirmed: yes, proceed

async function destructiveMigrate() {
  const OLD = "documents";
  const NEW = "documents_v2";
  const ALIAS = "documents_live";

  // 1. Create new collection with updated config
  await client.createCollection(NEW, {
    vectors: { size: 3072, distance: "Cosine" }, // new dimension
  });

  // 2. [User re-indexes data into NEW collection separately]
  // Do NOT do this in the migration script — that's application logic

  // 3. Swap alias atomically
  await client.updateCollectionAliases({
    actions: [
      { delete_alias: { alias_name: ALIAS } },
      { create_alias: { collection_name: NEW, alias_name: ALIAS } },
    ],
  });

  // 4. Optionally delete old (only after user confirms new is working)
  // await client.deleteCollection(OLD);

  console.log("✅ Alias swapped. Old collection still exists — delete manually when ready.");
}
```

---

## 6. EXAMPLE SCENARIOS

### Scenario A: Adding a payload index
1. **Agent**: Inspects `documents` collection. Sees no index on `user_id` field.
2. **Agent**: Creates `scripts/qdrant/20260120120000_add_user_id_index.ts`.
3. **Agent**: "Created the script. Run: `npx tsx scripts/qdrant/20260120120000_add_user_id_index.ts`"
4. **User**: Runs it. "Done."
5. **Agent**: Verifies index exists on `user_id`. Confirms complete.

### Scenario B: Changing vector dimension (destructive)
1. **Agent**: User asks to change vector size from 1536 → 3072.
2. **Agent**: "⚠️ This is destructive. The `documents` collection has 142,000 points — all will be deleted. You'll need to re-index everything. Confirm?"
3. **User**: "Yes, confirmed."
4. **Agent**: Creates `scripts/qdrant/20260120130000_recreate_documents_3072.ts` with alias swap pattern.
5. **Agent**: "Script created. Run it ONLY after you're ready to re-index. Command: `npx tsx scripts/qdrant/20260120130000_recreate_documents_3072.ts`"