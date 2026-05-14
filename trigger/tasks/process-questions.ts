/* ============================================================================
   FILE: trigger/tasks/process-questions.ts
   ============================================================================
   
   QUESTION EXTRACTION PIPELINE
   
   This Trigger.dev background task processes TEST_PAPER and ASSIGNMENT uploads.
   It uses Google Gemini to extract questions from uploaded documents 
   (PDFs and images) and links them to syllabus topics.
   
   Sub-Topic Promotion Version:
   - Resolves parent headings to child topic IDs.
   - Grounding: "Parent > Child"
   - Linking: Case-insensitive normalized matching to child IDs.
   
   ─────────────────────────────────────────────────────────────────────────────
   MODEL: Gemini 2.5 Flash Lite (gemini-2.5-flash-lite)
   ─────────────────────────────────────────────────────────────────────────────
============================================================================ */

import { task, logger } from "@trigger.dev/sdk";
import { supabaseWorker } from "@/lib/supabase-worker";
import { z } from "zod";
import { GEMINI_MODEL_QUESTIONS, AI_BACKUP_MODEL, NO_THINKING_CONFIG, getThinkingConfig } from "@/lib/ai-limits";
import { buildQuestionsExtractionPrompt } from "@/lib/ai-prompts";
import { resolveChildTopicIds } from "@/lib/shared/resolve-children";
import { computeATask } from "./compute-a";
import { computeWTFTask } from "./compute-wtf";

// Lazy-loaded Google AI client
let _genAI: any = null;
function getGenAI() {
    if (!_genAI) {
        const { GoogleGenAI } = require('@google/genai');
        _genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
    }
    return _genAI;
}

const DEFAULT_PRIMARY_MODEL = GEMINI_MODEL_QUESTIONS;
const DEFAULT_FALLBACK_MODEL = AI_BACKUP_MODEL;

const AI_TIMEOUT_MS = 60_000;
const AI_TIMEOUT_FALLBACK_MS = 90_000;

const MAX_AI_RESPONSE_SIZE = 500_000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_QUESTION_TEXT_LENGTH = 2000;
const MAX_TOPICS_PER_QUESTION = 5;
const MAX_TOPIC_NAME_LENGTH = 200;
const MAX_QUESTIONS_PER_PAPER = 100;
const MAX_MARKS = 100;

/* ======================================================
   VALIDATION SCHEMAS
====================================================== */

const QuestionWithTopicsSchema = z.object({
    question_no: z.union([
        z.number().int().positive(),
        z.string().transform((val) => {
            const match = val.match(/^\d+/);
            return match ? parseInt(match[0], 10) : null;
        })
    ]).optional().nullable(),
    text: z.string().min(1).max(MAX_QUESTION_TEXT_LENGTH),
    marks: z.coerce.number().int().positive().max(MAX_MARKS).optional().nullable(),
    topics: z
        .array(
            z.object({
                topic_name: z.string().min(1).max(MAX_TOPIC_NAME_LENGTH),
                relevance: z.coerce.number().min(0).max(1),
            })
        )
        .max(MAX_TOPICS_PER_QUESTION),
});

const PaperSchema = z.object({
    source_file: z.string(),
    exam_type: z.string().optional().nullable().transform((val) => {
        if (!val) return null;
        const normalized = val.toUpperCase();
        if (normalized.includes('TT1') || normalized.includes('TEST 1') || normalized.includes('TEST - I') || normalized.includes('TEST-I') || (normalized.includes('TERM') && normalized.includes('1'))) {
            return 'TT1';
        }
        if (normalized.includes('TT2') || normalized.includes('TEST 2') || normalized.includes('TEST - II') || normalized.includes('TEST-II') || (normalized.includes('TERM') && normalized.includes('2'))) {
            return 'TT2';
        }
        if (normalized.includes('END') || normalized.includes('SEMESTER') || normalized.includes('FINAL')) {
            return 'END_SEMESTER';
        }
        return 'UNKNOWN';
    }),
    exam_year: z.string().regex(/^\d{4}$/).optional().nullable(),
    questions: z.array(QuestionWithTopicsSchema).min(1).max(MAX_QUESTIONS_PER_PAPER),
});

const BatchResponseSchema = z.object({
    papers: z.array(PaperSchema).min(1),
});

/* ======================================================
   HELPERS
====================================================== */

function normalize(str: string) {
    return str.trim().toLowerCase().replace(/\s+/g, " ");
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const id = setTimeout(() => reject(new Error("AI timeout")), ms);
        promise
            .then(res => {
                clearTimeout(id);
                resolve(res);
            })
            .catch(err => {
                clearTimeout(id);
                reject(err);
            });
    });
}

async function updateProgress(resourceIds: string[], jobId: string, stage: string, progress: number, message: string) {
    const truncated = message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH) + "..." : message;
    const rows = resourceIds.map(id => ({ resource_id: id, job_id: jobId, stage, progress, message: truncated }));
    try {
        await supabaseWorker.from("job_progress").upsert(rows, { onConflict: "resource_id,stage" });
    } catch { }
}

async function waitForFilesReady(files: { googleFileName: string }[], maxAttempts = 10) {
    await Promise.all(
        files.map(async f => {
            let attempts = 0;
            while (attempts < maxAttempts) {
                try {
                    const state = await getGenAI().files.get({ name: f.googleFileName });
                    if (state.state === "ACTIVE") return;
                } catch { }
                attempts++;
                await new Promise(r => setTimeout(r, 2000));
            }
            throw new Error(`File not ready: ${f.googleFileName}`);
        })
    );
}

async function callAI(model: string, parts: any[], timeout: number): Promise<any> {
    return withTimeout(
        getGenAI().models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: { ...getThinkingConfig(model) },
        }),
        timeout
    );
}

/* ======================================================
   MAIN TASK
====================================================== */

export const processQuestionsTask = task({
    id: "process-questions",
    retry: {
        maxAttempts: 3,
        factor: 2,
        minTimeoutInMs: 1000,
        maxTimeoutInMs: 10000,
    },
    run: async (payload: {
        subjectId: string;
        resourceType: "TEST_PAPER" | "ASSIGNMENT";
        files: Array<{
            fileUri: string;
            googleFileName: string;
            mimeType: string;
            originalFilename: string;
            resourceId: string;
        }>;
        allowedTopicIds: string[];
        preferredModel?: string;
        userExamType?: string;
        userExamYear?: string;
    }, { ctx }) => {
        const { subjectId, resourceType, files, allowedTopicIds, preferredModel, userExamType, userExamYear } = payload;
        const PRIMARY_MODEL = preferredModel || DEFAULT_PRIMARY_MODEL;
        const FALLBACK_MODEL = PRIMARY_MODEL === DEFAULT_PRIMARY_MODEL ? DEFAULT_FALLBACK_MODEL : DEFAULT_PRIMARY_MODEL;
        const jobId = ctx.run.id;
        const resourceIds = Array.from(new Set(files.map(f => f.resourceId)));
        const isAssignment = resourceType === "ASSIGNMENT";

        logger.info("PROCESS START", { jobId, subjectId, resourceType, attempt: ctx.attempt.number });

        try {
            if (!allowedTopicIds.length) throw new Error("No scoped topics. Exam scope not configured.");
            
            await updateProgress(resourceIds, jobId, "claimed", 5, "Job claimed");
            await supabaseWorker.from("resources").update({ status: "PROCESSING" }).in("id", resourceIds);

            /* ---------- LOAD TOPICS ---------- */
            await updateProgress(resourceIds, jobId, "topics", 10, "Loading topics");

            const scopeEntries = allowedTopicIds.map(id => ({ topic_id: id, selected_sub_topics: null }));
            const childTopicIds = await resolveChildTopicIds(supabaseWorker, scopeEntries);
            if (childTopicIds.length === 0) throw new Error("No child topics found after resolution");

            const { data: childTopics } = await supabaseWorker
                .from("topics")
                .select("id, name, parent_topic_id")
                .in("id", childTopicIds);

            if (!childTopics?.length) throw new Error("No child topics found in database");

            const parentIdsFromChildren = [...new Set(childTopics.filter(t => t.parent_topic_id).map(t => t.parent_topic_id as string))];
            let parentNameMap = new Map<string, string>();
            if (parentIdsFromChildren.length > 0) {
                const { data: parents } = await supabaseWorker.from("topics").select("id, name").in("id", parentIdsFromChildren);
                parentNameMap = new Map((parents ?? []).map(p => [p.id, p.name]));
            }

            const topicMap = new Map(childTopics.map(t => [normalize(t.name), t.id]));
            const expandedTopicLines = childTopics.map(t => {
                const parentName = t.parent_topic_id ? parentNameMap.get(t.parent_topic_id) : null;
                return parentName ? `${parentName} > ${t.name}` : t.name;
            });
            const topicsList = expandedTopicLines.map((line, i) => `${i + 1}. ${line}`).join("\n");

            logger.info(`Loaded ${childTopics.length} child topics for matching`);

            /* ---------- BUILD PROMPT & AI CALL ---------- */
            const fileParts = files.map(f => ({ fileData: { fileUri: f.fileUri, mimeType: f.mimeType } }));
            const promptText = buildQuestionsExtractionPrompt({
                fileNames: files.map(f => f.originalFilename),
                isAssignment,
                topicsList,
                maxQuestionsPerPaper: MAX_QUESTIONS_PER_PAPER,
                maxTopicsPerQuestion: MAX_TOPICS_PER_QUESTION,
            });

            await updateProgress(resourceIds, jobId, "extracting", 30, "Calling AI model...");

            let result;
            let modelUsed = PRIMARY_MODEL;
            try {
                result = await callAI(PRIMARY_MODEL, [...fileParts, { text: promptText }], AI_TIMEOUT_MS);
            } catch (err: any) {
                logger.warn("Primary model fail, trying fallback", { error: err.message });
                await updateProgress(resourceIds, jobId, "extracting", 35, "Retrying with fallback...");
                await waitForFilesReady(files);
                modelUsed = FALLBACK_MODEL;
                result = await callAI(FALLBACK_MODEL, [...fileParts, { text: promptText }], AI_TIMEOUT_FALLBACK_MS);
            }

            /* ---------- PARSE + VALIDATE ---------- */
            await updateProgress(resourceIds, jobId, "parsing", 45, "Parsing response...");
            const text = result.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
            if (!text) throw new Error("Empty AI response");

            const jsonStart = text.indexOf("{");
            const jsonEnd = text.lastIndexOf("}");
            if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found in AI response");
            const validated = BatchResponseSchema.parse(JSON.parse(text.slice(jsonStart, jsonEnd + 1)));

            /* ---------- DUPLICATE DETECTION ---------- */
            const fileMap = new Map(files.map(f => [normalize(f.originalFilename), f.resourceId]));
            const duplicatePaperResourceIds: string[] = [];
            const paperMetadata: { resourceId: string; exam_type: string | null; exam_year: string | null }[] = [];

            for (const paper of validated.papers) {
                const resourceId = fileMap.get(normalize(paper.source_file));
                if (!resourceId) continue;

                const examType = userExamType || paper.exam_type || null;
                const examYear = userExamYear || paper.exam_year || null;
                paperMetadata.push({ resourceId, exam_type: examType, exam_year: examYear });

                if (examType && examType !== 'UNKNOWN' && examYear) {
                    const { data: existing } = await supabaseWorker
                        .from('resources')
                        .select('id')
                        .eq('subject_id', subjectId)
                        .eq('detected_exam_type', examType)
                        .eq('detected_exam_year', examYear)
                        .neq('id', resourceId)
                        .maybeSingle();
                    if (existing) duplicatePaperResourceIds.push(resourceId);
                }
            }

            for (const { resourceId, exam_type, exam_year } of paperMetadata) {
                await supabaseWorker.from('resources').update({ detected_exam_type: exam_type, detected_exam_year: exam_year }).eq('id', resourceId);
            }

            if (duplicatePaperResourceIds.length > 0) {
                await supabaseWorker.from("resources").update({ status: 'PARTIAL', warning_message: 'Duplicate paper detected.' }).in("id", duplicatePaperResourceIds);
            }

            /* ---------- BATCH SAVE QUESTIONS ---------- */
            await updateProgress(resourceIds, jobId, "saving", 65, "Saving questions...");
            const allQuestions: any[] = [];
            let qNo = 1;

            validated.papers.forEach(paper => {
                const resId = fileMap.get(normalize(paper.source_file));
                if (!resId || duplicatePaperResourceIds.includes(resId)) return;
                paper.questions.forEach(q => {
                    allQuestions.push({
                        resource_id: resId,
                        subject_id: subjectId,
                        question_no: q.question_no ?? qNo++,
                        text: q.text,
                        marks: q.marks,
                        normalized_text: q.text.toLowerCase().replace(/[^a-z0-9 ]/g, ''),
                        topics: q.topics,
                    });
                });
            });

            // Self-correction for duplicate question numbers within same resource
            const byRes = new Map<string, any[]>();
            allQuestions.forEach(q => {
                if (!byRes.has(q.resource_id)) byRes.set(q.resource_id, []);
                byRes.get(q.resource_id)!.push(q);
            });
            byRes.forEach(qs => {
                const used = new Set(qs.map(q => q.question_no));
                const seen = new Set<number>();
                qs.forEach(q => {
                    let cand = q.question_no;
                    while (seen.has(cand) || (used.has(cand) && cand !== q.question_no)) cand++;
                    q.question_no = cand;
                    seen.add(cand);
                    used.add(cand);
                });
            });

            const { data: inserted, error: qErr } = await supabaseWorker
                .from("questions")
                .upsert(allQuestions.map(({ topics, ...q }) => q), { onConflict: "resource_id, question_no" })
                .select("id, question_no, resource_id");

            if (qErr || !inserted?.length) throw qErr || new Error("Insert failed");

            /* ---------- LINK TOPICS ---------- */
            await updateProgress(resourceIds, jobId, "linking", 80, "Linking topics...");
            const qIdMap = new Map(inserted.map(q => [`${q.resource_id}-${q.question_no}`, q.id]));
            const links: any[] = [];
            const linksCountByRes = new Map<string, number>();
            let skippedTopics = 0;

            allQuestions.forEach(q => {
                const qid = qIdMap.get(`${q.resource_id}-${q.question_no}`);
                if (!qid) return;
                q.topics.forEach((t: any) => {
                    const rawName = t.topic_name;
                    let tid = topicMap.get(normalize(rawName));
                    if (!tid && rawName.includes(" > ")) {
                        const childPart = rawName.split(" > ").pop()?.trim();
                        if (childPart) tid = topicMap.get(normalize(childPart));
                    }
                    if (tid) {
                        links.push({ question_id: qid, topic_id: tid, relevance: t.relevance });
                        linksCountByRes.set(q.resource_id, (linksCountByRes.get(q.resource_id) || 0) + 1);
                    } else {
                        skippedTopics++;
                    }
                });
            });

            if (links.length > 0) {
                const { error: linkErr } = await supabaseWorker.from("question_topics").upsert(links, { onConflict: "question_id,topic_id", ignoreDuplicates: true });
                if (linkErr) throw linkErr;
            }

            /* ---------- FINALIZE ---------- */
            const questionsCountByRes = new Map<string, number>();
            allQuestions.forEach(q => questionsCountByRes.set(q.resource_id, (questionsCountByRes.get(q.resource_id) || 0) + 1));

            const partial: string[] = [];
            const done: string[] = [];
            linksCountByRes.forEach((lc, rid) => {
                const qCount = questionsCountByRes.get(rid) || 1;
                const matchRate = lc / (qCount * 2);
                if (matchRate < 0.3) {
                    partial.push(rid);
                } else {
                    done.push(rid);
                }
            });

            if (partial.length) await supabaseWorker.from("resources").update({ status: "PARTIAL", warning_message: "Low topic match." }).in("id", partial);
            if (done.length) await supabaseWorker.from("resources").update({ status: "COMPLETED" }).in("id", done);

            await updateProgress(resourceIds, jobId, "completed", 100, `Done: ${inserted.length} questions.`);
            
            if (isAssignment) computeATask.trigger({ subjectId }).catch(() => {});
            else computeWTFTask.trigger({ subjectId }).catch(() => {});

            await Promise.all(files.map(f => getGenAI().files.delete({ name: f.googleFileName }).catch(() => {})));
            return { success: true, questions: inserted.length };

        } catch (err: any) {
            const isFinal = ctx.attempt.number >= (ctx.run.maxAttempts ?? 3);
            if (isFinal) {
                await supabaseWorker.from("resources").update({ status: "FAILED" }).in("id", resourceIds);
                await updateProgress(resourceIds, jobId, "failed", 0, err.message);
                await Promise.all(files.map(f => getGenAI().files.delete({ name: f.googleFileName }).catch(() => {})));
            }
            throw err;
        }
    },
});
