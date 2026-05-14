# Gemma 4 — AI Context Sheet (Google AI Studio / Gemini API)

## Models Available via API

| Model ID | Type | Context | Notes |
|---|---|---|---|
| gemma-4-31b-it | Dense | 256K | Flagship, best quality |
| gemma-4-26b-a4b-it | MoE | 256K | ~4B active params/call, faster + cheaper |

Edge models (E2B, E4B) are on-device only — not served via Gemini API.

---

## Install

```bash
pip install google-genai
```

Get API key from: https://aistudio.google.com

---

## Basic Completion

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_API_KEY")

response = client.models.generate_content(
    model="gemma-4-31b-it",
    config=types.GenerateContentConfig(
        system_instruction="You are a helpful assistant."
    ),
    contents="Your prompt here"
)
print(response.text)
```

---

## Multi-turn Chat (auto history tracking)

```python
chat = client.chats.create(model="gemma-4-26b-a4b-it")
r1 = chat.send_message("What is RAG?")
r2 = chat.send_message("How do I implement it with Qdrant?")
```

---

## Function Calling (native — not prompt-engineered)

```python
tool_def = {
    "name": "search_topics",
    "description": "Search exam topics by subject.",
    "parameters": {
        "type": "object",
        "properties": {
            "subject": {"type": "string"},
            "limit": {"type": "integer"}
        },
        "required": ["subject"]
    }
}

tools = types.Tool(function_declarations=[tool_def])
config = types.GenerateContentConfig(tools=[tools])

response = client.models.generate_content(
    model="gemma-4-26b-a4b-it",
    contents="Find top 5 topics for Machine Learning exam",
    config=config
)

fc = response.candidates[0].content.parts[0].function_call
# fc.name -> "search_topics"
# fc.args -> {"subject": "Machine Learning", "limit": 5}
```

---

## Thinking Mode (step-by-step reasoning)

```python
response = client.models.generate_content(
    model="gemma-4-31b-it",
    contents="Solve this complex reasoning task...",
    config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level="high")
    )
)
```

Thinking level options: "none" | "low" | "high"

---

## Structured JSON Output

```python
response = client.models.generate_content(
    model="gemma-4-26b-a4b-it",
    config=types.GenerateContentConfig(
        system_instruction="Respond ONLY in valid JSON. No markdown, no preamble.",
        response_mime_type="application/json"
    ),
    contents="Extract topics and weights from this syllabus: ..."
)
import json
data = json.loads(response.text)
```

---

## Image / Multimodal Input

```python
import base64

with open("image.png", "rb") as f:
    img_data = base64.b64encode(f.read()).decode()

response = client.models.generate_content(
    model="gemma-4-31b-it",
    contents=[
        {"inline_data": {"mime_type": "image/png", "data": img_data}},
        {"text": "Describe this diagram"}
    ]
)
```

---

## REST / cURL

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{"contents": [{"parts": [{"text": "Your prompt"}]}]}'
```

---

## Key Capabilities

- Native function calling (model-level, not prompt-hacked)
- Native system instruction support
- Structured JSON output via response_mime_type
- Configurable thinking/reasoning mode
- Multimodal: text + image (all models), video + audio (edge only)
- 140+ languages
- Apache 2.0 license — can self-host weights

---

## Model Choice Guide

| Use case | Recommended |
|---|---|
| High quality, complex reasoning | gemma-4-31b-it |
| High throughput / batch jobs | gemma-4-26b-a4b-it |
| Thinking / multi-step logic | gemma-4-31b-it + thinking_level="high" |
| Agentic / tool-use pipelines | gemma-4-26b-a4b-it (faster, cheaper) |