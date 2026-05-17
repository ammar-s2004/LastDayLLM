'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { createClient } from '@/lib/supabase-browser'

type SubjectInfo = {
  id: string
  name: string
}

type ModuleInfo = {
  id: string
  module_no: number
  title: string
}

type PredictionRun = {
  id: string
  exam_type?: string
  exam_label?: string
  created_at: string
}

type StudyMode = '3h' | '8h' | '2day'

const studyModes: Array<{ value: StudyMode; label: string; icon: string }> = [
  { value: '3h', label: '3 Hours', icon: '⏰' },
  { value: '8h', label: '8 Hours', icon: '⏱' },
  { value: '2day', label: '2 Days', icon: '📅' },
]

function paramToString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? ''
}

export default function QuestionsPage() {
  const router = useRouter()
  const params = useParams()
  const subjectId = paramToString(params.subjectId)

  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null)
  const [modules, setModules] = useState<Array<{ id: string; module_no: number; title: string }>>([])
  const [predictionRun, setPredictionRun] = useState<{ id: string; exam_type?: string; exam_label?: string; created_at: string } | null>(null)
  const [studyMode, setStudyMode] = useState<'3h' | '8h' | '2day'>('2day')
  const [loading, setLoading] = useState(true)
  const [hasQuestions, setHasQuestions] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkQuestions = useCallback(async (runId: string) => {
    const supabase = createClient()
    const { count } = await supabase
      .from('generated_questions')
      .select('id', { count: 'exact', head: true })
      .eq('prediction_run_id', runId)
    return (count ?? 0) > 0
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  useEffect(() => {
    const fetchData = async () => {
      if (!subjectId) return

      setLoading(true)
      const supabase = createClient()

      const [subjectResult, modulesResult, predictionResult, scopeResult] = await Promise.all([
        supabase.from('subjects').select('id, name').eq('id', subjectId).single(),
        supabase.from('modules').select('id, module_no, title').eq('subject_id', subjectId).order('module_no', { ascending: true }),
        supabase
          .from('prediction_runs')
          .select('id, exam_type, exam_label, created_at')
          .eq('subject_id', subjectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('exam_scopes')
          .select('exam_scope_topics(topics(module_id))')
          .eq('subject_id', subjectId),
      ])

      if (!subjectResult.error) {
        setSubject(subjectResult.data as SubjectInfo)
      }

      const allModules = (modulesResult.data ?? []) as ModuleInfo[]

      // Resolve module IDs in exam scope
      const scopedModuleIds = new Set<string>(
        ((scopeResult.data ?? []) as any[]).flatMap((scope) =>
          (scope.exam_scope_topics ?? [])
            .map((entry: any) => entry.topics?.module_id)
            .filter((id: unknown): id is string => typeof id === 'string')
        )
      )

      const filteredModules = scopedModuleIds.size > 0
        ? allModules.filter((m) => scopedModuleIds.has(m.id))
        : allModules

      if (!modulesResult.error) {
        setModules(filteredModules)
      }

      const run = predictionResult.data as PredictionRun | null
      if (!predictionResult.error) {
        setPredictionRun(run)
      }

      if (run?.id) {
        const exists = await checkQuestions(run.id)
        setHasQuestions(exists)
      }

      setLoading(false)
    }

    fetchData()
  }, [subjectId, checkQuestions])

  const generateQuestions = async () => {
    if (!predictionRun?.id || !subjectId) return
    setGenerateError(null)
    setIsGenerating(true)

    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId, predictionRunId: predictionRun.id }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start generation')

      // Start polling every 5 seconds
      pollingRef.current = setInterval(async () => {
        const done = await checkQuestions(predictionRun.id)
        if (done) {
          stopPolling()
          setHasQuestions(true)
          setIsGenerating(false)
        }
      }, 5000)
    } catch (err: any) {
      setGenerateError(err.message || 'Something went wrong')
      setIsGenerating(false)
    }
  }

  const hasTriggeredRef = useRef(false)

  // Auto-trigger generation as soon as page loads with a prediction run but no questions
  useEffect(() => {
    if (!loading && predictionRun && !hasQuestions && !isGenerating && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true
      generateQuestions()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, predictionRun, hasQuestions, isGenerating])

  const goToModule = (moduleId: string) => {
    router.push(`/questions/${subjectId}/${moduleId}?mode=${studyMode}`)
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        background: '#000000',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
        backgroundImage:
          'linear-gradient(rgba(124,58,237,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.07) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <nav
        className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-6 py-5"
        style={{
          backdropFilter: 'blur(12px)',
          background: 'rgba(0,0,0,0.72)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <button
          onClick={() => router.push('/dev-test')}
          className="text-sm transition-colors"
          style={{ color: 'rgba(255,255,255,0.72)', fontWeight: 600 }}
        >
          ← Back
        </button>
        <div className="min-w-0 px-4 text-center" style={{ color: '#F5F5F5', fontWeight: 700 }}>
          <span className="block truncate">{subject?.name ?? 'Questions'}</span>
        </div>
        <div
          aria-label="User avatar placeholder"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: 'rgba(124,58,237,0.18)',
            border: '1px solid rgba(124,58,237,0.35)',
          }}
        />
      </nav>

      <main className="mx-auto w-full max-w-6xl px-6 pb-20 pt-28">
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-8"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            backdropFilter: 'blur(12px)',
            padding: '28px 32px',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p style={{ color: '#A78BFA', fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>
                QUESTION MODULES
              </p>
              <h1
                style={{
                  color: '#F5F5F5',
                  fontFamily: 'Playfair Display, serif',
                  fontSize: 'clamp(2rem, 5vw, 4rem)',
                  fontWeight: 900,
                  lineHeight: 1.1,
                }}
              >
                {subject?.name ?? 'Loading subject'}
              </h1>
            </div>
            {predictionRun?.exam_type && (
              <span
                style={{
                  background: 'rgba(124,58,237,0.15)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  borderRadius: 999,
                  color: '#A78BFA',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  padding: '7px 14px',
                }}
              >
                {predictionRun.exam_type}
              </span>
            )}
          </div>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.5, ease: 'easeOut' }}
          className="mb-8 flex flex-wrap gap-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 999,
            backdropFilter: 'blur(12px)',
            padding: 6,
            width: 'fit-content',
          }}
        >
          {studyModes.map((mode) => {
            const active = studyMode === mode.value
            return (
              <button
                key={mode.value}
                onClick={() => setStudyMode(mode.value)}
                style={{
                  background: active ? '#7C3AED' : 'transparent',
                  border: active ? '1px solid #7C3AED' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 999,
                  color: active ? 'white' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  padding: '10px 16px',
                }}
              >
                {mode.icon} {mode.label}
              </button>
            )
          })}
        </motion.div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                style={{
                  animation: 'pulse 1.5s ease-in-out infinite',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 16,
                  height: 80,
                  width: '100%',
                }}
              />
            ))}
          </div>
        ) : modules.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="flex flex-col items-center justify-center text-center"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              backdropFilter: 'blur(12px)',
              minHeight: 320,
              padding: 32,
            }}
          >
            <div style={{ color: '#7C3AED', fontSize: 42, marginBottom: 16 }}>⚡</div>
            <h2 style={{ color: '#F5F5F5', fontSize: 24, fontWeight: 800 }}>No modules found</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>Upload a syllabus to get started</p>
            <button
              onClick={() => router.push('/dev-test')}
              style={{
                background: '#7C3AED',
                border: 'none',
                borderRadius: 12,
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700,
                marginTop: 24,
                padding: '12px 18px',
              }}
            >
              ← Back to Dashboard
            </button>
          </motion.div>
        ) : !hasQuestions ? (
          /* ── GENERATE BUTTON STATE ── */
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="flex flex-col items-center justify-center text-center"
            style={{
              background: 'rgba(124,58,237,0.04)',
              border: '1px solid rgba(124,58,237,0.18)',
              borderRadius: 20,
              backdropFilter: 'blur(12px)',
              minHeight: 360,
              padding: 48,
            }}
          >
            {isGenerating ? (
              /* ── GENERATING / POLLING STATE ── */
              <>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    border: '3px solid rgba(124,58,237,0.2)',
                    borderTop: '3px solid #7C3AED',
                    animation: 'spin 1s linear infinite',
                    marginBottom: 28,
                  }}
                />
                <h2 style={{ color: '#F5F5F5', fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
                  Generating your question bank…
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, maxWidth: 420 }}>
                  The AI is analyzing syllabus predictions, PYQs, and teacher hints across all modules.
                  This usually takes 30–90 seconds.
                </p>
              </>
            ) : (
              /* ── READY TO GENERATE ── */
              <>
                <div style={{ fontSize: 52, marginBottom: 20 }}>✨</div>
                <h2 style={{ color: '#F5F5F5', fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
                  Question bank not generated yet
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, maxWidth: 400, marginBottom: 32 }}>
                  Your prediction run is ready. Generate the AI-powered question bank for all modules.
                </p>
                {generateError && (
                  <p style={{ color: '#F87171', fontSize: 13, marginBottom: 16 }}>{generateError}</p>
                )}
                {!predictionRun && (
                  <p style={{ color: '#F87171', fontSize: 13, marginBottom: 16 }}>
                    No prediction run found. Run the research pipeline first.
                  </p>
                )}
                <button
                  onClick={generateQuestions}
                  disabled={!predictionRun}
                  onMouseEnter={(e) => {
                    if (predictionRun) {
                      e.currentTarget.style.background = '#6D28D9'
                      e.currentTarget.style.boxShadow = '0 0 32px rgba(124,58,237,0.45)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#7C3AED'
                    e.currentTarget.style.boxShadow = '0 0 24px rgba(124,58,237,0.3)'
                  }}
                  style={{
                    background: '#7C3AED',
                    border: 'none',
                    borderRadius: 14,
                    boxShadow: '0 0 24px rgba(124,58,237,0.3)',
                    color: 'white',
                    cursor: predictionRun ? 'pointer' : 'not-allowed',
                    fontSize: 16,
                    fontWeight: 700,
                    opacity: predictionRun ? 1 : 0.5,
                    padding: '16px 36px',
                    transition: 'all 0.2s',
                  }}
                >
                  ✨ Generate AI Question Bank
                </button>
              </>
            )}
          </motion.div>
        ) : (
          /* ── MODULE LIST (questions exist) ── */
          <div className="space-y-4">
            {modules.map((module, index) => (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
              >
                <button
                  onClick={() => goToModule(module.id)}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'
                    event.currentTarget.style.background = 'rgba(124,58,237,0.06)'
                    event.currentTarget.style.boxShadow = '0 0 24px rgba(124,58,237,0.12)'
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    event.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    event.currentTarget.style.boxShadow = 'none'
                  }}
                  style={{
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '24px 32px',
                    transition: 'all 0.2s',
                    width: '100%',
                  }}
                >
                  <span className="min-w-0 text-left">
                    <span
                      className="mb-2 block"
                      style={{ color: '#A78BFA', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}
                    >
                      Module {module.module_no}
                    </span>
                    <span style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 800 }}>{module.title}</span>
                  </span>
                  <span style={{ color: '#7C3AED', fontSize: 28, paddingLeft: 16 }}>→</span>
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
