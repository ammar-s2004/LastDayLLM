Here's the full context sheet:

---

```markdown
# gemini-embedding-001 — AI Context Sheet

## Sources
- Official Embeddings Docs: https://ai.google.dev/gemini-api/docs/embeddings
- Model Page: https://ai.google.dev/gemini-api/docs/models/gemini-embedding-001
- GA Announcement: https://developers.googleblog.com/gemini-embedding-available-gemini-api/
- Vertex AI Docs: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings
- Vertex AI API Ref: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api

---

## Model Specs

| Property | Value |
|---|---|
| Model ID | gemini-embedding-001 |
| Output dimensions (default) | 3072 |
| Recommended dimensions | 768, 1536, 3072 |
| Max input tokens | 2048 |
| Languages | 100+ |
| Pricing | $0.15 per 1M input tokens |
| Free tier | Yes (Google AI Studio) |
| Technique | Matryoshka Representation Learning (MRL) |
| Vectors normalized | Yes — cosine, dot product, euclidean all work |
| MTEB leaderboard | Top-ranked multilingual model |

---

## Install

```bash
pip install google-genai
```

---

## Basic Embedding (Python)

```python
from google import genai

client = genai.Client(api_key="YOUR_API_KEY")

result = client.models.embed_content(
    model="gemini-embedding-001",
    contents="What is the meaning of life?"
)

# result.embeddings is a list of ContentEmbedding objects
# Access vector via result.embeddings[0].values
print(result.embeddings[0].values)  # list of 3072 floats
```

---

## Batch Embedding (multiple texts in one call)

```python
from google import genai

client = genai.Client(api_key="YOUR_API_KEY")

result = client.models.embed_content(
    model="gemini-embedding-001",
    contents=[
        "What is transformer architecture?",
        "Explain backpropagation",
        "How do attention heads work?"
    ]
)

for embedding in result.embeddings:
    print(len(embedding.values))  # 3072 each
```

---

## Task Types (use for better performance)

Specifying task_type optimizes the embedding for your use case.

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_API_KEY")

result = client.models.embed_content(
    model="gemini-embedding-001",
    contents="Explain how RAG systems work",
    config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT")
)
```

### All supported task_type values

| task_type | Use case |
|---|---|
| RETRIEVAL_QUERY | Embedding a search query |
| RETRIEVAL_DOCUMENT | Embedding a document to be retrieved |
| SEMANTIC_SIMILARITY | Comparing meaning between texts |
| CLASSIFICATION | Classifying text into categories |
| CLUSTERING | Grouping similar texts together |
| QUESTION_ANSWERING | QA context passages |
| FACT_VERIFICATION | Fact checking |
| CODE_RETRIEVAL_QUERY | Searching code snippets |

NOTE: task_type is NOT supported in gemini-embedding-2-preview. Only on gemini-embedding-001.

---

## Custom Output Dimensions (MRL truncation)

Truncate from default 3072 down to save storage + compute.
Recommended sizes: 768, 1536, 3072.

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_API_KEY")

result = client.models.embed_content(
    model="gemini-embedding-001",
    contents="Your text here",
    config=types.EmbedContentConfig(
        task_type="RETRIEVAL_DOCUMENT",
        output_dimensionality=768  # smaller = cheaper storage, minimal quality loss
    )
)

print(len(result.embeddings[0].values))  # 768
```

---

## Cosine Similarity Example

```python
from google import genai
from google.genai import types
from sklearn.metrics.pairwise import cosine_similarity
import pandas as pd

client = genai.Client(api_key="YOUR_API_KEY")

texts = [
    "Machine learning fundamentals",
    "Deep learning and neural nets",
    "History of ancient Rome"
]

result = client.models.embed_content(
    model="gemini-embedding-001",
    contents=texts,
    config=types.EmbedContentConfig(task_type="SEMANTIC_SIMILARITY")
)

vectors = [e.values for e in result.embeddings]
sim_matrix = cosine_similarity(vectors)

df = pd.DataFrame(sim_matrix, index=texts, columns=texts)
print(df)
# Values: -1 (opposite meaning) to 1 (identical meaning)
```

---

## JavaScript SDK

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

// Single
const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: "What is the meaning of life?",
});
console.log(response.embeddings[0].values);

// Batch
const batchResponse = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: ["Text one", "Text two", "Text three"],
    taskType: "RETRIEVAL_DOCUMENT"
});

// With custom dimensions
const dimResponse = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: "Your text",
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: 768
});
```

---

## REST / cURL

### Single text
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent" \
    -H "Content-Type: application/json" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -d '{
        "model": "models/gemini-embedding-001",
        "content": {
            "parts": [{"text": "Your text here"}]
        }
    }'
```

### Batch with task type
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent" \
    -H "Content-Type: application/json" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -d '{
        "content": {
            "parts": [
                {"text": "Text one"},
                {"text": "Text two"}
            ]
        },
        "taskType": "RETRIEVAL_DOCUMENT"
    }'
```

### Response shape
```json
{
  "embeddings": [
    {
      "values": [0.0061, -0.0146, 0.0049, ...]
    }
  ]
}
```

---

## Vertex AI SDK (if using Google Cloud)

```python
import vertexai
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

vertexai.init(project="YOUR_PROJECT_ID", location="us-central1")

model = TextEmbeddingModel.from_pretrained("gemini-embedding-001")

# NOTE: Vertex AI takes one input at a time for gemini-embedding-001
texts = ["What is RAG?", "Explain vector search"]
embeddings = []

for text in texts:
    input_obj = TextEmbeddingInput(text, "RETRIEVAL_DOCUMENT")
    result = model.get_embeddings([input_obj], output_dimensionality=768)
    embeddings.append(result[0].values)
```

---

## TypeScript SDK (Vercel AI SDK / @ai-sdk/google)

```typescript
import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

const model = google.embedding("gemini-embedding-001");

// Single
const { embedding } = await embed({
    model,
    value: "Exam topic: Transformer architecture"
});

// Batch — auto uses batchEmbedContents endpoint
const { embeddings } = await embedMany({
    model,
    values: ["Topic A", "Topic B", "Topic C"]
});
```

Note: @ai-sdk/google auto-routes single embed() to :embedContent (higher rate limits)
and embedMany() to :batchEmbedContents.

---

## Key Behaviors & Gotchas

- Vectors are normalized — cosine similarity, dot product, and euclidean all give same relative rankings
- Output: list of floats, default 3072 dimensions
- MRL allows truncation to 768 or 1536 with minimal quality loss — use for Qdrant cost savings
- task_type matters: always set RETRIEVAL_QUERY for queries, RETRIEVAL_DOCUMENT for stored chunks
- Vertex AI: takes ONE text at a time — loop manually for batches
- Gemini API: accepts list of strings natively in one call
- Max 2048 input tokens per text — auto-truncated by default (auto_truncate=true)
- gemini-embedding-2-preview exists but is multimodal preview only — gemini-embedding-001 is production-stable

---

## For RAG Pipelines (LastDayLLM relevant)

```python
# Embed document chunk for storage
doc_result = client.models.embed_content(
    model="gemini-embedding-001",
    contents=chunk_text,
    config=types.EmbedContentConfig(
        task_type="RETRIEVAL_DOCUMENT",
        output_dimensionality=768  # matches Qdrant collection config
    )
)
vector = doc_result.embeddings[0].values  # store in Qdrant

# Embed query at search time
query_result = client.models.embed_content(
    model="gemini-embedding-001",
    contents=user_query,
    config=types.EmbedContentConfig(
        task_type="RETRIEVAL_QUERY",  # different task type than documents
        output_dimensionality=768
    )
)
query_vector = query_result.embeddings[0].values  # use for similarity search
```

Always use RETRIEVAL_DOCUMENT for chunks going into the vector DB.
Always use RETRIEVAL_QUERY for the incoming user query.
Mixing task types degrades retrieval quality.
```