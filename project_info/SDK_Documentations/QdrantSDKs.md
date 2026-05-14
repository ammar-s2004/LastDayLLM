# Qdrant JS SDK Reference (`@qdrant/js-client-rest`)

## Setup

```ts
import { QdrantClient } from "@qdrant/js-client-rest";

// Local
const client = new QdrantClient({ host: "localhost", port: 6333 });

// Cloud
const client = new QdrantClient({
  url: "https://xyz-example.qdrant.io",
  apiKey: "<your-api-key>",
});
```

---

## Collections

### Create
```ts
// Single vector
client.createCollection("my_collection", {
  vectors: { size: 1536, distance: "Cosine" }, // distance: "Cosine" | "Dot" | "Euclid" | "Manhattan"
});

// Multiple named vectors
client.createCollection("my_collection", {
  vectors: {
    image: { size: 512, distance: "Cosine" },
    text:  { size: 1536, distance: "Dot" },
  },
});

// Sparse vectors
client.createCollection("my_collection", {
  sparse_vectors: {
    text: {},
  },
});

// With metadata (v1.16.0+)
client.createCollection("my_collection", {
  vectors: { size: 1536, distance: "Cosine" },
  metadata: { "project": "lastdayllm", "version": 1 },
});
```

### Check / Delete / List
```ts
await client.collectionExists("my_collection");    // → { exists: boolean }
await client.deleteCollection("my_collection");
await client.getCollections();                     // list all
await client.getCollection("my_collection");       // info + config
```

### Update
```ts
// Disable indexing during bulk upload, re-enable after
client.updateCollection("my_collection", {
  optimizers_config: { indexing_threshold: 0 },    // disable
});
client.updateCollection("my_collection", {
  optimizers_config: { indexing_threshold: 20000 }, // re-enable
});
```

### Aliases (zero-downtime collection swap)
```ts
// Create alias
client.updateCollectionAliases({
  actions: [{ create_alias: { collection_name: "my_v2", alias_name: "my_live" } }],
});

// Atomic swap (delete old + create new in one request)
client.updateCollectionAliases({
  actions: [
    { delete_alias: { alias_name: "my_live" } },
    { create_alias: { collection_name: "my_v3", alias_name: "my_live" } },
  ],
});

client.getCollectionAliases("my_collection");
client.getAliases();
```

---

## Points

### Upsert
```ts
// Record-oriented (most common)
client.upsert("my_collection", {
  points: [
    { id: 1, vector: [0.1, 0.2, ...], payload: { text: "hello", user_id: "abc" } },
    { id: "uuid-string", vector: [0.3, 0.4, ...], payload: { text: "world" } },
  ],
});

// Named vectors
client.upsert("my_collection", {
  points: [
    {
      id: 1,
      vector: {
        image: [0.1, 0.2, 0.3, 0.4],
        text:  [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2],
      },
    },
  ],
});

// Sparse vectors
client.upsert("my_collection", {
  points: [
    {
      id: 1,
      vector: {
        text: { indices: [6, 7, 42], values: [1.0, 2.0, 0.5] },
      },
    },
  ],
});

// Batch-oriented (column format)
client.upsert("my_collection", {
  batch: {
    ids: [1, 2, 3],
    vectors: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
    payloads: [{ color: "red" }, { color: "green" }, { color: "blue" }],
  },
});

// insert_only — skip if id exists (v1.17.0+)
client.upsert("my_collection", {
  points: [{ id: 1, vector: [...], payload: {} }],
  update_mode: "insert_only",  // "upsert" | "insert_only" | "update_only"
});

// Conditional update (v1.16.0+) — only update if condition is met
client.upsert("my_collection", {
  points: [{ id: 1, vector: [...], payload: { version: 3 } }],
  update_filter: {
    must: [{ key: "version", match: { value: 2 } }],
  },
});
```

### Retrieve
```ts
client.retrieve("my_collection", { ids: [0, 3, 100] });
// GET /collections/{name}/points/{id}  for single point
```

### Update vectors (without replacing the point)
```ts
client.updateVectors("my_collection", {
  points: [
    { id: 1, vector: { image: [0.1, 0.2, 0.3, 0.4] } },
  ],
});
```

### Delete
```ts
// By IDs
client.delete("my_collection", { points: [0, 3, 100] });

// By filter
client.delete("my_collection", {
  filter: { must: [{ key: "color", match: { value: "red" } }] },
});
```

### Scroll (iterate all or filtered points)
```ts
client.scroll("my_collection", {
  filter: { must: [{ key: "user_id", match: { value: "abc" } }] },
  limit: 100,
  with_payload: true,
  with_vector: false,
  // offset: next_page_offset from previous response
});
// Response includes next_page_offset — null means last page

// Order by payload field (requires payload index on that field)
client.scroll("my_collection", {
  limit: 50,
  order_by: "created_at",   // or { key: "created_at", direction: "desc", start_from: 123 }
});
```

### Count
```ts
client.count("my_collection", {
  filter: { must: [{ key: "status", match: { value: "active" } }] },
  exact: true,
});
// → { count: 3811 }
```

### Batch update
```ts
client.batchUpdate("my_collection", {
  operations: [
    { upsert: { points: [{ id: 1, vector: [1, 2, 3, 4], payload: {} }] } },
    { set_payload: { payload: { status: "done" }, points: [1] } },
    { delete_payload: { keys: ["tmp_field"], points: [1] } },
    { clear_payload: { points: [1] } },
    { delete: { points: [1] } },
  ],
});
```

---

## Search

### Basic vector search
```ts
// Dense vector
const results = await client.query("my_collection", {
  query: [0.2, 0.1, 0.9, 0.7],
  limit: 10,
});

// With filter
const results = await client.query("my_collection", {
  query: [0.2, 0.1, 0.9, 0.7],
  filter: {
    must: [{ key: "user_id", match: { value: "abc" } }],
  },
  limit: 10,
  with_payload: true,
  with_vector: false,
});

// Named vector
client.query("my_collection", {
  query: [0.2, 0.1, 0.9, 0.7],
  using: "image",
  limit: 5,
});

// Sparse vector
client.query("my_collection", {
  query: { indices: [1, 3, 5, 7], values: [0.1, 0.2, 0.3, 0.4] },
  using: "text",
  limit: 5,
});

// Search by existing point id (skip re-embedding)
client.query("my_collection", {
  query: "43cf51e2-8777-4f52-bc74-c2cbde0c8b04",
  limit: 5,
});

// Score threshold — exclude low-similarity results
client.query("my_collection", {
  query: [0.2, 0.1, 0.9, 0.7],
  score_threshold: 0.75,
  limit: 10,
});

// With payload filtering in response
client.query("my_collection", {
  query: [0.2, 0.1, 0.9, 0.7],
  with_payload: ["field1", "field2"],    // include only these fields
  // with_payload: { exclude: ["big_field"] },  // or exclude
});

// Pagination
client.query("my_collection", {
  query: [0.2, 0.1, 0.9, 0.7],
  limit: 10,
  offset: 100,   // ⚠️ large offsets are slow — HNSW must scan offset+limit internally
});

// Random sample (v1.11.0+)
client.query("my_collection", {
  query: { sample: "random" },
});
```

### Batch search
```ts
client.queryBatch("my_collection", {
  searches: [
    { query: [0.2, 0.1, 0.9, 0.7], filter: { must: [{ key: "city", match: { value: "Berlin" } }] }, limit: 3 },
    { query: [0.5, 0.3, 0.2, 0.3], filter: { must: [{ key: "city", match: { value: "Berlin" } }] }, limit: 3 },
  ],
});
// → array of results, one per search
```

### Grouping (deduplicate by field, e.g. document chunks)
```ts
client.queryGroups("my_collection", {
  query: [0.2, 0.1, 0.9, 0.7],
  group_by: "document_id",
  limit: 4,           // max groups
  group_size: 2,      // max hits per group
});

// With lookup — fetch metadata from another collection per group
client.queryGroups("chunks", {
  query: [0.2, 0.1, 0.9, 0.7],
  group_by: "document_id",
  limit: 4,
  group_size: 2,
  with_lookup: {
    collection: "documents",
    with_payload: ["title", "abstract"],
    with_vectors: false,
  },
});
```

### Search params (HNSW tuning)
```ts
client.query("my_collection", {
  query: [0.2, 0.1, 0.9, 0.7],
  params: {
    hnsw_ef: 128,     // higher = more accurate, slower
    exact: false,     // true = full scan, exact results
    indexed_only: false,
    // ACORN (v1.16.0+) — better accuracy for restrictive filters at cost of speed
    acorn: { enable: true, max_selectivity: 0.4 },
  },
  limit: 10,
});
```

---

## Filters

Filters apply to `query`, `scroll`, `count`, `delete`, and `upsert` (update_filter).

```ts
// must = AND, should = OR, must_not = NOT
const filter = {
  must: [
    { key: "status", match: { value: "active" } },          // exact match
    { key: "score", range: { gte: 0.5, lte: 1.0 } },       // range
    { key: "tags", match: { any: ["ai", "ml"] } },          // match any
    { key: "name", match: { text: "neural" } },             // full-text (requires index)
    { key: "meta.source", match: { value: "pdf" } },        // nested field
    { has_id: [1, 2, 3] },                                  // by point ids
    { is_empty: { key: "optional_field" } },                // null/missing
    { is_null: { key: "nullable_field" } },
  ],
  should: [
    { key: "category", match: { value: "A" } },
    { key: "category", match: { value: "B" } },
  ],
  must_not: [
    { key: "deleted", match: { value: true } },
  ],
};
```

---

## Payload Indexes (required for filter performance)

```ts
// Create index — always do this for fields you filter on
client.createPayloadIndex("my_collection", {
  field_name: "user_id",
  field_schema: "keyword",   // "keyword" | "integer" | "float" | "bool" | "geo" | "datetime" | "text"
});

// Full-text index (for .match.text filters)
client.createPayloadIndex("my_collection", {
  field_name: "content",
  field_schema: { type: "text", tokenizer: "word" },
});

client.deletePayloadIndex("my_collection", "user_id");
```

---

## Key Gotchas

- **Distance metric is set at collection creation and cannot be changed** — delete and recreate the collection.
- **Vector size is set at collection creation and cannot be changed** — use alias swap pattern for zero-downtime migration.
- **Filters must come after `query`** in the method chain/object — not before.
- **Sparse vectors must be named** — you cannot have an unnamed sparse vector.
- **`collectionExists` returns `{ exists: boolean }`** — not a boolean directly.
- **`scroll` is for iteration** — use `query` for similarity search.
- **Large `offset` in `query` is slow** — HNSW scans `offset + limit` points internally.
- **`next_page_offset: null`** means you are on the last page in scroll.
- **Payload indexes are required** for `order_by` in scroll and for filter performance at scale.
- **`update_mode: "update_only"` + `update_filter`** is the correct pattern for conditional updates — plain upsert will insert even if the condition fails.