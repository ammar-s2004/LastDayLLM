Full context sheet pulled directly from the official docs page:

---

```markdown
# gemini-3.1-flash-lite-preview — AI Context Sheet

## Sources
- Official Model Page: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview
- Gemini 3 Developer Guide: https://ai.google.dev/gemini-api/docs/gemini-3
- Google Blog (launch): https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/
- DeepMind Model Card: https://deepmind.google/models/model-cards/gemini-3-1-flash-lite/
- Vertex AI Docs: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-flash-lite

---

## Model Specs

| Property | Value |
|---|---|
| Model ID | gemini-3.1-flash-lite-preview |
| Status | Preview (as of March 2026) |
| Input token limit | 1,048,576 (1M) |
| Output token limit | 65,536 (64K) |
| Knowledge cutoff | January 2025 |
| Input types | Text, Image, Video, Audio, PDF |
| Output type | Text only |
| Pricing (input) | $0.25 / 1M tokens |
| Pricing (output) | $1.50 / 1M tokens |
| Free tier | Yes (Gemini API) |
| Architecture | Based on Gemini 3 Pro |
| Speed vs 2.5 Flash | 2.5x faster Time to First Token, 45% faster output |
| Arena.ai Elo | 1432 |

## Capabilities

| Feature | Supported |
|---|---|
| Thinking | Yes |
| Function calling | Yes |
| Structured outputs | Yes |
| Batch API | Yes |
| Context caching | Yes |
| Code execution | Yes |
| File search | Yes |
| Google Search grounding | Yes |
| Google Maps grounding | Yes |
| URL context | Yes |
| Live API | No |
| Image generation | No |
| Audio generation | No |
| Computer use | No |

---

## Install

```bash
pip install google-genai
```

---

## Basic Completion

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_API_KEY")

response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents="How does AI work?"
)
print(response.text)
```

---

## System Instruction

```python
response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    config={
        "system_instruction": "Only output the translated text"
    },
    contents="Translate to German: Hey, are you down to grab some pizza later?"
)
print(response.text)
```

---

## Thinking Mode

Gemini 3 models default to thinking_level="high" if not specified.
Use lower levels for speed/cost savings on simple tasks.

```python
response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents="Solve this step by step: ...",
    config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level="high")
    )
)
print(response.text)
```

Thinking levels: "minimal" | "low" | "medium" | "high"
NOTE: Do not mix thinking_level and thinking_budget in the same request.
thinking_budget is deprecated but still backward-compatible.

---

## Structured JSON Output (Pydantic schema)

```python
from pydantic import BaseModel, Field

class ReviewAnalysis(BaseModel):
    aspect: str = Field(description="Feature mentioned (e.g., Price, Comfort, Style)")
    summary_quote: str = Field(description="Specific phrase from the review")
    sentiment_score: int = Field(description="1 to 5 (1=worst, 5=best)")
    is_return_risk: bool = Field(description="True if user mentions returning")

response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents=["Analyze this review:", "Boots look great but run too small. Sending back."],
    config={
        "response_mime_type": "application/json",
        "response_json_schema": ReviewAnalysis.model_json_schema(),
    }
)
print(response.text)  # valid JSON matching schema
```

---

## Multimodal — Audio Transcription

```python
uploaded_file = client.files.upload(file="sample.mp3")

response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents=["Generate a transcript of the audio.", uploaded_file]
)
print(response.text)
```

---

## Multimodal — PDF Processing

```python
import httpx

doc_data = httpx.get("https://your-pdf-url.com/doc.pdf").content

response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents=[
        types.Part.from_bytes(data=doc_data, mime_type="application/pdf"),
        "Summarize this document"
    ]
)
print(response.text)
```

---

## Function Calling

```python
tool_def = {
    "name": "get_topic_score",
    "description": "Get predicted exam score for a topic.",
    "parameters": {
        "type": "object",
        "properties": {
            "topic": {"type": "string"},
            "subject": {"type": "string"}
        },
        "required": ["topic", "subject"]
    }
}

tools = types.Tool(function_declarations=[tool_def])

response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents="What's the score for Transformers in Machine Learning?",
    config=types.GenerateContentConfig(tools=[tools])
)

fc = response.candidates[0].content.parts[0].function_call
print(fc.name, fc.args)
```

---

## Google Search Grounding

```python
response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents="What are the latest exam patterns for GATE 2025?",
    config=types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())]
    )
)
print(response.text)
```

---

## Context Caching (for repeated large context)

```python
from google.genai import types

# Cache a large document/system context
cache = client.caches.create(
    model="gemini-3.1-flash-lite-preview",
    config=types.CreateCachedContentConfig(
        system_instruction="You are an expert exam tutor.",
        contents=[large_syllabus_text],
        ttl="3600s"
    )
)

# Use cached context in subsequent calls
response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents="What are the top 5 topics from this syllabus?",
    config=types.GenerateContentConfig(cached_content=cache.name)
)
```

---

## Model Router Pattern (official use case from docs)

Use Flash-Lite as a cheap classifier to route queries to Flash or Pro.

```python
CLASSIFIER_PROMPT = """
You are a Task Routing AI. Classify the user request complexity.
Choose 'flash' for simple tasks (1-3 steps).
Choose 'pro' for complex tasks (4+ steps, planning, debugging, ambiguity).
"""

response_schema = {
    "type": "object",
    "properties": {
        "reasoning": {"type": "string"},
        "model_choice": {"type": "string", "enum": ["flash", "pro"]}
    },
    "required": ["reasoning", "model_choice"]
}

response = client.models.generate_content(
    model="gemini-3.1-flash-lite-preview",
    contents=user_query,
    config={
        "system_instruction": CLASSIFIER_PROMPT,
        "response_mime_type": "application/json",
        "response_json_schema": response_schema
    }
)

import json
result = json.loads(response.text)
chosen_model = "gemini-3-flash-preview" if result["model_choice"] == "flash" else "gemini-3.1-pro-preview"
```

---

## Multi-turn Chat

```python
chat = client.chats.create(model="gemini-3.1-flash-lite-preview")

r1 = chat.send_message("What topics are most important for ML exams?")
r2 = chat.send_message("Give me a 5-question quiz on transformers")
r3 = chat.send_message("Now explain the answers")
```

---

## Streaming

```python
for chunk in client.models.generate_content_stream(
    model="gemini-3.1-flash-lite-preview",
    contents="Explain attention mechanisms in detail"
):
    print(chunk.text, end="", flush=True)
```

---

## REST / cURL

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{"parts": [{"text": "Your prompt here"}]}],
    "generationConfig": {
      "thinkingConfig": {"thinkingLevel": "low"}
    }
  }'
```

---

## Key Behaviors & Gotchas

- Preview model — subject to change, not guaranteed SLA
- Thinking defaults to "high" if not specified — set "minimal" or "low" for pure speed tasks
- Do NOT use thinking_budget and thinking_level together in the same request
- No Live API support (use gemini-3-flash-preview for live/streaming realtime)
- No image or audio generation — text output only
- Batch API supported — good for high-volume offline jobs
- Context caching supported — use for repeated large system prompts to save cost
- 1M token context window — can fit entire codebases or long documents
- Key SDK finding: thinkingBudget: 0 still works in the SDK types but Gemini 3.x ignores it — only thinkingLevel matters for 3.x.
---

## When to Use Flash-Lite vs Flash vs Pro

| Use case | Model |
|---|---|
| High-volume extraction, translation, classification | gemini-3.1-flash-lite-preview |
| Model router / task classifier | gemini-3.1-flash-lite-preview |
| Agentic tasks, multi-step reasoning, coding | gemini-3-flash-preview |
| Complex planning, frontier reasoning | gemini-3.1-pro-preview |
```