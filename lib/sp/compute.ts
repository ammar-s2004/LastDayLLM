import { GoogleGenAI } from "@google/genai";

import { GEMINI_MODEL_NOTES, AI_BACKUP_MODEL, NO_THINKING_CONFIG, getThinkingConfig } from "@/lib/ai-limits";
import { buildSPPrompt } from "@/lib/ai-prompts";

export interface SPModuleInput {
  moduleNo: number;
  moduleTitle: string;
  topics: Array<{ id: string; name: string; subtopics: string[]; parentName?: string }>;
}

export interface SPResult {
  topicId: string;
  topicName: string;
  moduleNo: number;
  centralityScore: number;
}

export interface SPComputeResult {
  results: SPResult[];
  truncated: boolean;
}

interface SPPromptResponse {
  scores?: Array<{
    module: number;
    topic_name: string;
    subtopic_name: string;
    centrality_score: number;
  }>;
}

let spGenAIClient: GoogleGenAI | null = null;

function getSPAI(): GoogleGenAI {
  if (!spGenAIClient) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY environment variable is not set");
    }

    spGenAIClient = new GoogleGenAI({ apiKey });
  }

  return spGenAIClient;
}

function normalizeTopicName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export async function computeSP(modules: SPModuleInput[]): Promise<SPComputeResult> {
  if (modules.length === 0) {
    return { results: [], truncated: false };
  }

  const scope = modules.map((module) => ({
    moduleNo: module.moduleNo,
    moduleTitle: module.moduleTitle,
    topics: Array.from(
      module.topics.reduce((parentGroups, topic) => {
        const parentKey = topic.parentName ?? topic.name;
        const existing = parentGroups.get(parentKey) ?? { name: parentKey, subtopics: [] as string[] };
        if (topic.parentName) {
          existing.subtopics.push(topic.name);
        }
        parentGroups.set(parentKey, existing);
        return parentGroups;
      }, new Map<string, { name: string; subtopics: string[] }>())
    ).map(([, group]) => group),
  }));

  const prompt = buildSPPrompt({ scope });
  const ai = getSPAI();

  let response;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL_NOTES,
      contents: prompt,
      config: {
        ...NO_THINKING_CONFIG,
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });
  } catch {
    response = await ai.models.generateContent({
      model: AI_BACKUP_MODEL,
      contents: prompt,
      config: {
        ...getThinkingConfig(AI_BACKUP_MODEL),
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });
  }

  if (!response.text) {
    throw new Error("computeSP: No text in response from Gemini.");
  }

  let parsed: SPPromptResponse;
  let truncated = false;
  try {
    parsed = JSON.parse(response.text) as SPPromptResponse;
  } catch {
    // Gemini occasionally truncates JSON — attempt to recover by finding the last
    // complete array element and closing the structure
    const text = response.text;
    const lastComma = text.lastIndexOf(',');
    if (lastComma > 0) {
      try {
        const trimmed = text.slice(0, lastComma) + ']}';
        parsed = JSON.parse(trimmed) as SPPromptResponse;
        truncated = true;
        console.warn('[computeSP] Recovered truncated JSON — some scores may be missing');
      } catch {
        throw new Error(`computeSP: Gemini returned truncated/invalid JSON. Length: ${text.length}`);
      }
    } else {
      throw new Error(`computeSP: Gemini returned unparseable JSON. Length: ${text.length}`);
    }
  }
  const scores = parsed.scores ?? [];

  const topicLookup = new Map<string, { id: string; name: string; moduleNo: number }>();
  for (const module of modules) {
    for (const topic of module.topics) {
      const parentKey = topic.parentName ?? topic.name;
      topicLookup.set(
        `${module.moduleNo}::${normalizeTopicName(parentKey)}::${normalizeTopicName(topic.name)}`,
        {
          id: topic.id,
          name: topic.name,
          moduleNo: module.moduleNo,
        }
      );
    }
  }

  const results: SPResult[] = [];

  for (const item of scores) {
    const key = `${item.module}::${normalizeTopicName(item.topic_name)}::${normalizeTopicName(item.subtopic_name)}`;
    const matchedTopic = topicLookup.get(key);

    if (!matchedTopic) {
      console.warn("[computeSP] Unmatched topic returned by Gemini", {
        moduleNo: item.module,
        topicName: item.topic_name,
        subtopicName: item.subtopic_name,
      });
      continue;
    }

    results.push({
      topicId: matchedTopic.id,
      topicName: matchedTopic.name,
      moduleNo: matchedTopic.moduleNo,
      centralityScore: item.centrality_score,
    });
  }

  return { results, truncated };
}
