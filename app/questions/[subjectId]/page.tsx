'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const fetchData = async () => {
      if (!subjectId) return

      setLoading(true)
      const supabase = createClient()

      const [subjectResult, modulesResult, predictionResult] = await Promise.all([
        supabase.from('subjects').select('id, name').eq('id', subjectId).single(),
        supabase.from('modules').select('id, module_no, title').eq('subject_id', subjectId).order('module_no', { ascending: true }),
        supabase
          .from('prediction_runs')
          .select('id, exam_type, exam_label, created_at')
          .eq('subject_id', subjectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (!subjectResult.error) {
        setSubject(subjectResult.data as SubjectInfo)
      }

      if (!modulesResult.error) {
        setModules((modulesResult.data ?? []) as ModuleInfo[])
      }

      if (!predictionResult.error) {
        setPredictionRun(predictionResult.data as PredictionRun | null)
      }

      setLoading(false)
    }

    fetchData()
  }, [subjectId])

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
        ) : (
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
      `}</style>
    </div>
  )
}
