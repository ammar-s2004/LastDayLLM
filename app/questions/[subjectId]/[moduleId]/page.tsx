'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'motion/react'
import { Mermaid } from '@/components/ui/mermaid'
import { createClient } from '@/lib/supabase-browser'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'

/**
 * Wraps <Mermaid> in a styled container that auto-hides if rendering fails.
 * The container ref checks if Mermaid rendered anything; if empty, it hides.
 */
function MermaidWrapper({ chart }: { chart: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [hasContent, setHasContent] = useState(true)

  useEffect(() => {
    // Check after a short delay to see if Mermaid rendered anything
    const timer = setTimeout(() => {
      if (wrapperRef.current) {
        const mermaidChild = wrapperRef.current.querySelector('div')
        // Mermaid returns null on failure, which removes the child div
        if (!mermaidChild || mermaidChild.innerHTML === '') {
          setHasContent(false)
        }
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [chart])

  if (!hasContent) return null

  return (
    <div
      ref={wrapperRef}
      style={{
        background: '#1a1a2e',
        borderRadius: 12,
        border: '1px solid rgba(124,58,237,0.25)',
        maxWidth: 640,
        overflow: 'auto',
        padding: 16,
      }}
    >
      <Mermaid chart={chart} />
    </div>
  )
}

type StudyMode = '3h' | '8h' | '2day'

type GeneratedQuestion = {
  id: string
  question_no: number
  question_text: string
  question_type: string | null
  estimated_marks: number | null
  probability: string | null
  study_mode_tag: number
  source_topics: string[] | null
  diagram_svg: string | null
  answer_text: string | null
  answer_diagram_type: string | null
  answer_diagram_mermaid: string | null
  answer_diagram_web_url: string | null
  answer_diagram_page_ref: { storage_path: string; page: number; filename: string } | null
  answer_sources: Array<{ filename: string; page: string | null; content_preview: string; upload_id: string }> | null
}

const studyModes: Array<{ value: StudyMode; label: string; icon: string }> = [
  { value: '3h', label: '3 Hours', icon: '⏰' },
  { value: '8h', label: '8 Hours', icon: '⏱' },
  { value: '2day', label: '2 Days', icon: '📅' },
]

function paramToString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? ''
}

function toStudyMode(value: string | null): StudyMode {
  if (value === '3h' || value === '8h' || value === '2day') {
    return value
  }

  return '2day'
}

function probabilityStyles(probability: string | null) {
  const normalized = probability?.toUpperCase()

  if (normalized === 'HIGH') {
    return {
      background: 'rgba(16,185,129,0.15)',
      border: '1px solid rgba(16,185,129,0.3)',
      color: '#10B981',
    }
  }

  if (normalized === 'MEDIUM') {
    return {
      background: 'rgba(245,158,11,0.15)',
      border: '1px solid rgba(245,158,11,0.3)',
      color: '#F59E0B',
    }
  }

  return {
    background: 'rgba(100,116,139,0.15)',
    border: '1px solid rgba(100,116,139,0.3)',
    color: '#94A3B8',
  }
}



export default function ModuleQuestionsPage() {
  return (
    <Suspense fallback={<ModuleQuestionsFallback />}>
      <ModuleQuestionsContent />
    </Suspense>
  )
}

function ModuleQuestionsFallback() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: '#000000',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
      }}
    />
  )
}

function ModuleQuestionsContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const subjectId = paramToString(params.subjectId)
  const moduleId = paramToString(params.moduleId)
  const mode = toStudyMode(searchParams.get('mode'))

  const [questions, setQuestions] = useState<GeneratedQuestion[]>([])
  const [moduleInfo, setModuleInfo] = useState<{ module_no: number; title: string } | null>(null)
  const [subjectName, setSubjectName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [studyMode, setStudyMode] = useState<'3h' | '8h' | '2day'>(mode)
  const [openPlaceholders, setOpenPlaceholders] = useState<Set<string>>(new Set())
  const [openSources, setOpenSources] = useState<Set<string>>(new Set())
  const [openDiagrams, setOpenDiagrams] = useState<Set<string>>(new Set())
  const [diagramSeen, setDiagramSeen] = useState(false)

  const fetchQuestions = useCallback(
    async (selectedMode: StudyMode) => {
      if (!moduleId) return

      setLoading(true)
      const supabase = createClient()
      let query = supabase
        .from('generated_questions')
        .select('id, question_no, question_text, question_type, estimated_marks, probability, study_mode_tag, source_topics, diagram_svg, answer_text, answer_diagram_type, answer_diagram_mermaid, answer_diagram_web_url, answer_diagram_page_ref, answer_sources')
        .eq('module_id', moduleId)
        .order('question_no', { ascending: true })

      if (selectedMode === '3h') {
        query = query.eq('study_mode_tag', 1)
      } else if (selectedMode === '8h') {
        query = query.lte('study_mode_tag', 2)
      }

      const result = await query

      if (!result.error) {
        const sortedData = [...(result.data ?? [])].sort((a: any, b: any) => {
          const rank = { HIGH: 1, MEDIUM: 2, LOW: 3 } as const
          const rankA = rank[a.probability?.toUpperCase() as keyof typeof rank] ?? 4
          const rankB = rank[b.probability?.toUpperCase() as keyof typeof rank] ?? 4
          if (rankA !== rankB) return rankA - rankB
          return (a.question_no ?? 0) - (b.question_no ?? 0)
        })
        setQuestions(sortedData as GeneratedQuestion[])
      }

      setLoading(false)
    },
    [moduleId]
  )

  useEffect(() => {
    const fetchData = async () => {
      if (!subjectId || !moduleId) return

      setLoading(true)
      const supabase = createClient()

      const [moduleResult, subjectResult] = await Promise.all([
        supabase.from('modules').select('id, module_no, title, subject_id').eq('id', moduleId).single(),
        supabase.from('subjects').select('id, name').eq('id', subjectId).single(),
      ])

      if (!moduleResult.error && moduleResult.data) {
        setModuleInfo({
          module_no: moduleResult.data.module_no,
          title: moduleResult.data.title,
        })
      }

      if (!subjectResult.error && subjectResult.data) {
        setSubjectName(subjectResult.data.name)
      }

      await fetchQuestions(mode)
    }

    setStudyMode(mode)
    fetchData()
  }, [fetchQuestions, mode, moduleId, subjectId])

  const handleModeChange = (newMode: '3h' | '8h' | '2day') => {
    setStudyMode(newMode)
    router.replace(`/questions/${subjectId}/${moduleId}?mode=${newMode}`)
    fetchQuestions(newMode)
  }

  const togglePlaceholder = (questionId: string) => {
    setOpenPlaceholders((current) => {
      const next = new Set(current)
      const wasOpen = current.has(questionId)

      if (wasOpen) {
        next.delete(questionId)
        // Clean up sources when closing
        setOpenSources((currentSources) => {
          const nextSources = new Set(currentSources)
          nextSources.delete(questionId)
          return nextSources
        })
      } else {
        next.add(questionId)
        setTimeout(() => {
          document.getElementById(`answer-${questionId}`)?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          })
        }, 100)
      }

      return next
    })
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
          onClick={() => router.push(`/questions/${subjectId}`)}
          className="text-sm transition-colors"
          style={{ color: 'rgba(255,255,255,0.72)', fontWeight: 600 }}
        >
          ← Module List
        </button>
        <div className="min-w-0 px-4 text-center" style={{ color: '#F5F5F5', fontWeight: 700 }}>
          <span className="block truncate">
            {moduleInfo ? `Module ${moduleInfo.module_no}: ${moduleInfo.title}` : 'Module Questions'}
          </span>
        </div>
        <span
          style={{
            background: 'rgba(124,58,237,0.15)',
            border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: 999,
            color: '#A78BFA',
            fontFamily: 'monospace',
            fontSize: 12,
            padding: '7px 12px',
          }}
        >
          {studyMode}
        </span>
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
            padding: '24px 32px',
          }}
        >
          <p style={{ color: '#A78BFA', fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>
            {subjectName || 'QUESTION SET'}
          </p>
          <h1
            style={{
              color: '#F5F5F5',
              fontFamily: 'Playfair Display, serif',
              fontSize: 'clamp(1.8rem, 4vw, 3rem)',
              fontWeight: 900,
              lineHeight: 1.15,
            }}
          >
            {moduleInfo ? `Module ${moduleInfo.module_no}: ${moduleInfo.title}` : 'Loading module'}
          </h1>
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
          {studyModes.map((modeOption) => {
            const active = studyMode === modeOption.value
            return (
              <button
                key={modeOption.value}
                onClick={() => handleModeChange(modeOption.value)}
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
                {modeOption.icon} {modeOption.label}
              </button>
            )
          })}
        </motion.div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                style={{
                  animation: 'pulse 1.5s ease-in-out infinite',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  height: 56,
                  width: '100%',
                }}
              />
            ))}
          </div>
        ) : questions.length === 0 ? (
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
            <div style={{ fontSize: 44, marginBottom: 16 }}>✨</div>
            <h2 style={{ color: '#F5F5F5', fontSize: 24, fontWeight: 800 }}>Questions haven&apos;t been generated yet</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
              Run &quot;Start the Research&quot; first to generate questions for this module
            </p>
            <button
              onClick={() => router.push(`/questions/${subjectId}`)}
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
              ← Back to Module List
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <div
              className="hidden gap-4 md:flex"
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                padding: '12px 24px',
                textTransform: 'uppercase',
              }}
            >
              <span style={{ minWidth: 28 }}>#</span>
              <span style={{ flex: 1 }}>Question</span>
              <span style={{ width: 92 }}>Probability</span>
              <span style={{ minWidth: 36, textAlign: 'right' }}>Marks</span>
              <span style={{ width: 36, textAlign: 'center' }}>📊</span>
              <span style={{ width: 36 }}>▶</span>
            </div>

            {questions.map((question, index) => {
              const probability = question.probability?.toUpperCase() || 'LOW'
              const showPlaceholder = openPlaceholders.has(question.id)

              return (
                <motion.div
                  key={question.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.35, ease: 'easeOut' }}
                >
                  <div
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'transparent'
                    }}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        gap: 16,
                        padding: '16px 24px',
                      }}
                    >
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.3)',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          minWidth: 28,
                        }}
                      >
                        {question.question_no}
                      </span>
                      <p
                        style={{
                          color: '#F5F5F5',
                          flex: 1,
                          fontSize: 15,
                          lineHeight: 1.5,
                        }}
                      >
                        {question.question_text}
                      </p>
                      <span
                        style={{
                          ...probabilityStyles(probability),
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          padding: '3px 10px',
                          width: 92,
                          textAlign: 'center',
                        }}
                      >
                        {probability}
                      </span>
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.4)',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          minWidth: 36,
                          textAlign: 'right',
                        }}
                      >
                        {question.estimated_marks ?? 0}M
                      </span>
                      {(() => {
                        const raw = question.diagram_svg?.trim()
                        const hasDiagram = raw && raw !== 'null' && raw !== 'undefined' && raw.length >= 8
                        if (!hasDiagram) return <span style={{ width: 36, flexShrink: 0 }} />
                        const isOpen = openDiagrams.has(question.id)
                        return (
                          <button
                            onClick={() => {
                              setDiagramSeen(true)
                              setOpenDiagrams(prev => {
                                const next = new Set(prev)
                                if (next.has(question.id)) next.delete(question.id)
                                else next.add(question.id)
                                return next
                              })
                            }}
                            title="View diagram"
                            style={{
                              alignItems: 'center',
                              background: isOpen ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.1)',
                              border: isOpen ? '1px solid #7C3AED' : '1px solid rgba(124,58,237,0.3)',
                              borderRadius: 8,
                              color: isOpen ? '#C4B5FD' : '#A78BFA',
                              cursor: 'pointer',
                              display: 'flex',
                              flexShrink: 0,
                              fontSize: 15,
                              height: 36,
                              justifyContent: 'center',
                              width: 36,
                              transition: 'all 0.2s',
                              animation: !diagramSeen ? 'diagramGlow 2s ease-in-out infinite' : 'none',
                            }}
                          >
                            📊
                          </button>
                        )
                      })()}
                      <button
                        onClick={() => togglePlaceholder(question.id)}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = '#8B5CF6'
                          event.currentTarget.style.boxShadow = '0 0 16px rgba(124,58,237,0.5)'
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = '#7C3AED'
                          event.currentTarget.style.boxShadow = 'none'
                        }}
                        style={{
                          alignItems: 'center',
                          background: '#7C3AED',
                          border: 'none',
                          borderRadius: 8,
                          color: 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          flexShrink: 0,
                          height: 36,
                          justifyContent: 'center',
                          width: 36,
                        }}
                      >
                        {showPlaceholder ? '⏹' : '▶'}
                      </button>
                    </div>

                    {(() => {
                      if (!openDiagrams.has(question.id)) return null
                      const raw = question.diagram_svg?.trim()
                      if (!raw || raw === 'null' || raw === 'undefined' || raw.length < 8) return null
                      return (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                          style={{ padding: '0 24px 16px 68px', overflow: 'hidden' }}
                        >
                          {raw.startsWith('<svg') ? (
                            <div
                              style={{
                                background: '#1a1a2e',
                                borderRadius: 12,
                                border: '1px solid rgba(124,58,237,0.25)',
                                maxWidth: 640,
                                overflow: 'auto',
                                padding: 16,
                              }}
                              dangerouslySetInnerHTML={{ __html: question.diagram_svg! }}
                            />
                          ) : (
                            <MermaidWrapper chart={raw} />
                          )}
                        </motion.div>
                      )
                    })()}
                  </div>

                  {showPlaceholder && (
                    <motion.div
                      id={`answer-${question.id}`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      style={{
                        marginTop: 16,
                        marginLeft: 64,
                        marginRight: 24,
                        marginBottom: 24,
                        padding: '24px 28px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 16,
                        overflow: 'hidden',
                      }}
                    >
                      {question.answer_text ? (
                        <>
                          <MarkdownRenderer content={question.answer_text} />

                          {question.answer_diagram_type && question.answer_diagram_type !== 'NONE' && (
                            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>

                              {/* Mermaid diagram — show whenever mermaid field is populated, regardless of type */}
                              {question.answer_diagram_mermaid && (
                                <MermaidWrapper chart={question.answer_diagram_mermaid} />
                              )}

                              {/* PDF page link — show when type is PDF_PAGE OR page_ref is populated */}
                              {question.answer_diagram_page_ref && (
                                <button
                                  onClick={async () => {
                                    const supabase = createClient()
                                    const { data } = await supabase.storage
                                      .from('resources')
                                      .createSignedUrl(question.answer_diagram_page_ref!.storage_path, 300)
                                    if (data?.signedUrl) {
                                      window.open(`${data.signedUrl}#page=${question.answer_diagram_page_ref!.page}`, '_blank')
                                    }
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    background: 'rgba(124,58,237,0.12)',
                                    border: '1px solid rgba(124,58,237,0.3)',
                                    borderRadius: 10,
                                    color: '#A78BFA',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    padding: '10px 16px',
                                    transition: 'all 0.2s',
                                    width: 'fit-content',
                                  }}
                                >
                                  📄 Teacher notes diagram — {question.answer_diagram_page_ref.filename} (p.{question.answer_diagram_page_ref.page})
                                </button>
                              )}

                              {/* Web link — show whenever web_url is populated, regardless of type */}
                              {question.answer_diagram_web_url && (
                                <a
                                  href={question.answer_diagram_web_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    background: 'rgba(59,130,246,0.12)',
                                    border: '1px solid rgba(59,130,246,0.3)',
                                    borderRadius: 10,
                                    color: '#93C5FD',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    padding: '10px 16px',
                                    textDecoration: 'none',
                                    width: 'fit-content',
                                  }}
                                >
                                  🔗 Reference diagram
                                </a>
                              )}

                            </div>
                          )}


                          {question.answer_sources && question.answer_sources.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <button
                                onClick={() => {
                                  setOpenSources((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(question.id)) next.delete(question.id)
                                    else next.add(question.id)
                                    return next
                                  })
                                }}
                                style={{
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: 8,
                                  color: 'rgba(255,255,255,0.5)',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  padding: '8px 14px',
                                  transition: 'all 0.2s',
                                }}
                              >
                                📚 Sources ({question.answer_sources.length})
                              </button>

                              {openSources.has(question.id) && (
                                <div
                                  style={{
                                    marginTop: 10,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                  }}
                                >
                                  {question.answer_sources.map((source, idx) => (
                                    <div
                                      key={idx}
                                      style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 8,
                                        padding: '10px 14px',
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          marginBottom: 4,
                                        }}
                                      >
                                        <span style={{ color: '#A78BFA', fontSize: 11, fontWeight: 700 }}>
                                          📄 {source.filename}
                                        </span>
                                        {source.page && (
                                          <span
                                            style={{
                                              color: 'rgba(255,255,255,0.35)',
                                              fontSize: 10,
                                              fontFamily: 'monospace',
                                            }}
                                          >
                                            p.{source.page}
                                          </span>
                                        )}
                                      </div>
                                      <p
                                        style={{
                                          color: 'rgba(255,255,255,0.4)',
                                          fontSize: 12,
                                          lineHeight: 1.5,
                                        }}
                                      >
                                        {source.content_preview}…
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <p style={{ color: '#A78BFA', fontSize: 13, fontStyle: 'italic' }}>
                          ⏳ Answer is being generated...
                        </p>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes diagramGlow {
          0%, 100% {
            box-shadow: 0 0 4px rgba(124,58,237,0.3);
          }
          50% {
            box-shadow: 0 0 16px rgba(124,58,237,0.7), 0 0 30px rgba(124,58,237,0.3);
          }
        }
      `}</style>
    </div>
  )
}
