'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { parseCombinedHints } from '@/lib/hints'

// Styles for animations
import './animations.css'

// Types
interface Subject {
  id: string
  name: string
  created_at: string
  college_assignment_factor?: number | null
  config?: {
    assignments_in_exam?: boolean
    [key: string]: any
  }
  modules?: Array<{
    id: string
    module_no: number
    title: string
    topics: Array<{
      id: string
      name: string
      topic_no?: number
      sub_topics?: string[]  // granular sub-topic names from syllabus
      parent_topic_id?: string | null
    }>
  }>
  hasSyllabus?: boolean
  hasExamScope?: boolean
  examScopeType?: string
  examScopeTopicIds?: string[]
  questions?: Array<{ id: string; question_no?: number; text: string }>
  testPaperQuestions?: Array<{ id: string; question_no?: number; text: string }>
  assignmentQuestions?: Array<{ id: string; question_no?: number; text: string }>
  teacherHints?: string | null
  paperPattern?: string | null
  hintConfidence?: 'EXACT' | 'VAGUE' | 'GUESS' | 'INFERRED' | null
  hintsLocked?: boolean
}

interface NoteFile {
  id: string
  original_filename: string
  chunk_count: number
  doc_summary: string | null
  college_id: string
  created_at: string
}

interface ChatSource {
  index: number
  filename: string
  chunk_tier: string
  score: number
  source_page_range: string | null
  section_context: string | null
  matched_topics: string[]
}

interface ChatMessage {
  role: 'user' | 'ai'
  content: string
  detected_topics?: string[]
  sources?: ChatSource[]
  chunks_used?: number
}

interface UploadStatus {
  resourceId: string
  jobId: string
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'partial'
  progress: number
  message: string
  fileName: string
  warning?: string // Optional warning message for PARTIAL status
}

interface UploadBatch {
  files: File[]
  type: string | null
  year: string | null
}

interface PredictionRun {
  id: string
  exam_type?: string | null
  exam_label?: string | null
  created_at: string
  modules_in_scope?: number[] | null
}

interface PredictionScore {
  id?: string
  topic_id: string
  final_score: number
  band: 'HIGH' | 'MEDIUM' | 'LOW'
  topics?: {
    name?: string | null
    module_id?: string | null
    parent_topic_id?: string | null
    parent?: { name?: string | null } | null
  } | null
}

type HintConfidence = 'EXACT' | 'VAGUE' | 'GUESS'

type StatusMessage = {
  type: 'success' | 'error'
  message: string
}



export default function DevTest() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<{ full_name: string | null, college: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectName, setSubjectName] = useState('')
  const [isCreatingSubject, setIsCreatingSubject] = useState(false)
  const [showSignup, setShowSignup] = useState(false)
  const [loginStatus, setLoginStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [uploadWarningOpen, setUploadWarningOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadSubjectId, setUploadSubjectId] = useState<string | null>(null)

  const [uploadResourceType, setUploadResourceType] = useState<'SYLLABUS' | 'TEST_PAPER' | 'ASSIGNMENT'>('SYLLABUS')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isSinglePaper, setIsSinglePaper] = useState(false)

  const [fileTags, setFileTags] = useState<Record<number, { type: string, year: string }>>({})
  const [taggingFileIndex, setTaggingFileIndex] = useState<number | null>(null)
  const [taggingModalOpen, setTaggingModalOpen] = useState(false)
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({})

  const [fileDuplicates, setFileDuplicates] = useState<Record<string, {
    isDuplicate: boolean
    existingAs?: string
    isChecking?: boolean
  }>>({})
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)
  const [isSavingAssignmentExamSetting, setIsSavingAssignmentExamSetting] = useState(false)

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - i))

  const [isUploading, setIsUploading] = useState(false)
  const [activeUploads, setActiveUploads] = useState<Record<string, UploadStatus>>({})
  const activeUploadsRef = useRef(activeUploads)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteSubjectId, setDeleteSubjectId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [scopeEditingSubjectId, setScopeEditingSubjectId] = useState<string | null>(null)
  const [scopeSelectedTopics, setScopeSelectedTopics] = useState<Record<string, string[] | null>>({})
  const [scopeExamType, setScopeExamType] = useState('TERM TEST 1')
  const [isSavingScope, setIsSavingScope] = useState(false)
  const [scopeConfirmOpen, setScopeConfirmOpen] = useState(false)

  const [questionsWarningOpen, setQuestionsWarningOpen] = useState(false)
  const [assignmentPrefSelected, setAssignmentPrefSelected] = useState(false)
  const [pendingAssignmentFactor, setPendingAssignmentFactor] = useState<number | null>(null)

  const [notesUploadModalOpen, setNotesUploadModalOpen] = useState(false)
  const [selectedNoteFiles, setSelectedNoteFiles] = useState<File[]>([])
  const [noteFileDuplicates, setNoteFileDuplicates] = useState<Record<string, { isDuplicate: boolean, existingAs?: string, isChecking?: boolean }>>({})
  const [isCheckingNoteDuplicates, setIsCheckingNoteDuplicates] = useState(false)
  const [uploadNoteSubjectId, setUploadNoteSubjectId] = useState<string | null>(null)

  const [expandedHintSubjectId, setExpandedHintSubjectId] = useState<string | null>(null)
  const [hintsText, setHintsText] = useState("")
  const [paperPatternText, setPaperPatternText] = useState("")
  const [confidenceLevel, setConfidenceLevel] = useState<HintConfidence>('EXACT')
  const [isSavingHints, setIsSavingHints] = useState(false)
  const [isLoadingHints, setIsLoadingHints] = useState(false)

  const [assignmentFactorSaving, setAssignmentFactorSaving] = useState<Record<string, boolean>>({})
  const [assignmentFactorStatus, setAssignmentFactorStatus] = useState<Record<string, StatusMessage | null>>({})

  const [predictionToast, setPredictionToast] = useState<StatusMessage | null>(null)
  const [predictionRuns, setPredictionRuns] = useState<Record<string, PredictionRun | null>>({})
  const [predictionScores, setPredictionScores] = useState<Record<string, PredictionScore[]>>({})
  const [predictionLoading, setPredictionLoading] = useState<Record<string, boolean>>({})
  const [predictionGenerating, setPredictionGenerating] = useState<Record<string, boolean>>({})
  const [spTruncated, setSpTruncated] = useState<Record<string, boolean>>({})
  const [skipPyqConfirm, setSkipPyqConfirm] = useState<Record<string, boolean>>({})

  const [uploadedNotes, setUploadedNotes] = useState<Record<string, NoteFile[]>>({})
  const [askAiSubjectId, setAskAiSubjectId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({})
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)

  const ACCEPTED_TYPES = {
    'SYLLABUS': ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    'TEST_PAPER': ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    'ASSIGNMENT': ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  }

  const EXAM_TYPES = ['TERM TEST 1', 'TERM TEST 2', 'END SEMISTER EXAMINATION']

  const FALLBACK_MESSAGES = [
    "💡 PYQs help analyze patterns and bolster predictions",
    "🎯 LastDayLLM identifies patterns to predict likely questions",
    "📊 AI analyzes question distribution across topics",
    "🔮 Pattern recognition reveals examiner preferences",
    "⚡ Smart topic linking ensures accurate predictions",
    "🎓 More past papers = better accuracy",
    "🧠 AI learns from thousands of exam patterns",
    "📚 Questions are mapped to topics for precise predictions"
  ]

  const [processingMessages, setProcessingMessages] = useState<string[]>(FALLBACK_MESSAGES)
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)
  const currentUploadSubject = uploadSubjectId ? subjects.find(subject => subject.id === uploadSubjectId) ?? null : null

  // EFFECTS
  useEffect(() => {
    activeUploadsRef.current = activeUploads
  }, [activeUploads])

  useEffect(() => {
    if (!predictionToast) return

    const timeout = setTimeout(() => {
      setPredictionToast(null)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [predictionToast])

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('processing_messages')
          .select('message')
          .eq('is_active', true)
          .order('created_at', { ascending: false })

        if (error) {
          console.log('[DEBUG] Messages DB error, using fallback:', error.message)
          return
        }

        if (data && data.length > 0) {
          console.log('[DEBUG] Loaded', data.length, 'messages from DB')
          setProcessingMessages(data.map(m => m.message))
        } else {
          console.log('[DEBUG] No messages in DB, using fallback')
        }
      } catch (err) {
        console.log('[DEBUG] Messages fetch failed, using fallback')
      }
    }
    loadMessages()
  }, [])

  useEffect(() => {
    const hasActiveProcessing = Object.values(activeUploads).some(
      upload => upload.status === 'processing' || upload.status === 'uploading'
    )

    if (!hasActiveProcessing) return

    setCurrentMessageIndex(prev => (prev + 1) % processingMessages.length)

    const interval = setInterval(() => {
      setCurrentMessageIndex(prevIndex => {
        if (processingMessages.length <= 1) return 0
        let newIndex = prevIndex
        let attempts = 0
        while (newIndex === prevIndex && attempts < 10) {
          newIndex = Math.floor(Math.random() * processingMessages.length)
          attempts++
        }
        return newIndex
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [activeUploads, processingMessages])

  // ✅ Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  // Login
  const login = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setLoginStatus({ type: 'error', msg: `❌ Login failed: ${error.message}` })
      return
    }

    setUser(data.user)
    setLoginStatus({ type: 'success', msg: `✅ Logged in as: ${data.user.email}` })
    setPassword('')
    loadSubjects()
  }

  // Signup
  const signup = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setLoginStatus({ type: 'error', msg: `❌ Signup failed: ${error.message}` })
      return
    }

    setLoginStatus({ type: 'success', msg: `✅ Account created! Logging you in...` })
    setTimeout(() => login(), 1000)
  }

  // Logout
  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSubjects([])
    setEmail('')
    setPassword('')
    setLoginStatus(null)
    setActiveUploads({})
  }

  // Create Subject
  const createSubject = async () => {
    if (!subjectName.trim()) {
      alert('Enter subject name')
      return
    }

    if (isCreatingSubject) return

    setIsCreatingSubject(true)

    try {
      const response = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: subjectName })
      })

      const data = await response.json()

      if (data.success) {
        setSubjectName('')
        loadSubjects()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setIsCreatingSubject(false)
    }
  }

  // ✅ Load subjects with syllabus + exam scope check + ACTIVE UPLOADS HYDRATION
  const loadSubjects = async () => {
    try {
      const response = await fetch('/api/subjects')
      const data = await response.json()

      if (data.success) {
        const subjectsWithData = await Promise.all(
          data.data.map(async (subject: Subject) => {
            // Load modules and topics
            const { data: modules } = await supabase
              .from('modules')
              .select(`
                id,
                module_no,
                title,
                topics:topics(id, name, topic_no, sub_topics, parent_topic_id)
              `)
              .eq('subject_id', subject.id)
              .order('module_no', { ascending: true })
              .order('topic_no', { foreignTable: 'topics', ascending: true })

            // ✅ Check if syllabus exists
            const { data: syllabusResource } = await supabase
              .from('resources')
              .select('id, status, created_at')
              .eq('subject_id', subject.id)
              .eq('resource_type', 'SYLLABUS')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
              
            // ✅ Fetch Uploaded Notes (COMPLETED)
            const { data: completedNotes } = await supabase
              .from('qdrant_notes_metadata')
              .select('id, original_filename, chunk_count, doc_summary, college_id, created_at')
              .eq('subject_id', subject.id)
              .eq('processing_status', 'COMPLETED')
              .order('created_at', { ascending: false })

            if (completedNotes) {
              setUploadedNotes(prev => ({ ...prev, [subject.id]: completedNotes }))
            }

            // ✅ Check for other active uploads (Test Papers / Assignments / Syllabus)
            // (In a real app, you'd fetch all active resources for this user/subject)
            const { data: activeResources } = await supabase
              .from('resources')
              .select('id, resource_type, status, created_at')
              .eq('subject_id', subject.id)
              .in('status', ['PROCESSING', 'UPLOADING', 'QUEUED'])

            // Hydrate global active uploads state for ANY active resource found
            if (activeResources && activeResources.length > 0) {
              setActiveUploads(prev => {
                const next = { ...prev }
                activeResources.forEach(res => {
                  // 🌟 SELF-HEALING: If topics exist, Syllabus is DONE. Don't hydrate it.
                  if (res.resource_type === 'SYLLABUS' && (modules && modules.length > 0)) {
                    return // Skip "stuck" syllabus uploads
                  }

                  const key = `${subject.id}-${res.resource_type}`
                  if (!next[key]) {
                    next[key] = {
                      resourceId: res.id,
                      jobId: 'restored',
                      status: res.status as any,
                      progress: 50, // improved estimated resume state
                      message: 'Resuming processing...',
                      fileName: 'Upload in progress'
                    }
                  }
                })
                return next
              })
            }

            // Check if exam scope exists
            const scopeRes = await fetch(`/api/exam-scopes?subject_id=${subject.id}`)
            const scopeData = await scopeRes.json()
            const existingScope = scopeData.scopes?.[0]

            // Fetch questions for this subject with resource_type
            const { data: allQuestions } = await supabase
              .from('questions')
              .select('id, question_no, text, resource_id, resources!inner(resource_type)')
              .eq('subject_id', subject.id)
              .order('question_no', { ascending: true })
              .limit(40)

            // Separate by resource type
            const testPaperQuestions = (allQuestions || [])
              .filter((q: any) => q.resources?.resource_type === 'TEST_PAPER')
              .map((q: any) => ({ id: q.id, question_no: q.question_no, text: q.text }))

            const assignmentQuestions = (allQuestions || [])
              .filter((q: any) => q.resources?.resource_type === 'ASSIGNMENT')
              .map((q: any) => ({ id: q.id, question_no: q.question_no, text: q.text }))

            // Fetch hints for this subject
            const { data: hintsData } = await supabase
              .from('teacher_hints')
              .select('hint_text, confidence')
              .eq('subject_id', subject.id)
              .is('exam_label', null)
              .maybeSingle()

            const parsedHints = parseCombinedHints(hintsData?.hint_text)

            return {
              ...subject,
              modules: modules || [],
              hasSyllabus: !!syllabusResource && syllabusResource.status === 'completed',
              hasExamScope: !!existingScope,
              examScopeType: existingScope?.exam_type,
              examScopeTopicIds: existingScope?.included_topic_ids || [],
              questions: allQuestions?.map((q: any) => ({ id: q.id, question_no: q.question_no, text: q.text })) || [],
              testPaperQuestions,
              assignmentQuestions,
              teacherHints: parsedHints.teacherHints || null,
              paperPattern: parsedHints.paperPattern || null,
              hintConfidence: hintsData?.confidence || null,
              hintsLocked:
                !!(parsedHints.teacherHints || parsedHints.paperPattern) ||
                subject.config?.hints_skipped === true,
              config: subject.config || {}
            }
          })
        )

        setSubjects(subjectsWithData)
      }
    } catch (error) {
      console.error('Error loading subjects:', error)
    }
  }

  useEffect(() => {
    if (!user) return
    subjects.forEach(subject => {
      fetchPredictions(subject.id)
    })
  }, [subjects.length, user])

  useEffect(() => {
    if (!user) return

    const handleFocus = () => {
      subjects.forEach(subject => {
        fetchPredictions(subject.id)
      })
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [subjects, user])


  // Open Upload Modal (Generalized)
  const openUploadModal = (subjectId: string, type: 'SYLLABUS' | 'TEST_PAPER' | 'ASSIGNMENT') => {
    const subject = subjects.find(s => s.id === subjectId)
    setUploadSubjectId(subjectId)
    setUploadResourceType(type)
    setAssignmentPrefSelected(false)
    setPendingAssignmentFactor(subject?.college_assignment_factor ?? null)
    setSelectedFiles([])
    setIsSinglePaper(false)
    // Reset tagging states for new upload
    setFileTags({})
    setTaggingFileIndex(null)
    setTaggingModalOpen(false)
    setFileErrors({})
    setFileDuplicates({}) // Reset duplicate detection state

    if (type === 'SYLLABUS') {
      // Syllabus warning check
      const subject = subjects.find(s => s.id === subjectId)
      if (subject?.hasSyllabus) {
        alert('Syllabus already uploaded.')
        return
      }
      setUploadWarningOpen(true)
    } else {
      // Show questions warning for TEST_PAPER and ASSIGNMENT
      setQuestionsWarningOpen(true)
    }
  }

  // After warning accepted
  const proceedToFileSelection = () => {
    if (uploadResourceType === 'ASSIGNMENT' && pendingAssignmentFactor !== null && uploadSubjectId) {
      updateAssignmentFactor(uploadSubjectId, pendingAssignmentFactor as 0.0 | 0.3 | 0.6 | 1.0)
    }
    setUploadWarningOpen(false)
    setQuestionsWarningOpen(false)
    setUploadModalOpen(true)
  }

  const saveSubjectConfig = async (subjectId: string, config: Record<string, any>) => {
    const response = await fetch('/api/subjects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: subjectId,
        config
      })
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || 'Failed to save subject config')
    }

    setSubjects(prev =>
      prev.map(subject =>
        subject.id === subjectId
          ? {
              ...subject,
              config: {
                ...(subject.config || {}),
                ...config
              }
            }
          : subject
      )
    )
  }

  const handleAssignmentExamPreference = async (assignmentsInExam: boolean) => {
    if (!uploadSubjectId) return

    setIsSavingAssignmentExamSetting(true)
    try {
      await saveSubjectConfig(uploadSubjectId, { assignments_in_exam: assignmentsInExam })
    } catch (error: any) {
      alert(error.message || 'Failed to save assignment preference')
    } finally {
      setIsSavingAssignmentExamSetting(false)
    }
  }

  // ✅ Client-side SHA-256 hash calculation (matches server-side)
  const calculateClientHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  /* -------------------------------------------------------------------------- */
  /*                             TEACHER HINTS LOGIC                            */
  /* -------------------------------------------------------------------------- */

  const toggleHintsInline = async (subjectId: string) => {
    if (expandedHintSubjectId === subjectId) {
      setExpandedHintSubjectId(null)
      return
    }

    setExpandedHintSubjectId(subjectId)
    setHintsText("")
    setPaperPatternText("")
    setConfidenceLevel('EXACT')
    setIsLoadingHints(true)

    try {
      const res = await fetch(`/api/subjects/teacher-hints?subject_id=${subjectId}`)
      const data = await res.json()
      if (data.success && data.hint) {
        setHintsText(data.hint.teacherHints || '')
        setPaperPatternText(data.hint.paperPattern || '')
        setConfidenceLevel(
          data.hint.confidence === 'VAGUE'
            ? 'VAGUE'
            : data.hint.confidence === 'GUESS' || data.hint.confidence === 'INFERRED'
              ? 'GUESS'
              : 'EXACT'
        )
      }
    } catch(err) {
      console.error("Failed to fetch hints", err)
    } finally {
      setIsLoadingHints(false)
    }
  }

  const saveHintsInline = async (subjectId: string) => {
    setIsSavingHints(true)
    try {
      const res = await fetch(`/api/subjects/teacher-hints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject_id: subjectId,
          teacher_hints: hintsText,
          paper_pattern: paperPatternText,
          confidence: confidenceLevel
        })
      })
      const data = await res.json()
      if (data.success) {
        setSubjects(prev =>
          prev.map(subject =>
            subject.id === subjectId
              ? {
                  ...subject,
                  teacherHints: hintsText.trim() || null,
                  paperPattern: paperPatternText.trim() || null,
                  hintConfidence: confidenceLevel,
                  hintsLocked: true
                }
              : subject
          )
        )
        setExpandedHintSubjectId(null)
      } else {
        alert("Error saving teacher hints and paper pattern.")
      }
    } catch(err) {
      console.error("Failed to save hints", err)
      alert("Error saving teacher hints and paper pattern.")
    } finally {
      setIsSavingHints(false)
    }
  }

  const skipHintsInline = async (subjectId: string) => {
    setIsSavingHints(true)
    try {
      await saveSubjectConfig(subjectId, { hints_skipped: true })
      setSubjects(prev =>
        prev.map(subject =>
          subject.id === subjectId
            ? { ...subject, hintsLocked: true }
            : subject
        )
      )
      setExpandedHintSubjectId(null)
    } catch(err) {
      console.error("Failed to skip hints", err)
      alert("Error skipping teacher hints and paper pattern.")
    } finally {
      setIsSavingHints(false)
    }
  }

  const updateAssignmentFactor = async (subjectId: string, value: 0.0 | 0.3 | 0.6 | 1.0) => {
    setAssignmentFactorSaving(prev => ({ ...prev, [subjectId]: true }))
    setAssignmentFactorStatus(prev => ({ ...prev, [subjectId]: null }))

    try {
      const res = await fetch(`/api/subjects/${subjectId}/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          college_assignment_factor: value
        })
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save assignment factor')
      }

      setSubjects(prev =>
        prev.map(subject =>
          subject.id === subjectId
            ? { ...subject, college_assignment_factor: value }
            : subject
        )
      )
      setAssignmentFactorStatus(prev => ({
        ...prev,
        [subjectId]: { type: 'success', message: 'Saved successfully.' }
      }))
      setAssignmentPrefSelected(true)
    } catch (error: any) {
      setAssignmentFactorStatus(prev => ({
        ...prev,
        [subjectId]: { type: 'error', message: error.message || 'Failed to save setting.' }
      }))
    } finally {
      setAssignmentFactorSaving(prev => ({ ...prev, [subjectId]: false }))
      setTimeout(() => {
        setAssignmentFactorStatus(prev => ({ ...prev, [subjectId]: null }))
      }, 2500)
    }
  }

  const fetchPredictions = async (subjectId: string) => {
    if (!user) return // Skip if not authenticated

    setPredictionLoading(prev => ({ ...prev, [subjectId]: true }))

    try {
      const res = await fetch(`/api/predictions?subjectId=${subjectId}`)

      // Silently skip auth errors (session may have expired)
      if (res.status === 401) {
        return
      }

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch predictions')
      }

      setPredictionRuns(prev => ({ ...prev, [subjectId]: data.run || null }))
      setPredictionScores(prev => ({ ...prev, [subjectId]: data.scores || [] }))
      setSpTruncated(prev => ({ ...prev, [subjectId]: data.spTruncated === true }))
    } catch (error) {
      console.error('Failed to fetch predictions', error)
    } finally {
      setPredictionLoading(prev => ({ ...prev, [subjectId]: false }))
    }
  }

  const generatePredictions = async (subjectId: string) => {
    setPredictionGenerating(prev => ({ ...prev, [subjectId]: true }))

    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subjectId })
      })

      const data = await res.json()
      if (res.status !== 202) {
        throw new Error(data.error || 'Failed to start predictions')
      }

      setPredictionToast({
        type: 'success',
        message: 'Prediction started — results will appear in a moment'
      })

      setTimeout(() => {
        fetchPredictions(subjectId)
      }, 2000)
    } catch (error: any) {
      setPredictionToast({
        type: 'error',
        message: error.message || 'Failed to start predictions'
      })
    } finally {
      setPredictionGenerating(prev => ({ ...prev, [subjectId]: false }))
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             NOTES UPLOAD LOGIC                             */
  /* -------------------------------------------------------------------------- */

  const openNotesUploadModal = (subjectId: string) => {
    setUploadNoteSubjectId(subjectId)
    setSelectedNoteFiles([])
    setNoteFileDuplicates({})
    setNotesUploadModalOpen(true)
  }

  const checkNoteDuplicates = async (files: File[]) => {
    if (!uploadNoteSubjectId || files.length === 0) return
    
    if (!userProfile?.college) {
      // Don't alert here as it's triggered on file selection, 
      // but we need to ensure we don't proceed with the fetch.
      return
    }
    setIsCheckingNoteDuplicates(true)

    setNoteFileDuplicates(prev => {
      const updated = { ...prev }
      files.forEach(f => {
        updated[f.name] = { isDuplicate: false, isChecking: true }
      })
      return updated
    })

    try {
      const hashResults = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          hash: await calculateClientHash(file)
        }))
      )

      const response = await fetch('/api/check-notes-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: userProfile.college,
          subject_id: uploadNoteSubjectId,
          hashes: hashResults
        })
      })

      const data = await response.json()

      if (data.success) {
        setNoteFileDuplicates(prev => {
          const updated = { ...prev }
          data.results.forEach((result: any) => {
            updated[result.filename] = {
              isDuplicate: result.isDuplicate,
              existingAs: result.existingAs,
              isChecking: false
            }
          })
          return updated
        })
      } else {
        // Clear checking state on error
        setNoteFileDuplicates(prev => {
          const updated = { ...prev }
          files.forEach(f => {
            if (updated[f.name]?.isChecking) updated[f.name] = { isDuplicate: false, isChecking: false }
          })
          return updated
        })
      }
    } catch (error) {
      console.error("Note duplicate check failed", error)
    } finally {
      setIsCheckingNoteDuplicates(false)
    }
  }

  const handleNoteFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)

      // Strictly enforce PDF ONLY
      const validPdfFiles = newFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      
      if (validPdfFiles.length !== newFiles.length) {
        alert("Only PDF files are supported! Please use the free converters linked below to convert your PPTX/DOCX files to PDF before uploading.")
        if (validPdfFiles.length === 0) {
          e.target.value = ''
          return
        }
      }

      // In-memory dedup
      const uniqueNewFiles = validPdfFiles.filter(newFile =>
        !selectedNoteFiles.some(existing => existing.name === newFile.name && existing.size === newFile.size)
      )

      if (uniqueNewFiles.length === 0) {
        e.target.value = ''
        return
      }

      if (selectedNoteFiles.length + uniqueNewFiles.length > 20) {
        alert("Max 20 notes per batch.")
        return
      }

      setSelectedNoteFiles(prev => [...prev, ...uniqueNewFiles])
      checkNoteDuplicates(uniqueNewFiles)
      e.target.value = ''
    }
  }

  const removeNoteFile = (index: number) => {
    const fileToRemove = selectedNoteFiles[index]
    setSelectedNoteFiles(prev => prev.filter((_, i) => i !== index))
    if (fileToRemove) {
      setNoteFileDuplicates(prev => {
        const next = { ...prev }
        delete next[fileToRemove.name]
        return next
      })
    }
  }

  const handleNotesUpload = async () => {
    if (selectedNoteFiles.length === 0 || !uploadNoteSubjectId) return
    
    if (!userProfile?.college) {
      alert("Please set your College in your Profile before uploading notes. This is required for RAG context.")
      return
    }

    // Filter out duplicates
    const filesToUpload = selectedNoteFiles.filter(f => !noteFileDuplicates[f.name]?.isDuplicate)

    if (filesToUpload.length === 0) {
      alert("All selected files are already uploaded.")
      return
    }

    setIsUploading(true)
    const uploadKey = `${uploadNoteSubjectId}-NOTES`

    setActiveUploads(prev => ({
      ...prev,
      [uploadKey]: {
        resourceId: 'temp-notes-' + Date.now(),
        jobId: 'notes-init',
        status: 'uploading',
        progress: 0,
        message: `Starting upload of ${filesToUpload.length} note(s)...`,
        fileName: `${filesToUpload.length} notes`
      }
    }))

    setNotesUploadModalOpen(false)

    try {
      // Remove the single temp placeholder initially since we'll create individual ones
      setActiveUploads(prev => {
        const { [uploadKey]: _, ...rest } = prev
        return rest
      })

      // Upload all files using notes-v2 API in parallel
      const uploadPromises = filesToUpload.map(async (file, i) => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('college_id', userProfile?.college ?? '')
        formData.append('subject_id', uploadNoteSubjectId)

        const fileUploadKey = `${uploadKey}-${i}`
        
        // Setup individual temp status for this file
        setActiveUploads(prev => ({
          ...prev,
          [fileUploadKey]: {
            resourceId: `temp-notes-${Date.now()}-${i}`,
            jobId: 'notes-init',
            status: 'uploading',
            progress: 0,
            message: `Uploading ${file.name}...`,
            fileName: file.name
          }
        }))

        try {
          const response = await fetch('/api/notes-v2/upload', {
            method: 'POST',
            body: formData
          })

          const data = await response.json()

          if (data.success) {
            // Use metadata_id as the key so each file has an isolated, unique progress entry.
            const stableKey = `NOTES-${data.metadata_id}`

            // Remove the temp placeholder and set the real entry
            setActiveUploads(prev => {
              const { [fileUploadKey]: _, ...rest } = prev
              return {
                ...rest,
                [stableKey]: {
                  resourceId: data.metadata_id,
                  jobId: data.run_id || 'pending', // Real Trigger runId for accurate polling
                  status: 'processing',
                  progress: 5,
                  message: '⏳ Processing started...',
                  fileName: file.name,
                } as UploadStatus,
              }
            })
          } else {
            throw new Error(data.error || "Upload failed")
          }
        } catch (error: any) {
          console.error(`Failed to upload ${file.name}:`, error)
          setActiveUploads(prev => ({
            ...prev,
            [fileUploadKey]: {
              ...prev[fileUploadKey],
              status: 'failed',
              message: error.message || "Upload failed",
              progress: 100
            }
          }))
          // Auto-dismiss failed temp keys after 10s so they don't linger
          setTimeout(() => {
            setActiveUploads(prev => {
              const { [fileUploadKey]: _, ...rest } = prev
              return rest
            })
          }, 10000)
        }
      })

      await Promise.all(uploadPromises)

      loadSubjects()
    } finally {
      setIsUploading(false)
      setSelectedNoteFiles([])
      setNoteFileDuplicates({})
    }
  }

  // ✅ Check selected files for duplicates against DB
  const checkFilesForDuplicates = async (files: File[]) => {
    if (!uploadSubjectId || files.length === 0) return

    setIsCheckingDuplicates(true)

    // Mark all files as checking
    setFileDuplicates(prev => {
      const updated = { ...prev }
      files.forEach(f => {
        updated[f.name] = { isDuplicate: false, isChecking: true }
      })
      return updated
    })

    try {
      // Calculate hashes for all files in parallel
      const hashResults = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          hash: await calculateClientHash(file)
        }))
      )

      // Call API to check against DB
      const response = await fetch('/api/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_id: uploadSubjectId,
          hashes: hashResults
        })
      })

      const data = await response.json()

      if (data.success) {
        // Update duplicate state from API results
        setFileDuplicates(prev => {
          const updated = { ...prev }
          data.results.forEach((result: any) => {
            updated[result.filename] = {
              isDuplicate: result.isDuplicate,
              existingAs: result.existingAs,
              isChecking: false
            }
          })
          return updated
        })

        // If all files are duplicates, show an alert
        if (data.duplicateCount > 0 && data.duplicateCount === files.length) {
          console.log('[DUPLICATE] All selected files already exist in DB')
        }
      } else {
        // Clear checking state on error
        setFileDuplicates(prev => {
          const updated = { ...prev }
          files.forEach(f => {
            if (updated[f.name]?.isChecking) {
              updated[f.name] = { isDuplicate: false, isChecking: false }
            }
          })
          return updated
        })
      }
    } catch (error) {
      console.error('[DUPLICATE] Check failed:', error)
      // Clear checking state on error
      setFileDuplicates(prev => {
        const updated = { ...prev }
        files.forEach(f => {
          if (updated[f.name]?.isChecking) {
            updated[f.name] = { isDuplicate: false, isChecking: false }
          }
        })
        return updated
      })
    } finally {
      setIsCheckingDuplicates(false)
    }
  }

  // ✅ Handle File Input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)

      // Deduplication: Filter out files that are already selected
      const uniqueNewFiles = newFiles.filter(newFile => {
        const isDuplicate = selectedFiles.some(
          existing => existing.name === newFile.name && existing.size === newFile.size
        )
        return !isDuplicate
      })

      // Alert if filtering happened
      if (uniqueNewFiles.length < newFiles.length) {
        alert(`Skipped ${newFiles.length - uniqueNewFiles.length} duplicate file(s).`)
      }

      if (uniqueNewFiles.length === 0) {
        e.target.value = ''
        return
      }

      // SYLLABUS CONSTRAINTS
      if (uploadResourceType === 'SYLLABUS') {
        const currentFiles = [...selectedFiles, ...uniqueNewFiles]
        const imageCount = currentFiles.filter(f => f.type.startsWith('image/')).length

        if (imageCount !== currentFiles.length) {
          alert("Syllabus uploads are images only (PNG, JPEG, WebP).")
          return
        }

        if (imageCount > 3) {
          alert("Syllabus can be max 3 images only (PNG, JPEG, WebP).")
          return
        }
      } else {
        // TEST_PAPER / ASSIGNMENT CONSTRAINTS
        if (selectedFiles.length + uniqueNewFiles.length > 10) {
          alert("Max 10 files allowed.")
          return
        }
      }

      setSelectedFiles(prev => [...prev, ...uniqueNewFiles])
      // Trigger duplicate check for newly added files
      checkFilesForDuplicates(uniqueNewFiles)
      // Reset file input so same file can be re-selected
      e.target.value = ''
    }
  }

  const removeFile = (index: number) => {
    const fileToRemove = selectedFiles[index]
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    // Clean up duplicate state for removed file
    if (fileToRemove) {
      setFileDuplicates(prev => {
        const updated = { ...prev }
        delete updated[fileToRemove.name]
        return updated
      })
    }
    // Clean up tags
    setFileTags(prev => {
      const next = { ...prev }
      delete next[index]
      // Shift keys if needed, but simpler to just rebuild or let indices shift? 
      // Actually, removing index i shifts all subsequent indices down by 1.
      // We need to re-key the map to match new indices.
      const rekeyed: Record<number, { type: string, year: string }> = {}
      Object.keys(next).forEach(keyStr => {
        const key = parseInt(keyStr)
        if (key < index) rekeyed[key] = next[key]
        if (key > index) rekeyed[key - 1] = next[key]
      })
      return rekeyed
    })
  }

  // ✅ Handle Upload Logic
  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !uploadSubjectId) return

    // ✅ Filter out files marked as duplicates (already in DB)
    const filesToUpload = selectedFiles.filter(f => !fileDuplicates[f.name]?.isDuplicate)

    if (filesToUpload.length === 0) {
      alert('All selected files are duplicates and already exist in the database.')
      return
    }

    setIsUploading(true)
    const uploadKey = `${uploadSubjectId}-${uploadResourceType}`

    // Group files by tag for Test Papers / Assignments
    const batches: UploadBatch[] = []
    if (uploadResourceType === 'SYLLABUS') {
      batches.push({ files: filesToUpload, type: null, year: null })
    } else {
      // Need to map filesToUpload back to their original indices for tags
      filesToUpload.forEach((file) => {
        const originalIdx = selectedFiles.indexOf(file)
        const tag = fileTags[originalIdx]
        // Should validation be here? Button is disabled if invalid, so we assume valid.
        if (tag?.type && tag?.year) {
          let group = batches.find(b => b.type === tag.type && b.year === tag.year)
          if (!group) {
            group = { type: tag.type, year: tag.year, files: [] }
            batches.push(group)
          }
          group.files.push(file)
        }
      })
    }

    // Initialize Global Progress
    setActiveUploads(prev => ({
      ...prev,
      [uploadKey]: {
        resourceId: 'temp-' + Date.now(),
        jobId: 'batch-init',
        status: 'uploading',
        progress: 0,
        message: `Starting upload of ${batches.length} batch${batches.length > 1 ? 'es' : ''}...`,
        fileName: `${selectedFiles.length} files`
      }
    }))

    setUploadModalOpen(false)
    setFileErrors({})

    try {
      let completedBatches = 0;
      let hasErrors = false;
      let lastResourceId = null;

      // Process batches sequentially
      for (const batch of batches) {
        const currentBatchNum = completedBatches + 1;

        // Update status for current batch
        setActiveUploads(prev => ({
          ...prev,
          [uploadKey]: {
            ...prev[uploadKey],
            message: `Uploading batch ${currentBatchNum}/${batches.length} (${batch.files.length} files)...`,
            progress: Math.floor((completedBatches / batches.length) * 50) + 10 // visual progress base
          }
        }))

        const formData = new FormData()
        batch.files.forEach(file => formData.append('file', file))
        formData.append('subject_id', uploadSubjectId)
        formData.append('resource_type', uploadResourceType)

        if (uploadResourceType !== 'SYLLABUS') {
          formData.append('is_single_paper', 'false') // Always false for now as per "useless" feedback
          if (batch.type) formData.append('exam_type', batch.type)
          if (batch.year) formData.append('exam_year', batch.year)
        }

        const response = await fetch('/api/upload-document', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()

        if (data.success) {
          completedBatches++
          // Keep track of one ID for polling (naive but works for shared key)
          if (data.resource_ids?.length > 0) {
            lastResourceId = data.resource_ids[0]
          }
        } else {
          hasErrors = true
          // Handle Duplicate Errors
          if (data.code === 'DUPLICATE_FILES') {
            const newErrors: Record<string, string> = {}
            batch.files.forEach(f => newErrors[f.name] = "Duplicate")
            setFileErrors(prev => ({ ...prev, ...newErrors }))
          } else if (data.invalidFiles) {
            const newErrors: Record<string, string> = {}
            data.invalidFiles.forEach((inv: any) => newErrors[inv.filename] = inv.reason.slice(0, 20)) // Truncate
            setFileErrors(prev => ({ ...prev, ...newErrors }))
          }
          console.error('Batch upload failed', data)
          // Continue to try other batches? Or fail all? 
          // Better to try others.
        }
      }

      if (lastResourceId && !hasErrors) {
        setActiveUploads(prev => ({
          ...prev,
          [uploadKey]: {
            ...prev[uploadKey],
            resourceId: lastResourceId,
            jobId: 'batch-complete', // We switch to polling
            status: 'processing',
            progress: 50,
            message: `Uploads complete. Starting AI analysis...`
          }
        }))

        setSelectedFiles([])
        setFileTags({})
        loadSubjects()

        // Start polling the LAST resource. 
        // NOTE: This is a limitation. If we upload 3 batches, we only poll one.
        // Ideally we should poll all or have a master job. 
        // For MVP, polling one usually triggers the global list refresh eventually.
        checkUploadStatus(lastResourceId, uploadKey)

      } else {
        setActiveUploads(prev => ({
          ...prev,
          [uploadKey]: {
            ...prev[uploadKey],
            status: 'failed',
            message: hasErrors ? 'Some uploads failed' : 'Upload failed',
            progress: 100
          }
        }))
        alert('Some items failed to upload. Please check and try again.')
      }

    } catch (error: any) {
      setActiveUploads(prev => ({
        ...prev,
        [uploadKey]: {
          ...prev[uploadKey],
          status: 'failed',
          message: 'Connection error',
          progress: 100
        }
      }))
      alert('Upload error: ' + error.message)
    } finally {
      setIsUploading(false)
    }
  }

  // Check Upload Status Logic for NOTES (polls job_progress by job_id)
  const checkNotesUploadStatus = async (metadataId: string, jobId: string, uploadKey: string) => {
    try {
      // 1. Get the latest progress from job_progress using the real Trigger job_id
      const { data: progressRows } = await supabase
        .from('job_progress')
        .select('stage, progress, message, status')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)

      const latest = progressRows?.[0]

      if (latest) {
        const isCompleted = latest.status === 'COMPLETED' || latest.progress >= 100
        const isFailed = latest.status === 'FAILED' && latest.progress === 0

        setActiveUploads(prev => {
          if (!prev[uploadKey]) return prev // Guard: entry may have been dismissed
          return {
            ...prev,
            [uploadKey]: {
              ...prev[uploadKey],
              progress: latest.progress,
              message: latest.message || 'Processing...',
              status: isCompleted ? 'completed' : isFailed ? 'failed' : 'processing',
            }
          }
        })

        if (isCompleted) {
          loadSubjects()
          setTimeout(() => {
            setActiveUploads(prev => {
              const { [uploadKey]: _, ...rest } = prev
              return rest
            })
          }, 5000)
        }
        return // Done with notes check
      }

      // 2. Fallback: poll qdrant_notes_metadata status directly
      const { data: meta } = await supabase
        .from('qdrant_notes_metadata')
        .select('processing_status')
        .eq('id', metadataId)
        .single()

      if (meta?.processing_status === 'COMPLETED') {
        setActiveUploads(prev => ({
          ...prev,
          [uploadKey]: { ...prev[uploadKey], status: 'completed', progress: 100, message: '✅ Done!' }
        }))
        loadSubjects()
        setTimeout(() => {
          setActiveUploads(prev => {
            const { [uploadKey]: _, ...rest } = prev
            return rest
          })
        }, 5000)
      } else if (meta?.processing_status === 'FAILED') {
        setActiveUploads(prev => ({
          ...prev,
          [uploadKey]: { ...prev[uploadKey], status: 'failed', progress: 100, message: '❌ Processing failed' }
        }))
      }

    } catch (error) {
      console.error('[DEBUG] Error checking notes upload status:', error)
    }
  }

  // Check Upload Status Logic (with debug logging) - for legacy resources table uploads
  const checkUploadStatus = async (resourceId: string, uploadKey: string) => {
    try {
      // Get the job_id from activeUploads state
      const upload = activeUploads[uploadKey]
      const jobId = upload?.jobId

      // 1. Get resource status and potential warnings
      const { data: resource, error: resourceError } = await supabase
        .from('resources')
        .select('status, warning_message')
        .eq('id', resourceId)
        .single()

      if (resourceError) {
        console.error('[DEBUG] Resource query error:', resourceError)
        return
      }

      // 2. Get progress - try job_id first, fallback to resource_id
      let latestProgress = null

      // Try by job_id first (for batched uploads)
      if (jobId && jobId !== 'batch-job' && !jobId.startsWith('batch-')) {
        const { data: progressEntries } = await supabase
          .from('job_progress')
          .select('*')
          .eq('job_id', jobId)
          .order('created_at', { ascending: false })
          .limit(1)

        if (progressEntries && progressEntries.length > 0) {
          latestProgress = progressEntries[0]
        }
      }

      // Fallback: Try by resource_id if job_id query found nothing
      if (!latestProgress) {
        const { data: progressByResource } = await supabase
          .from('job_progress')
          .select('*')
          .eq('resource_id', resourceId)
          .order('created_at', { ascending: false })
          .limit(1)

        if (progressByResource && progressByResource.length > 0) {
          latestProgress = progressByResource[0]
        }
      }

      // Debug logging
      console.log('[DEBUG] checkUploadStatus:', {
        resourceId,
        uploadKey,
        jobId,
        resourceStatus: resource?.status,
        latestProgress: latestProgress?.progress,
        latestMessage: latestProgress?.message
      })

      if (resource) {
        const newStatus = resource.status.toLowerCase() as UploadStatus['status']
        const isFinished = newStatus === 'completed' || newStatus === 'partial' || newStatus === 'failed'
        const currentUpload = activeUploads[uploadKey]

        // Calculate progress: use DB value, or simulate if none found
        let calculatedProgress = latestProgress?.progress ?? currentUpload?.progress ?? 0
        let calculatedMessage = latestProgress?.message ?? currentUpload?.message ?? 'Processing...'

        // FALLBACK: If still processing but no DB progress, simulate gradual increase
        if (newStatus === 'processing' && !latestProgress) {
          const currentProgress = currentUpload?.progress ?? 0
          // Slowly increment up to 85% while waiting for real progress
          if (currentProgress < 85) {
            calculatedProgress = Math.min(currentProgress + 3, 85)
            calculatedMessage = 'AI analysis in progress...'
          }
        }

        // FORCE 100% when finished (even if DB didn't write final progress)
        if (isFinished) {
          calculatedProgress = 100
          if (!latestProgress?.message) {
            calculatedMessage = 'Complete!'
          }
        }

        setActiveUploads(prev => ({
          ...prev,
          [uploadKey]: {
            ...prev[uploadKey],
            status: newStatus,
            progress: calculatedProgress,
            message: calculatedMessage,
            warning: resource.warning_message || undefined
          }
        }))

        if (newStatus === 'completed' || newStatus === 'partial') {
          console.log('[DEBUG] Upload completed, refreshing subjects')
          // Refresh data for ALL upload types (not just syllabus)
          loadSubjects()

          // Auto-dismiss after delay
          setTimeout(() => {
            setActiveUploads(prev => {
              const { [uploadKey]: _, ...rest } = prev
              return rest
            })
          }, 5000)
        }
        else if (newStatus === 'failed') {
          // Check if it's a transient error (model overloaded, etc.)
          const msg = latestProgress?.message || ''
          const isTransient = msg.includes('overloaded') || msg.includes('503') || msg.includes('retry')

          if (isTransient) {
            // Keep as "processing" but show retry message
            setActiveUploads(prev => ({
              ...prev,
              [uploadKey]: {
                ...prev[uploadKey],
                status: 'processing',
                message: 'Model busy, retrying automatically...',
              }
            }))
          } else {
            console.log('[DEBUG] Upload failed permanently')
          }
        }
      }
    } catch (error) {
      console.error('[DEBUG] Error checking upload status:', error)
    }
  }

  // Delete subject
  const deleteSubject = async () => {
    if (deleteConfirmText !== 'DELETE' || !deleteSubjectId) return

    try {
      const response = await fetch(`/api/subjects?id=${deleteSubjectId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (!data.success) {
        alert('Delete failed: ' + (data.error || 'Unknown error'))
      } else {
        setActiveUploads(prev => {
          // Clear any uploads for this subject
          const newUploads = { ...prev }
          Object.keys(newUploads).forEach(k => {
            if (k.startsWith(deleteSubjectId)) delete newUploads[k]
          })
          return newUploads
        })

        setDeleteConfirmOpen(false)
        setDeleteSubjectId(null)
        setDeleteConfirmText('')
        loadSubjects()
      }
    } catch (error: any) {
      alert('Error: ' + error.message)
    }
  }

  // Check session on mount
  // Check session on mount
  useEffect(() => {
    setLoading(true)

    // ✅ 1. Add Timeout Fallback
    const timeout = setTimeout(() => {
      console.error('[TIMEOUT] Page took too long to load')
      setLoadError('Loading timed out. Please refresh.')
      setLoading(false)
    }, 10000) // 10 second fallback

    const checkSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
        if (user) {
          // ✅ 2. Await loadSubjects to ensure it completes
          await loadSubjects()

          // Profile fetch with its own error handling
          fetch('/api/profile')
            .then(res => res.json())
            .then(data => {
              if (data.success && data.data) {
                setUserProfile(data.data)
              }
            })
            .catch(console.error)
        }
      } catch (error) {
        console.error('Session check failed:', error)
        setLoadError('Failed to load session.')
      } finally {
        // ✅ 3. Always clear loading state
        clearTimeout(timeout)
        setLoading(false)
      }
    }

    checkSession()
  }, [])

  // ✅ Smart polling (Global for all active uploads)
  // activeUploadsRef is declared at the top of the component (line ~98) and kept in sync.
  // We use it here to read fresh state inside the interval without adding it as a dependency.

  useEffect(() => {
    const interval = setInterval(() => {
      const current = activeUploadsRef.current
      Object.entries(current).forEach(([key, upload]) => {
        const isActive = upload.status === 'processing' || upload.status === 'uploading'
        if (!isActive) return

        // Notes uploads: key starts with 'NOTES-'
        if (key.startsWith('NOTES-')) {
          // Skip dead temp keys that failed before getting a real metadata_id
          if (upload.jobId === 'notes-init' && upload.status === 'failed') return
          checkNotesUploadStatus(upload.resourceId, upload.jobId || '', key).catch(console.error)
          return
        }

        // Legacy uploads: poll resources table (syllabus, papers, etc.)
        if (upload.resourceId && !upload.resourceId.startsWith('temp')) {
          checkUploadStatus(upload.resourceId, key).catch(console.error)
        }
      })
    }, 2000) // 2s interval is enough; reduces DB load vs 1s

    return () => clearInterval(interval)
  }, []) // ← Empty array: interval is created once. It reads fresh state via the ref.

  // ✅ EXAM SCOPE FUNCTIONS
  const startScopeEdit = (subject: Subject) => {
    if (subject.hasExamScope) {
      alert('Exam scope already exists. Delete subject to reset (MVP limit).')
      return
    }
    setScopeEditingSubjectId(subject.id)
    setScopeSelectedTopics({})
    setScopeExamType('TERM TEST 1')
  }

  const toggleScopeTopic = (topicId: string) => {
    setScopeSelectedTopics(prev => {
      const next = { ...prev }
      if (topicId in next) {
        delete next[topicId] // deselect topic (and its sub-topics)
      } else {
        next[topicId] = null // null = all sub-topics included
      }
      return next
    })
  }

  // Toggle a specific sub-topic within a topic
  const toggleScopeSubTopic = (topicId: string, subTopic: string, allSubTopics: string[]) => {
    setScopeSelectedTopics(prev => {
      const next = { ...prev }
      const current = next[topicId] // null | string[] | undefined
      if (current === undefined) {
        // Topic wasn't selected — select it with only this sub-topic
        next[topicId] = [subTopic]
      } else if (current === null) {
        // Was all-selected — deselect just this one
        next[topicId] = allSubTopics.filter(s => s !== subTopic)
        if (next[topicId]!.length === 0) delete next[topicId] // nothing left
      } else {
        // Partial list — toggle within it
        const idx = current.indexOf(subTopic)
        if (idx >= 0) {
          const updated = current.filter(s => s !== subTopic)
          if (updated.length === 0) delete next[topicId]
          else next[topicId] = updated
        } else {
          const updated = [...current, subTopic]
          // If now all are selected, simplify to null
          next[topicId] = updated.length === allSubTopics.length ? null : updated
        }
      }
      return next
    })
  }

  const toggleScopeModule = (topics: Array<{ id: string }>) => {
    const topicIds = topics.map(t => t.id)
    const allSelected = topicIds.every(id => id in scopeSelectedTopics)
    setScopeSelectedTopics(prev => {
      const next = { ...prev }
      if (allSelected) {
        topicIds.forEach(id => delete next[id])
      } else {
        topicIds.forEach(id => { if (!(id in next)) next[id] = null })
      }
      return next
    })
  }

  const cancelScopeEdit = () => {
    setScopeEditingSubjectId(null)
    setScopeSelectedTopics({})
  }

  const saveExamScope = async (subjectId: string) => {
    const selectedCount = Object.keys(scopeSelectedTopics).length
    if (selectedCount === 0) {
      alert('Please select at least one topic.')
      return
    }

    setIsSavingScope(true)
    try {
      const included_topics = Object.entries(scopeSelectedTopics).map(([topic_id, selected_sub_topics]) => ({
        topic_id,
        selected_sub_topics, // null = all, string[] = specific ones
      }))

      const res = await fetch('/api/exam-scopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_id: subjectId,
          exam_type: scopeExamType,
          included_topics,
        })
      })
      const data = await res.json()
      if (data.success) {
        setScopeEditingSubjectId(null)
        setScopeSelectedTopics({})
        loadSubjects()
      } else {
        alert(data.error || 'Failed to save exam scope')
      }
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setIsSavingScope(false)
    }
  }

  // RENDER HELPERS
  const renderUploadStatus = (uploadKey: string, label: string) => {
    const upload = activeUploads[uploadKey]
    if (!upload) return null

    // Determine styling based on status
    const isProcessing = upload.status === 'processing' || upload.status === 'uploading'
    const isCompleted = upload.status === 'completed'
    const isFailed = upload.status === 'failed'
    const isPartial = upload.status === 'partial'

    return (
      <div key={uploadKey} className={`mb-4 p-4 rounded-xl border flex flex-col gap-3 shadow-lg transition-all transform animate-in fade-in slide-in-from-bottom-2 ${isCompleted ? 'bg-gradient-to-r from-emerald-950/80 to-emerald-900/40 border-emerald-500/50 shadow-emerald-900/20' :
        isFailed ? 'bg-gradient-to-r from-red-950/80 to-red-900/40 border-red-500/50 shadow-red-900/20' :
          isPartial ? 'bg-gradient-to-r from-amber-950/80 to-amber-900/40 border-amber-500/50 shadow-amber-900/20 animate-pulse-subtle' :
            'bg-gradient-to-r from-blue-950/80 to-blue-900/40 border-blue-500/50 shadow-blue-900/20 animate-pulse-subtle'
        }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-blue-400 animate-ping' :
              isCompleted ? 'bg-emerald-400' :
                isFailed ? 'bg-red-400' : 'bg-amber-400'
              }`} />

            {(isPartial && upload.warning) && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                Warning
              </span>
            )}

            <span className="text-sm font-semibold text-slate-100 tracking-wide">
              {label}
            </span>

            {isPartial && (
              <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                Partial Result
              </span>
            )}
          </div>
          <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${isCompleted ? 'bg-emerald-500/20 text-emerald-300' :
            isPartial ? 'bg-amber-500/20 text-amber-300' :
              'bg-blue-500/20 text-blue-300'
            }`}>{upload.progress}%</span>
        </div>

        {/* Progress Bar Container */}
        <div className="flex flex-col gap-3 w-full">
          {isProcessing && (
            <div className="flex items-center gap-4 w-full animate-in fade-in slide-in-from-left-2 duration-500">
              <img 
                src="/hydra-logo.png" 
                alt="Hydra Thinking" 
                className="w-16 h-16 object-contain animate-[pulse_1s_ease-in-out_infinite] drop-shadow-[0_0_15px_rgba(168,85,247,1)] brightness-125 flex-shrink-0" 
              />
              <div className="bg-white text-slate-900 text-[11px] sm:text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex-1 border-l-4 border-purple-600 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-full bg-gradient-to-l from-purple-100/50 to-transparent pointer-events-none"></div>
                <span className="relative z-10">
                  {upload.message === 'Processing...' || upload.message?.includes('batch') || upload.message?.includes('progress') 
                    ? processingMessages[currentMessageIndex] 
                    : upload.message}
                </span>
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-3 w-full">
            <div className="w-full bg-slate-900/50 rounded-full h-2 overflow-hidden border border-slate-700/50 flex-1">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden ${isCompleted ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                isFailed ? 'bg-gradient-to-r from-red-500 to-red-400' :
                  isPartial ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                    'bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 bg-[length:200%_100%] animate-shimmer'
                }`}
              style={{ width: `${upload.progress}%` }}
            >
              {/* Shine effect */}
              <div className="absolute top-0 left-0 bottom-0 right-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 translate-x-[-100%] animate-shine" />
            </div>
          </div>
        </div>
        </div>

        {(!isProcessing || (isPartial && upload.warning)) && (
          <div className="flex flex-col gap-2 mt-1">
            {!isProcessing && upload.message && (
              <div className="flex justify-between items-center text-xs">
                <p className="text-slate-300 truncate font-medium flex-1 mr-2">{upload.message}</p>
              </div>
            )}

            {/* Warning Banner for Partial results */}
            {isPartial && upload.warning && (
              <div className="bg-amber-950/30 border border-amber-500/40 rounded p-2 text-[11px] text-amber-200 flex items-start gap-2 animate-in slide-in-from-top-1">
                <span>⚠️</span>
                <span>{upload.warning}</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center relative">
        {/* AI Generated Space Background */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none opacity-60 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: `url('/space_universe_bg.png')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/40 to-slate-950/90"></div>
        </div>
        
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
          {loadError && (
            <p className="text-red-400 mt-2 font-medium">{loadError}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 relative">
      {/* AI Generated Space Background */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-60 bg-cover bg-center bg-fixed"
        style={{ backgroundImage: `url('/space_universe_bg.png')` }}
      >
        {/* Dark gradient overlay to blend and ensure text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/40 to-slate-950/90"></div>
      </div>
      
      <div className="max-w-7xl mx-auto relative z-10">
        {predictionToast && (
          <div className="fixed top-5 right-5 z-[120]">
            <div
              className={`px-4 py-3 rounded-xl border shadow-2xl text-sm font-medium ${
                predictionToast.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/95 border-red-500/40 text-red-200'
              }`}
            >
              {predictionToast.message}
            </div>
          </div>
        )}
        {/* ✅ GREETING HEADER WITH PROFILE */}
        {user && (
          <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex items-center gap-5">
              <img 
                src="/hydra-logo.png" 
                alt="Hydra Logo" 
                className="w-24 h-24 md:w-28 md:h-28 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]" 
              />
              <h1 className="text-5xl md:text-6xl font-light text-slate-300 tracking-wide" style={{ fontFamily: 'Georgia, serif', color: 'beige' }}>
                {getGreeting().replace('Good ', '')}, {userProfile?.full_name || (user.email?.split('@')[0] || 'User').charAt(0).toUpperCase() + (user.email?.split('@')[0] || 'User').slice(1)}
              </h1>
            </div>

            <div className="flex items-center gap-3 translate-y-1">
              <span className="text-slate-400 text-sm hidden md:inline">{user.email}</span>
              <button
                onClick={() => router.push('/profile')}
                className="px-4 py-2 bg-slate-800 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 transition text-sm"
              >
                👤 Profile
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        )}

        <div className="bg-red-600 text-white p-4 rounded-lg mb-6 font-medium">
          ⚠️ DEV ONLY - Delete this file before production deployment
        </div>

        {/* Login/Signup Section */}
        {!user && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-sky-400">
                {showSignup ? '1. Signup' : '1. Login'}
              </h2>
              <button
                onClick={() => {
                  setShowSignup(!showSignup)
                  setLoginStatus(null)
                }}
                className="text-sky-400 text-sm hover:underline"
              >
                {showSignup ? 'Already have account? Login' : 'New user? Signup'}
              </button>
            </div>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full px-4 py-2 bg-slate-950 border border-slate-600 rounded-lg mb-3 text-slate-200 focus:outline-none focus:border-sky-400"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (showSignup ? signup() : login())}
              placeholder="Enter password (min 6 characters)"
              className="w-full px-4 py-2 bg-slate-950 border border-slate-600 rounded-lg mb-3 text-slate-200 focus:outline-none focus:border-sky-400"
            />

            <button
              onClick={showSignup ? signup : login}
              disabled={!email || !password}
              className="w-full px-4 py-2 bg-sky-400 text-slate-950 font-semibold rounded-lg hover:bg-sky-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {showSignup ? 'Create Account' : 'Login'}
            </button>

            {loginStatus && (
              <div className={`mt-4 p-3 rounded-lg ${loginStatus.type === 'success' ? 'bg-green-600' : 'bg-red-600'
                }`}>
                {loginStatus.msg}
              </div>
            )}
          </div>
        )}

        {/* Subjects Section */}
        {user && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-sky-400 mb-4">Your Subjects</h2>

            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isCreatingSubject && createSubject()}
                placeholder="Subject name (e.g., Blockchain Technology)"
                className="flex-1 px-4 py-2 bg-slate-950 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-sky-400"
              />

              <button
                onClick={createSubject}
                disabled={isCreatingSubject || !subjectName.trim()}
                className="px-6 py-2 bg-sky-400 text-slate-950 font-semibold rounded-lg hover:bg-sky-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingSubject ? 'Creating...' : 'Create Subject'}
              </button>
            </div>

            {/* Subjects List */}
            <div className="space-y-4">
              {subjects.length === 0 ? (
                <p className="text-slate-500 text-center py-8">
                  No subjects yet. Create one above!
                </p>
              ) : (
                subjects.map((subject) => {

                  const allTopics = subject.modules?.flatMap(m => m.topics) || []
                  const displayTopics = allTopics.slice(0, 4)
                  const hasMoreTopics = allTopics.length > 4
                  const pyqsSkipped = subject.config?.pyqs_skipped === true
                  const canGeneratePredictions =
                    subject.hasSyllabus === true &&
                    subject.hasExamScope === true &&
                    ((subject.testPaperQuestions?.length ?? 0) > 0 ||
                      (subject.assignmentQuestions?.length ?? 0) > 0 ||
                      pyqsSkipped)
                  const hasProcessedAssignment = (subject.assignmentQuestions?.length ?? 0) > 0
                  const hintsLocked = subject.hintsLocked === true

                  // Check if syllabus is currently processing to lock button
                  const syllabusKey = `${subject.id}-SYLLABUS`
                  const isSyllabusProcessing = activeUploads[syllabusKey]?.status === 'processing' || activeUploads[syllabusKey]?.status === 'uploading'

                  return (
                    <div key={subject.id} className="bg-slate-950 border border-slate-700 rounded-lg p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-sky-400 mb-1">
                            {subject.name}
                          </h3>
                          <p className="text-slate-500 text-xs">
                            Created: {new Date(subject.created_at).toLocaleString()}
                          </p>
                        </div>

                        <button
                          onClick={() => {
                            setDeleteSubjectId(subject.id)
                            setDeleteConfirmOpen(true)
                          }}
                          className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
                        >
                          🗑️ Delete
                        </button>
                      </div>

                      {/* Topics / Exam Syllabus Display */}
                      {allTopics.length > 0 && (
                        <div className={`mb-4 p-3 rounded-lg border ${subject.hasExamScope
                          ? 'bg-purple-900/20 border-purple-700'
                          : 'bg-purple-900/10 border-purple-900/50'
                          }`}>
                          <h4 className={`text-sm font-medium mb-2 ${subject.hasExamScope ? 'text-purple-300' : 'text-slate-300'
                            }`}>
                            {subject.hasExamScope ? `🎯 Your Exam Syllabus (${subject.examScopeType})` : '📚 Topics:'}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {subject.hasExamScope ? (
                              // Show only scope topics with numbers
                              <>
                                {allTopics
                                  .filter(t => subject.examScopeTopicIds?.includes(t.id))
                                  .slice(0, 6)
                                  .map((topic, idx) => (
                                    <span
                                      key={topic.id}
                                      className="px-2 py-1 bg-purple-900/40 text-purple-200 text-xs rounded border border-purple-600 flex items-center gap-1"
                                    >
                                      <span className="text-purple-400 font-medium">{idx + 1}.</span> {topic.name}
                                    </span>
                                  ))}
                                {(subject.examScopeTopicIds?.length || 0) > 6 && (
                                  <span className="px-2 py-1 bg-purple-900/30 text-purple-400 text-xs rounded border border-purple-600">
                                    +{(subject.examScopeTopicIds?.length || 0) - 6} more in scope
                                  </span>
                                )}
                              </>
                            ) : (
                              // Show all topics (preview) with numbers
                              <>
                                {displayTopics.map((topic, idx) => (
                                  <span
                                    key={topic.id}
                                    className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded border border-slate-600 flex items-center gap-1"
                                  >
                                    <span className="text-slate-500 font-medium">{idx + 1}.</span> {topic.name}
                                  </span>
                                ))}
                                {hasMoreTopics && (
                                  <span className="px-2 py-1 bg-slate-800 text-slate-400 text-xs rounded border border-slate-600">
                                    +{allTopics.length - 4} more
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Modules & Teacher Notes Section */}
                      {!subject.hasExamScope && subject.modules && subject.modules.length > 0 && (
                        <div className="mb-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-slate-400">Chapters ({subject.modules.length})</h4>
                            {(() => {
                              const noteKey = `${subject.id}-NOTES`
                              const isNoteUploading = activeUploads[noteKey]?.status === 'processing' || activeUploads[noteKey]?.status === 'uploading'
                              return (
                                <button
                                  onClick={() => openNotesUploadModal(subject.id)}
                                  className="text-xs flex items-center gap-1 bg-emerald-900/30 border border-emerald-700/50 text-emerald-400 px-3 py-1.5 rounded-lg hover:bg-emerald-800/50 hover:border-emerald-500 transition-all font-medium"
                                >
                                  {isNoteUploading ? '⏳ Uploading...' : '📚 Upload Notes'}
                                </button>
                              )
                            })()}
                          </div>

                          {/* Subject-level notes upload progress */}
                          {(() => {
                            const noteKey = `${subject.id}-NOTES`
                            const isNoteUploading = activeUploads[noteKey]?.status === 'processing' || activeUploads[noteKey]?.status === 'uploading'
                            return isNoteUploading ? (
                              <div className="mb-2">
                                {renderUploadStatus(noteKey, `Uploading notes for ${subject.name}`)}
                              </div>
                            ) : null
                          })()}

                          {subject.modules.map(module => (
                            <div key={module.id} className="p-3 rounded-lg border bg-[#0b0c14] border-purple-900/30 hover:border-purple-600 transition-all relative overflow-hidden group">
                              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.5)]"></div>
                              <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-purple-900/40 text-purple-300 text-[10px] font-bold rounded border border-purple-700/50">
                                    Module {module.module_no}
                                  </span>
                                  <h4 className="text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">
                                    {module.title}
                                  </h4>
                                </div>
                                <span className="text-[10px] text-slate-500">{module.topics.length} topics</span>
                              </div>

                              {/* Topics Preview — with optional expandable sub-topics */}
                              <div className="pl-2 space-y-1">
                                {module.topics.slice(0, 5).map(t => {
                                  const subs: string[] = Array.isArray(t.sub_topics) ? t.sub_topics : []
                                  return (
                                    <div key={t.id}>
                                      {/* Topic chip */}
                                      <div className="flex flex-wrap items-center gap-1">
                                        <span className="px-1.5 py-0.5 bg-purple-950/30 text-purple-200 text-[10px] rounded border border-purple-800/50 group-hover:border-purple-600/60 group-hover:text-purple-100 transition-colors font-medium">
                                          {t.name}
                                        </span>
                                        {subs.length > 0 && (
                                          <span className="text-[9px] text-purple-600">{subs.length} subtopics</span>
                                        )}
                                      </div>
                                      {/* Sub-topic chips — always visible when present */}
                                      {subs.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pl-3 pt-0.5">
                                          {subs.slice(0, 4).map((st, si) => (
                                            <span
                                              key={si}
                                              className="px-1.5 py-0.5 bg-slate-800/60 text-slate-400 text-[9px] rounded border border-slate-700/50 group-hover:border-purple-900/40 group-hover:text-slate-300 transition-colors"
                                            >
                                              {st}
                                            </span>
                                          ))}
                                          {subs.length > 4 && (
                                            <span className="text-[9px] text-slate-600 self-center">+{subs.length - 4}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                                {module.topics.length > 5 && (
                                  <span className="text-[10px] text-slate-600 self-center">+{module.topics.length - 5} more topics</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ✅ Uploaded Notes Files */}
                      {uploadedNotes[subject.id]?.length > 0 && (
                        <div className="mb-4 p-3 rounded-lg border bg-emerald-900/10 border-emerald-800/50">
                          <h4 className="text-sm font-medium text-emerald-400 mb-2">📚 Uploaded Notes ({uploadedNotes[subject.id].length})</h4>
                          <div className="space-y-1">
                            {uploadedNotes[subject.id].map(note => (
                              <div key={note.id} className="flex items-center justify-between text-xs bg-slate-800/60 rounded px-2 py-1.5 border border-slate-700">
                                <span className="text-slate-300 truncate">{note.original_filename}</span>
                                <span className="text-emerald-400 shrink-0 ml-2">{note.chunk_count} chunks</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Teacher Hints Preview */}
                      {subject.teacherHints && (
                        <div className="mb-4 p-3 rounded-lg border bg-amber-900/10 border-amber-800/50">
                          <h4 className="text-sm font-medium mb-2 text-amber-500 flex items-center gap-2">
                            <span>📝</span> Teacher's Hints
                          </h4>
                          <div className="text-[11px] text-slate-300 bg-slate-800/50 p-2.5 rounded border border-slate-700 whitespace-pre-wrap leading-relaxed">
                            {subject.teacherHints.length > 300 
                              ? subject.teacherHints.slice(0, 300) + '...' 
                              : subject.teacherHints}
                          </div>
                        </div>
                      )}

                      {subject.paperPattern && (
                        <div className="mb-4 p-3 rounded-lg border bg-cyan-900/10 border-cyan-800/50">
                          <h4 className="text-sm font-medium mb-2 text-cyan-400 flex items-center gap-2">
                            <span>📐</span> Paper Pattern
                          </h4>
                          <div className="text-[11px] text-slate-300 bg-slate-800/50 p-2.5 rounded border border-slate-700 whitespace-pre-wrap leading-relaxed">
                            {subject.paperPattern.length > 300
                              ? subject.paperPattern.slice(0, 300) + '...'
                              : subject.paperPattern}
                          </div>
                        </div>
                      )}

                      {/* Test Papers Preview */}
                      {subject.testPaperQuestions && subject.testPaperQuestions.length > 0 && (
                        <div className="mb-4 p-3 rounded-lg border bg-indigo-900/20 border-indigo-700/50">
                          <h4 className="text-sm font-medium mb-2 text-indigo-300">
                            📝 Test Paper Questions ({subject.testPaperQuestions.length})
                          </h4>
                          <div className="space-y-2">
                            {subject.testPaperQuestions.slice(0, 4).map((q, idx) => (
                              <div
                                key={q.id}
                                className="text-xs text-slate-300 bg-slate-800/50 p-2 rounded border border-slate-700 truncate"
                              >
                                <span className="text-indigo-400 font-medium">Q{q.question_no || idx + 1}.</span>{' '}
                                {q.text.length > 80 ? q.text.slice(0, 80) + '...' : q.text}
                              </div>
                            ))}
                            {subject.testPaperQuestions.length > 4 && (
                              <div className="text-xs text-indigo-400 font-medium pl-2">
                                +{subject.testPaperQuestions.length - 4} more questions
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Assignments Preview */}
                      {subject.assignmentQuestions && subject.assignmentQuestions.length > 0 && (
                        <div className="mb-4 p-3 rounded-lg border bg-teal-900/20 border-teal-700/50">
                          <h4 className="text-sm font-medium mb-2 text-teal-300">
                            📋 Assignment Questions ({subject.assignmentQuestions.length})
                          </h4>
                          <div className="space-y-2">
                            {subject.assignmentQuestions.slice(0, 4).map((q, idx) => (
                              <div
                                key={q.id}
                                className="text-xs text-slate-300 bg-slate-800/50 p-2 rounded border border-slate-700 truncate"
                              >
                                <span className="text-teal-400 font-medium">Q{q.question_no || idx + 1}.</span>{' '}
                                {q.text.length > 80 ? q.text.slice(0, 80) + '...' : q.text}
                              </div>
                            ))}
                            {subject.assignmentQuestions.length > 4 && (
                              <div className="text-xs text-teal-400 font-medium pl-2">
                                +{subject.assignmentQuestions.length - 4} more questions
                              </div>
                            )}
                          </div>
                        </div>
                      )}


                      <div className="hidden">
                        <h4 className="text-sm font-semibold text-slate-100 mb-2">
                          Do assignments appear in your exam?
                        </h4>
                        <p className="text-xs text-slate-400 mb-4">
                          This controls how much assignment-based signal should influence predictions.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            {
                              value: 1.0 as 1.0,
                              label: 'Yes, heavily tested',
                              subtitle: 'Assignments closely mirror exam questions'
                            },
                            {
                              value: 0.6 as 0.6,
                              label: 'Sometimes overlap',
                              subtitle: 'Partial overlap — some topics appear'
                            },
                            {
                              value: 0.3 as 0.3,
                              label: 'Rarely on exams',
                              subtitle: 'Assignments are mostly for practice'
                            },
                            {
                              value: 0.0 as 0.0,
                              label: 'Never / Just for marks',
                              subtitle: 'Exams are completely independent'
                            }
                          ].map(option => {
                            const selectedFactor = subject.college_assignment_factor ?? 0.0
                            const isSelected = selectedFactor === option.value

                            return (
                              <button
                                key={option.label}
                                onClick={() => updateAssignmentFactor(subject.id, option.value)}
                                disabled={assignmentFactorSaving[subject.id]}
                                className={`text-left rounded-xl border p-4 transition ${
                                  isSelected
                                    ? 'border-sky-400 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.4)]'
                                    : 'border-slate-700 bg-slate-800/70 hover:border-slate-500'
                                } ${
                                  assignmentFactorSaving[subject.id] ? 'opacity-70 cursor-wait' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3 mb-1">
                                  <span className={`text-sm font-semibold ${isSelected ? 'text-sky-300' : 'text-slate-200'}`}>
                                    {option.label}
                                  </span>
                                  <span className={`text-xs font-mono px-2 py-1 rounded ${
                                    isSelected ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-700 text-slate-400'
                                  }`}>
                                    {option.value.toFixed(1)}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  {option.subtitle}
                                </p>
                              </button>
                            )
                          })}
                        </div>

                        {assignmentFactorStatus[subject.id] && (
                          <p
                            className={`mt-3 text-xs font-medium ${
                              assignmentFactorStatus[subject.id]?.type === 'success'
                                ? 'text-emerald-400'
                                : 'text-red-400'
                            }`}
                          >
                            {assignmentFactorStatus[subject.id]?.message}
                          </p>
                        )}
                      </div>

                      <div className="hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                          <div>
                            <h4 className="text-base font-semibold text-emerald-300">Generate Predictions</h4>
                            <p className="text-xs text-slate-400 mt-1">
                              Run the scoring engine and view ranked topics by module.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => fetchPredictions(subject.id)}
                              disabled={predictionLoading[subject.id]}
                              className="px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition text-sm disabled:opacity-60"
                            >
                              {predictionLoading[subject.id] ? 'Refreshing...' : 'Refresh'}
                            </button>
                            <button
                              onClick={() => generatePredictions(subject.id)}
                              disabled={predictionGenerating[subject.id]}
                              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition disabled:opacity-60"
                            >
                              {predictionGenerating[subject.id]
                                ? 'Starting...'
                                : predictionRuns[subject.id]
                                  ? 'Re-run'
                                  : 'Generate Predictions'}
                            </button>
                          </div>
                        </div>

                        {predictionLoading[subject.id] ? (
                          <div className="text-sm text-slate-400 py-6 flex items-center gap-3">
                            <div className="w-4 h-4 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
                            Loading latest predictions...
                          </div>
                        ) : !predictionRuns[subject.id] ? (
                          <div className="text-sm text-slate-400 bg-slate-900/70 border border-slate-800 rounded-lg px-4 py-5">
                            No predictions yet — click Generate to start
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="text-xs text-slate-400 bg-slate-900/70 border border-slate-800 rounded-lg px-4 py-3">
                              Latest run: {new Date(predictionRuns[subject.id]!.created_at).toLocaleString()}
                            </div>

                            {spTruncated[subject.id] && (
                              <div className="flex items-start gap-3 px-4 py-3 bg-amber-900/20 border border-amber-600/40 rounded-lg text-xs text-amber-300">
                                <span className="text-base shrink-0">⚠️</span>
                                <p><span className="font-semibold">Partial SP signal:</span> The AI response was cut short during scoring — some topic centrality scores may be missing. Predictions are still valid but may be less accurate. Re-run to attempt a full score.</p>
                              </div>
                            )}

                            {pyqsSkipped && (
                              <div className="flex items-start gap-3 px-4 py-3 bg-sky-900/20 border border-sky-700/40 rounded-lg text-xs text-sky-300">
                                <span className="text-base shrink-0">ℹ️</span>
                                <p><span className="font-semibold">No PYQs:</span> Predictions are based on syllabus centrality, notes coverage, and teacher hints only. Upload past papers anytime to improve accuracy.</p>
                              </div>
                            )}

                            {Object.entries(
                              (predictionScores[subject.id] || []).reduce((acc, score) => {
                                const moduleId = score.topics?.module_id || 'unknown'
                                if (!acc[moduleId]) acc[moduleId] = []
                                acc[moduleId].push(score)
                                return acc
                              }, {} as Record<string, PredictionScore[]>)
                            )
                              .sort(([moduleA], [moduleB]) => {
                                const moduleNoA = subject.modules?.find(module => module.id === moduleA)?.module_no ?? Number.MAX_SAFE_INTEGER
                                const moduleNoB = subject.modules?.find(module => module.id === moduleB)?.module_no ?? Number.MAX_SAFE_INTEGER
                                return moduleNoA - moduleNoB
                              })
                              .map(([moduleId, scores]) => {
                                const moduleInfo = subject.modules?.find(module => module.id === moduleId)

                                return (
                                  <div key={moduleId} className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/90">
                                      <h5 className="text-sm font-semibold text-slate-100">
                                        {moduleInfo
                                          ? `Module ${moduleInfo.module_no}: ${moduleInfo.title}`
                                          : 'Module'}
                                      </h5>
                                    </div>

                                    <div className="divide-y divide-slate-800">
                                      {scores
                                        .slice()
                                        .sort((a, b) => b.final_score - a.final_score)
                                        .map(score => (
                                          <div key={score.topic_id} className="px-4 py-3 flex items-center justify-between gap-4">
                                            <div className="min-w-0">
                                              <p className="text-sm text-slate-200 truncate">
                                                {score.topics?.parent?.name 
                                                  ? `${score.topics.parent.name} › ${score.topics.name}` 
                                                  : score.topics?.name || 'Unnamed topic'}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                              <span
                                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                                                  score.band === 'HIGH'
                                                    ? 'bg-emerald-500/20 text-emerald-300'
                                                    : score.band === 'MEDIUM'
                                                      ? 'bg-amber-500/20 text-amber-300'
                                                      : 'bg-slate-700 text-slate-300'
                                                }`}
                                              >
                                                {score.band}
                                              </span>
                                              <span className="text-sm font-mono text-slate-300">
                                                {Math.round(score.final_score * 100)}%
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        )}
                      </div>



                      {/* NOTES UPLOAD MODAL */}
                      {notesUploadModalOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative overflow-hidden flex flex-col max-h-[90vh]">
                            {/* Glossy background effect */}
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                            <button
                              onClick={() => setNotesUploadModalOpen(false)}
                              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-20"
                            >
                              ✕
                            </button>

                            <div className="relative z-10 flex flex-col h-full min-h-0">
                              <div className="shrink-0 mb-4">
                                <h3 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-1">
                                  Upload Teacher Notes
                                </h3>
                                <p className="text-sm text-slate-400">
                                  Fast processing with auto-deduplication.
                                </p>
                              </div>

                              <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar pb-4 space-y-6">

                              {/* File Drop Area */}
                              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-8 transition-all bg-slate-800/30 group text-center cursor-pointer relative hover:bg-slate-800/50 flex items-center justify-center">
                                <input
                                  type="file"
                                  multiple
                                  accept=".pdf,application/pdf"
                                  onChange={handleNoteFileSelect}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  disabled={isUploading}
                                />
                                <div className="flex flex-col items-center gap-3 pointer-events-none transition-transform group-hover:scale-105">
                                  <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-slate-700 transition-colors shadow-lg border border-slate-700">
                                    <span className="text-2xl">📚</span>
                                  </div>
                                  <div>
                                    <p className="text-slate-200 font-medium">Click to select files</p>
                                    <p className="text-xs text-slate-500 mt-1">PDF ONLY (Max 50MB)</p>
                                  </div>
                                </div>
                              </div>

                              {/* ✅ PPTX Warning Banner */}
                              <div className="mb-6 p-4 bg-orange-950/30 border border-orange-500/30 rounded-xl flex items-start gap-3">
                                <div className="text-xl shrink-0 mt-0.5">⚠️</div>
                                <div>
                                  <h4 className="text-sm font-semibold text-orange-400 mb-1">Uploads are PDF-Only</h4>
                                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                                    PowerPoint files (.ppt, .pptx) are no longer supported directly. Please convert your presentations to PDF before uploading.
                                  </p>
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Free Bulk Converters:</p>
                                    <div className="flex flex-wrap gap-2">
                                      <a href="https://tools.pdf24.org/en/ppt-to-pdf" target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-sky-400 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5">
                                        🔗 PDF24 <span className="text-slate-500 text-[10px]">(Recommended)</span>
                                      </a>
                                      <a href="https://online2pdf.com/convert-ppt-to-pdf" target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-sky-400 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5">
                                        🔗 Online2PDF
                                      </a>
                                      <a href="https://www.ilovepdf.com/powerpoint_to_pdf" target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-sky-400 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5">
                                        🔗 iLovePDF
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* File List */}
                              {selectedNoteFiles.length > 0 && (
                                <div className="space-y-2 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                                  {selectedNoteFiles.map((file, i) => {
                                    const dupState = noteFileDuplicates[file.name];
                                    const isDup = dupState?.isDuplicate;
                                    const isChecking = dupState?.isChecking;

                                    return (
                                      <div key={i} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isDup ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-800/80 border-slate-700'
                                        }`}>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                          <span className="text-xl shrink-0">
                                            {file.name.endsWith('.pdf') ? '📕' : file.name.endsWith('.ppt') || file.name.endsWith('.pptx') ? '📙' : '📘'}
                                          </span>
                                          <div className="min-w-0">
                                            <p className={`text-sm truncate font-medium ${isDup ? 'text-red-200' : 'text-slate-200'}`}>{file.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                              <span className="text-[10px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                              {isDup && (
                                                <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 rounded border border-red-500/20">
                                                  Duplicate
                                                </span>
                                              )}
                                              {isChecking && (
                                                <span className="text-[10px] text-blue-400 animate-pulse flex items-center gap-1">
                                                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" /> Checking...
                                                </span>
                                              )}
                                            </div>
                                            {isDup && dupState?.existingAs && (
                                              <p className="text-[10px] text-red-400/80 italic truncate mt-0.5">
                                                Matches "{dupState.existingAs}"
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => removeNoteFile(i)}
                                          className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400 hover:text-red-400 transition-colors"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              </div>

                              <div className="shrink-0 flex justify-end gap-3 pt-4 border-t border-slate-800 mt-2">
                                <button
                                  onClick={() => setNotesUploadModalOpen(false)}
                                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleNotesUpload}
                                  disabled={isUploading || selectedNoteFiles.length === 0 || selectedNoteFiles.every(f => noteFileDuplicates[f.name]?.isDuplicate)}
                                  className="px-6 py-2 text-sm font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-lg hover:shadow-emerald-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                >
                                  {isUploading ? (
                                    <span className="flex items-center gap-2">
                                      <div className="w-3 h-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                      Uploading...
                                    </span>
                                  ) : (
                                    `Upload ${selectedNoteFiles.filter(f => !noteFileDuplicates[f.name]?.isDuplicate).length} unique files`
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Active Uploads Display */}
                      {['SYLLABUS', 'TEST_PAPER', 'ASSIGNMENT'].map(type => {
                        const key = `${subject.id}-${type}`
                        return renderUploadStatus(key, type === 'SYLLABUS' ? '📄 Syllabus' : type === 'TEST_PAPER' ? '📊 Test Paper' : '📋 Assignment')
                      })}

                      {/* ✅ Active Note Uploads (Dynamic Keys) */}
                      {Object.keys(activeUploads)
                        .filter(key =>
                          (key.endsWith('-NOTES') || key.startsWith('NOTES-')) &&
                          activeUploads[key].status !== 'completed'
                        )
                        .map(key => {
                          const upload = activeUploads[key]
                          const label = `📚 Notes — ${upload.fileName || 'Processing...'}`
                          return renderUploadStatus(key, label)
                        })
                      }

                      {/* ✅ Upload Buttons */}
                      <div className="pt-4 border-t border-slate-700">
                        <h4 className="text-sm font-medium text-slate-400 mb-3">Upload Documents:</h4>
                        <div className="flex flex-wrap gap-2">
                          {/* ✅ SYLLABUS */}
                          <button
                            onClick={() => openUploadModal(subject.id, 'SYLLABUS')}
                            disabled={allTopics.length > 0 || subject.hasSyllabus || isSyllabusProcessing}
                            title={allTopics.length > 0
                              ? "Syllabus already exists."
                              : isSyllabusProcessing
                                ? "Processing in background..."
                                : undefined
                            }
                            className={`px-4 py-2 border rounded-lg transition text-sm ${allTopics.length > 0 || subject.hasSyllabus || isSyllabusProcessing
                              ? 'bg-green-900/30 border-green-700 text-green-400 cursor-not-allowed'
                              : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                              }`}
                          >
                            {allTopics.length > 0 ? '🔒 Syllabus Locked' : subject.hasSyllabus ? '✅ Syllabus Uploaded' : isSyllabusProcessing ? '⏳ Processing...' : '📄 Syllabus'}
                          </button>

                          {/* ✅ EXAM SCOPE */}
                          <button
                            onClick={() => startScopeEdit(subject)}
                            disabled={allTopics.length === 0 || subject.hasExamScope}
                            className={`px-4 py-2 border rounded-lg transition text-sm ${subject.hasExamScope
                              ? 'bg-purple-900/30 border-purple-700 text-purple-400 cursor-not-allowed'
                              : allTopics.length === 0
                                ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
                                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-purple-900/30 hover:border-purple-600'
                              }`}
                          >
                            {subject.hasExamScope ? `🔒 ${subject.examScopeType}` : '🎯 Add Exam Scope'}
                          </button>

                          {/* ✅ TEST PAPERS */}
                          <button
                            onClick={() => openUploadModal(subject.id, 'TEST_PAPER')}
                            disabled={!subject.hasExamScope || pyqsSkipped}
                            title={!subject.hasExamScope ? "Configure exam scope first" : pyqsSkipped ? "PYQs skipped — unlock by uploading test papers" : undefined}
                            className={`px-4 py-2 border rounded-lg transition text-sm ${pyqsSkipped
                              ? 'bg-slate-700/30 border-slate-600 text-slate-500 cursor-not-allowed'
                              : !subject.hasExamScope
                                ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
                                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                              }`}
                          >
                            {pyqsSkipped ? '🔒 PYQs Skipped' : '📊 Test Papers'}
                          </button>

                          {/* ✅ ASSIGNMENTS */}
                          <button
                            onClick={() => !hasProcessedAssignment && openUploadModal(subject.id, 'ASSIGNMENT')}
                            disabled={!subject.hasExamScope || hasProcessedAssignment}
                            title={
                              hasProcessedAssignment
                                ? "Assignment already processed — cannot be changed"
                                : !subject.hasExamScope
                                  ? "Configure exam scope first"
                                  : undefined
                            }
                            className={`px-4 py-2 border rounded-lg transition text-sm ${hasProcessedAssignment
                              ? 'bg-teal-900/30 border-teal-700 text-teal-400 cursor-not-allowed'
                              : !subject.hasExamScope
                                ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
                                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                              }`}
                          >
                            {hasProcessedAssignment ? '🔒 Assignment Locked' : '📋 Assignments'}
                          </button>

                          {/* ✅ SKIP PYQs CARD */}
                          {subject.hasExamScope && !pyqsSkipped && (subject.testPaperQuestions?.length ?? 0) === 0 && (
                            <div className="w-full mt-3 p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
                              <div className="flex items-start gap-3">
                                <span className="text-2xl shrink-0">📭</span>
                                <div className="flex-1">
                                  <h4 className="text-sm font-semibold text-slate-200 mb-1">
                                    Don't have past papers?
                                  </h4>
                                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                                    No worries! Predictions still work using syllabus analysis, notes, and teacher hints.
                                    Accuracy improves with PYQs, but they're not required.
                                  </p>
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                                      <input
                                        type="checkbox"
                                        checked={skipPyqConfirm[subject.id] || false}
                                        onChange={(e) => setSkipPyqConfirm(prev => ({ ...prev, [subject.id]: e.target.checked }))}
                                        className="w-4 h-4 rounded border-slate-600 text-sky-500 focus:ring-sky-500/30 bg-slate-900/50 cursor-pointer"
                                      />
                                      <span>Yes, I don't have past papers and want to skip this step</span>
                                    </label>
                                    <button
                                      onClick={async () => {
                                        if (skipPyqConfirm[subject.id]) {
                                          await saveSubjectConfig(subject.id, { pyqs_skipped: true })
                                        }
                                      }}
                                      disabled={!skipPyqConfirm[subject.id]}
                                      className="px-4 py-2 bg-sky-500/20 border border-sky-500/40 text-sky-300 hover:bg-sky-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Skip — Predict Without PYQs
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* ✅ TEACHER HINTS */}
                          <button
                            onClick={() => toggleHintsInline(subject.id)}
                            className={`px-4 py-2 border rounded-lg transition text-sm ${
                              hintsLocked
                                ? 'bg-green-900/30 border-green-700 text-green-400 cursor-pointer'
                                : expandedHintSubjectId === subject.id
                                ? 'bg-amber-900 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                                : 'bg-amber-900/10 border-amber-700/50 text-amber-500 hover:bg-amber-900/30 hover:border-amber-500'
                            }`}
                          >
                            {hintsLocked ? '🔒 Hints Locked' : '📝 Add Hints + Pattern'}
                          </button>

                          {/* ✅ TEACHER NOTES */}
                          <button
                            onClick={() => openNotesUploadModal(subject.id)}
                            disabled={!subject.modules || subject.modules.length === 0}
                            title={!subject.modules || subject.modules.length === 0
                              ? "Upload syllabus first to add notes"
                              : "Upload notes for all modules at once"
                            }
                            className={`px-4 py-2 border rounded-lg transition text-sm ${!subject.modules || subject.modules.length === 0
                              ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
                              : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-emerald-900/30 hover:border-emerald-600'
                              }`}
                          >
                            📚 Upload Notes (All Modules)
                          </button>

                          <button
                            onClick={() => alert('⚡ Process Subject - Coming soon!\n\nThis will generate exam predictions.')}
                            disabled={predictionGenerating[subject.id]}
                            className="hidden"
                          >
                            ⚡ Process <span className="text-xs">(Soon)</span>
                          </button>

                          {/* 🤖 ASK AI */}
                          <button
                            onClick={() => setAskAiSubjectId(askAiSubjectId === subject.id ? null : subject.id)}
                            disabled={!uploadedNotes[subject.id]?.length}
                            title={!uploadedNotes[subject.id]?.length ? "Upload notes first to ask AI" : "Ask AI about your notes"}
                            className={`px-4 py-2 border rounded-lg transition text-sm font-medium
                              ${askAiSubjectId === subject.id
                                ? 'bg-violet-700 border-violet-500 text-white'
                                : !uploadedNotes[subject.id]?.length
                                  ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
                                  : 'bg-slate-800 border-violet-700/50 text-violet-300 hover:bg-violet-900/30 hover:border-violet-500'
                              }`}
                          >
                            🤖 Ask AI
                          </button>

                          <button
                            onClick={() => generatePredictions(subject.id)}
                            disabled={!canGeneratePredictions || predictionGenerating[subject.id]}
                            title={!canGeneratePredictions ? 'Upload syllabus, exam scope, and at least one test paper or assignment first' : undefined}
                            className={`px-4 py-2 border rounded-lg transition text-sm font-medium ${
                              !canGeneratePredictions || predictionGenerating[subject.id]
                                ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
                                : 'bg-emerald-900/20 border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/40 hover:border-emerald-500'
                            }`}
                          >
                            {predictionGenerating[subject.id] ? 'Starting...' : '🔮 Predict'}
                          </button>

                          <button
                            onClick={() => fetchPredictions(subject.id)}
                            disabled={!canGeneratePredictions || predictionLoading[subject.id]}
                            title={!canGeneratePredictions ? 'Upload syllabus, exam scope, and at least one test paper or assignment first' : undefined}
                            className={`px-3 py-2 border rounded-lg transition text-sm font-medium ${
                              !canGeneratePredictions || predictionLoading[subject.id]
                                ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed opacity-60'
                                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {predictionLoading[subject.id]
                              ? <span className="inline-block w-4 h-4 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin align-middle" />
                              : '🔄'}
                          </button>
                        </div>
                      </div>

                      {predictionRuns[subject.id] && (
                        <div className="mt-4 space-y-4">
                          <div className="text-xs text-slate-400 bg-slate-900/70 border border-slate-800 rounded-lg px-4 py-3">
                            Latest run: {new Date(predictionRuns[subject.id]!.created_at).toLocaleString()}
                          </div>

                          {pyqsSkipped && (
                            <div className="flex items-start gap-3 px-4 py-3 bg-sky-900/20 border border-sky-700/40 rounded-lg text-xs text-sky-300">
                              <span className="text-base shrink-0">ℹ️</span>
                              <p><span className="font-semibold">No PYQs:</span> Predictions are based on syllabus centrality, notes coverage, and teacher hints only. Upload past papers anytime to improve accuracy.</p>
                            </div>
                          )}

                          {Object.entries(
                            (predictionScores[subject.id] || []).reduce((acc, score) => {
                              const moduleId = score.topics?.module_id || 'unknown'
                              if (!acc[moduleId]) acc[moduleId] = []
                              acc[moduleId].push(score)
                              return acc
                            }, {} as Record<string, PredictionScore[]>)
                          )
                            .sort(([moduleA], [moduleB]) => {
                              const moduleNoA = subject.modules?.find(module => module.id === moduleA)?.module_no ?? Number.MAX_SAFE_INTEGER
                              const moduleNoB = subject.modules?.find(module => module.id === moduleB)?.module_no ?? Number.MAX_SAFE_INTEGER
                              return moduleNoA - moduleNoB
                            })
                            .map(([moduleId, scores]) => {
                              const moduleInfo = subject.modules?.find(module => module.id === moduleId)

                              return (
                                <div key={moduleId} className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/90">
                                    <h5 className="text-sm font-semibold text-slate-100">
                                      {moduleInfo
                                        ? `Module ${moduleInfo.module_no}: ${moduleInfo.title}`
                                        : 'Module'}
                                    </h5>
                                  </div>

                                  <div className="divide-y divide-slate-800">
                                    {scores
                                      .slice()
                                      .sort((a, b) => b.final_score - a.final_score)
                                      .map(score => (
                                        <div key={score.topic_id} className="px-4 py-3 flex items-center justify-between gap-4">
                                          <div className="min-w-0">
                                            <p className="text-sm text-slate-200 truncate">
                                              {score.topics?.name || 'Unnamed topic'}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                            <span
                                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                                                score.band === 'HIGH'
                                                  ? 'bg-emerald-500/20 text-emerald-300'
                                                  : score.band === 'MEDIUM'
                                                    ? 'bg-amber-500/20 text-amber-300'
                                                    : 'bg-slate-700 text-slate-300'
                                              }`}
                                            >
                                              {score.band}
                                            </span>
                                            <span className="text-sm font-mono text-slate-300">
                                              {Math.round(score.final_score * 100)}%
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      )}

                      {/* ✅ INLINE TEACHER HINTS PANEL */}
                      {expandedHintSubjectId === subject.id && (
                        <div className="mt-4 p-5 bg-slate-900 border border-amber-700/50 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in slide-in-from-top-2">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                          
                          <div className="relative z-10">
                            <h4 className="text-sm font-semibold text-amber-400 mb-3 flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <span>📝</span> {hintsLocked ? 'Edit Teacher Hints + Paper Pattern' : "Teacher's Hints + Paper Pattern"}
                              </span>
                              <button onClick={() => setExpandedHintSubjectId(null)} className="text-slate-500 hover:text-white transition-colors">✕</button>
                            </h4>
                            
                            <div className="text-xs text-slate-300 mb-4 p-4 bg-slate-800/80 rounded-lg border border-slate-700 leading-relaxed shadow-inner">
                              <p className="font-semibold text-amber-400 mb-2">💡 To get the best AI predictions, provide specific details like:</p>
                              <ul className="list-disc pl-5 space-y-1.5 text-[11px] text-slate-300">
                                <li><strong className="text-slate-200">Teacher's Warning:</strong> "Professor strongly emphasized derivations for Transformer architecture."</li>
                                <li><strong className="text-slate-200">Expected Numericals:</strong> "Guaranteed 10-mark numerical on DC motor speed control."</li>
                                <li><strong className="text-slate-200">Must-Ask Topics:</strong> "Topic 3 always has an 'either/or' 15-mark question."</li>
                                <li><strong className="text-slate-200">Paper Pattern & Structure:</strong> "Q1 is compulsory for 20 marks, attempt 3 out of 5 for the rest."</li>
                              </ul>
                              <p className="text-amber-500/80 italic mt-3 border-t border-slate-700 pt-2">The AI Notes Assistant reads this when generating predictions to perfectly mimic your professor!</p>
                            </div>
                            
                            {isLoadingHints ? (
                              <div className="flex justify-center p-6"><span className="animate-spin text-amber-500 text-xl">⏳</span></div>
                            ) : (
                              <div className="space-y-3 mb-3">
                                <div>
                                  <label className="block text-xs font-semibold uppercase tracking-wide text-amber-400 mb-2">
                                    Teacher Hints
                                  </label>
                                  <textarea
                                    value={hintsText}
                                    onChange={(e) => setHintsText(e.target.value)}
                                    placeholder="Write teacher-specific hints here..."
                                    className="w-full h-28 bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 text-sm focus:outline-none focus:border-amber-500 resize-none custom-scrollbar"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold uppercase tracking-wide text-cyan-400 mb-2">
                                    Paper Pattern
                                  </label>
                                  <textarea
                                    value={paperPatternText}
                                    onChange={(e) => setPaperPatternText(e.target.value)}
                                    placeholder="Write paper format, compulsory questions, choice pattern, marks split, and section rules..."
                                    className="w-full h-28 bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 text-sm focus:outline-none focus:border-cyan-500 resize-none custom-scrollbar"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-2">
                                    How confident is this hint?
                                  </label>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {[
                                      {
                                        value: 'EXACT' as HintConfidence,
                                        label: 'Teacher said it directly',
                                        subtitle: 'High confidence — direct quote'
                                      },
                                      {
                                        value: 'VAGUE' as HintConfidence,
                                        label: 'Think I heard it / Vague',
                                        subtitle: 'Medium — mentioned but uncertain'
                                      },
                                      {
                                        value: 'GUESS' as HintConfidence,
                                        label: 'My own guess / reading',
                                        subtitle: 'Low — personal inference'
                                      }
                                    ].map(option => {
                                      const isSelected = confidenceLevel === option.value

                                      return (
                                        <button
                                          key={option.value}
                                          onClick={() => setConfidenceLevel(option.value)}
                                          type="button"
                                          className={`text-left rounded-xl border p-3 transition ${
                                            isSelected
                                              ? 'border-amber-400 bg-amber-500/10'
                                              : 'border-slate-700 bg-slate-800/70 hover:border-slate-500'
                                          }`}
                                        >
                                          <div className={`text-sm font-semibold mb-1 ${isSelected ? 'text-amber-300' : 'text-slate-200'}`}>
                                            {option.label}
                                          </div>
                                          <p className="text-xs text-slate-400 leading-relaxed">
                                            {option.subtitle}
                                          </p>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={() => skipHintsInline(subject.id)}
                                className="mr-auto text-xs text-slate-500 hover:text-slate-300 underline transition-colors disabled:opacity-50"
                                disabled={isSavingHints}
                              >
                                Skip — No Hints
                              </button>
                              <button
                                onClick={() => setExpandedHintSubjectId(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                                disabled={isSavingHints}
                              >Cancel</button>
                              <button
                                onClick={() => saveHintsInline(subject.id)}
                                disabled={isSavingHints || isLoadingHints}
                                className="px-5 py-2 bg-amber-500 text-slate-950 text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
                              >
                                {isSavingHints ? 'Saving...' : 'Save Both'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ✅ INLINE CHAT PANEL */}
                      {askAiSubjectId === subject.id && (
                        <div className="mt-4 flex gap-4 h-[500px]">
                          {/* Chat Section */}
                          <div className="flex-1 flex flex-col bg-slate-900 border-2 border-violet-600/50 rounded-lg overflow-hidden">
                            <div className="p-3 bg-violet-900/20 border-b border-violet-600/30">
                              <h4 className="text-sm font-semibold text-violet-300 flex items-center gap-2">
                                🤖 AI Notes Assistant
                                <span className="text-[10px] bg-violet-600/30 text-violet-400 px-2 py-0.5 rounded-full border border-violet-500/50">
                                  RAG Enabled
                                </span>
                              </h4>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar flex flex-col">
                              {(!chatMessages[subject.id] || chatMessages[subject.id].length === 0) ? (
                                <div className="text-slate-500 text-sm text-center my-auto">
                                  Ask a question about {subject.name} and the AI will answer using your uploaded notes.
                                </div>
                              ) : (
                                chatMessages[subject.id].map((msg, i) => (
                                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'self-end max-w-[85%]' : 'self-start w-full'}`}>
                                    <div className={`p-3 rounded-2xl text-sm ${msg.role === 'user'
                                      ? 'bg-sky-600 text-white rounded-tr-sm'
                                      : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'
                                      }`}>
                                      <div className="whitespace-pre-wrap">{msg.content}</div>
                                    </div>

                                    {/* Full Citations */}
                                    {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider pl-1 mb-1">
                                          📎 Sources ({msg.chunks_used} chunks searched)
                                        </p>
                                        {msg.sources.slice(0, 5).map((src, si) => (
                                          <div key={si} className="flex items-start gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[10px]">
                                            <span className="text-violet-400 font-bold shrink-0">[{src.index}]</span>
                                            <div className="flex-1 min-w-0">
                                              <span className="text-slate-300 font-medium truncate block">{src.filename}</span>
                                              <div className="flex flex-wrap gap-1 mt-0.5">
                                                {src.source_page_range && (
                                                  <span className="bg-slate-800 text-slate-400 border border-slate-700 px-1 rounded">p.{src.source_page_range}</span>
                                                )}
                                                <span className={`px-1 rounded border ${src.chunk_tier === 'verbatim' ? 'bg-amber-900/30 text-amber-300 border-amber-700/50' : 'bg-blue-900/30 text-blue-300 border-blue-700/50'}`}>
                                                  {src.chunk_tier}
                                                </span>
                                                <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-700/50 px-1 rounded">
                                                  {(src.score * 100).toFixed(0)}% match
                                                </span>
                                                {src.section_context && (
                                                  <span className="text-slate-500 italic truncate max-w-[140px]" title={src.section_context}>{src.section_context}</span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Detected topic pills */}
                                    {msg.role === 'ai' && msg.detected_topics && msg.detected_topics.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1 pl-1">
                                        <span className="text-[9px] text-slate-600 mr-1">Detected topics:</span>
                                        {msg.detected_topics.map((t, idx) => (
                                          <span key={idx} className="text-[9px] bg-violet-900/40 text-violet-300 px-1.5 py-0.5 rounded border border-violet-700/50">
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))

                              )}
                              {isChatLoading && (
                                <div className="self-start p-3 rounded-2xl bg-slate-800 border border-slate-700 rounded-tl-sm">
                                  <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                              )}
                            </div>

                            <div className="p-3 bg-slate-950 border-t border-slate-800">
                              <form onSubmit={async (e) => {
                                e.preventDefault()
                                if (!chatInput.trim() || isChatLoading) return

                                const question = chatInput.trim()
                                setChatInput('')

                                // Add user msg
                                setChatMessages(prev => ({
                                  ...prev,
                                  [subject.id]: [...(prev[subject.id] || []), { role: 'user', content: question }]
                                }))

                                setIsChatLoading(true)

                                try {
                                  const res = await fetch('/api/notes-v2/ask', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      subject_id: subject.id,
                                      // Use college_id UUID from the note record — userProfile.college is the name, not the UUID
                                      college_id: uploadedNotes[subject.id]?.[0]?.college_id || '',
                                      question
                                    })
                                  })

                                  const data = await res.json()

                                  if (data.success) {
                                    setChatMessages(prev => ({
                                      ...prev,
                                      [subject.id]: [...(prev[subject.id] || []), {
                                        role: 'ai',
                                        content: data.answer,
                                        detected_topics: data.detected_topics,
                                        sources: data.sources || [],
                                        chunks_used: data.chunks_used || 0
                                      }]
                                    }))
                                  } else {
                                    throw new Error(data.error || 'Failed to get answer')
                                  }
                                } catch (error: any) {
                                  setChatMessages(prev => ({
                                    ...prev,
                                    [subject.id]: [...(prev[subject.id] || []), {
                                      role: 'ai',
                                      content: '❌ Error: ' + error.message
                                    }]
                                  }))
                                } finally {
                                  setIsChatLoading(false)
                                }
                              }} className="flex gap-2">
                                <input
                                  type="text"
                                  value={chatInput}
                                  onChange={(e) => setChatInput(e.target.value)}
                                  placeholder="Ask about your notes..."
                                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
                                  disabled={isChatLoading}
                                />
                                <button
                                  type="submit"
                                  disabled={isChatLoading || !chatInput.trim()}
                                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                                >
                                  Send
                                </button>
                              </form>
                            </div>
                          </div>

                          {/* Context Sidebar */}
                          <div className="w-64 bg-slate-900 border border-slate-700 rounded-lg p-3 overflow-y-auto custom-scrollbar">
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sources</h4>
                            <p className="text-xs text-slate-500 mb-3">AI is searching through:</p>
                            <div className="space-y-1.5">
                              {uploadedNotes[subject.id]?.map(note => (
                                <div key={note.id} className="text-xs bg-slate-800 text-slate-300 p-2 rounded border border-slate-700 truncate" title={note.original_filename}>
                                  📄 {note.original_filename}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ✅ INLINE EXAM SCOPE EDITOR */}
                      {scopeEditingSubjectId === subject.id && (
                        <div className="mt-4 p-4 bg-slate-900 border-2 border-purple-600 rounded-lg">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-lg font-semibold text-purple-400">🎯 Define Exam Scope</h4>
                            <button onClick={cancelScopeEdit} className="text-slate-400 hover:text-white text-xl">✕</button>
                          </div>

                          {/* Exam Type Selector */}
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Exam Type:</label>
                            <div className="flex flex-wrap gap-2">
                              {EXAM_TYPES.map(type => (
                                <button
                                  key={type}
                                  onClick={() => setScopeExamType(type)}
                                  className={`px-3 py-1.5 rounded-lg text-sm transition ${scopeExamType === type
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                  {type}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Topics Selection */}
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-sm font-medium text-slate-300">Select Topics:</label>
                              <span className="text-xs text-slate-500">{Object.keys(scopeSelectedTopics).length} selected</span>
                            </div>
                            <div className="max-h-96 overflow-y-auto border border-slate-700 rounded-lg">
                              {subject.modules?.map(module => {
                                const moduleTopicIds = module.topics.map(t => t.id)
                                const allModuleSelected = moduleTopicIds.every(id => id in scopeSelectedTopics)
                                const someModuleSelected = moduleTopicIds.some(id => id in scopeSelectedTopics)

                                return (
                                  <div key={module.id} className="border-b border-slate-800 last:border-0">
                                    {/* Module Header */}
                                    <div
                                      onClick={() => toggleScopeModule(module.topics.filter(t => t.parent_topic_id == null))}
                                      className="p-3 bg-slate-800/70 flex items-center gap-3 cursor-pointer hover:bg-slate-800 border-l-4 border-purple-600"
                                    >
                                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold ${allModuleSelected ? 'bg-purple-600 border-purple-600 text-white' :
                                        someModuleSelected ? 'bg-purple-900/50 border-purple-500 text-purple-400' : 'border-slate-500'
                                        }`}>
                                        {allModuleSelected && '✓'}
                                        {!allModuleSelected && someModuleSelected && '−'}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 text-xs font-semibold rounded">
                                          Module {module.module_no}
                                        </span>
                                        <span className="text-sm font-medium text-slate-200">{module.title}</span>
                                      </div>
                                      <span className="text-xs text-slate-500 ml-auto">{module.topics.filter(t => t.parent_topic_id == null).length} topics</span>
                                    </div>

                                    {/* Topics + Sub-topics */}
                                    <div className="pl-6 bg-slate-900/50">
                                      {module.topics.filter(t => t.parent_topic_id == null).map(topic => {
                                        const isTopicSelected = topic.id in scopeSelectedTopics
                                        const selectedSubs = scopeSelectedTopics[topic.id] // null | string[]
                                        const hasSubTopics = (topic.sub_topics ?? []).length > 0
                                        const isAllSubsSelected = selectedSubs === null
                                        const isPartialSubs = !isAllSubsSelected && Array.isArray(selectedSubs) && selectedSubs.length > 0

                                        return (
                                          <div key={topic.id} className="border-l border-slate-700">
                                            {/* Topic Row */}
                                            <div
                                              onClick={() => toggleScopeTopic(topic.id)}
                                              className={`p-2 flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-800/50 ${isTopicSelected ? 'text-purple-300 bg-purple-900/10' : 'text-slate-400'
                                                }`}
                                            >
                                              <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${isAllSubsSelected && isTopicSelected ? 'bg-purple-600 border-purple-600 text-white' :
                                                isPartialSubs ? 'bg-purple-900/50 border-purple-500 text-purple-400' :
                                                  'border-slate-600'
                                                }`}>
                                                {isAllSubsSelected && isTopicSelected && '✓'}
                                                {isPartialSubs && '−'}
                                              </div>
                                              <span className="text-slate-500 text-xs w-5">{topic.topic_no || '•'}</span>
                                              <span className="flex-1">{topic.name}</span>
                                              {hasSubTopics && (
                                                <span className="text-[10px] text-slate-600">
                                                  {isPartialSubs
                                                    ? `${selectedSubs!.length}/${topic.sub_topics!.length} sub-topics`
                                                    : `${topic.sub_topics!.length} sub-topics`
                                                  }
                                                </span>
                                              )}
                                            </div>

                                            {/* Sub-topic chips — always visible when topic selected */}
                                            {isTopicSelected && hasSubTopics && (
                                              <div className="pl-8 pb-2 flex flex-wrap gap-1.5">
                                                {topic.sub_topics!.map(sub => {
                                                  const isSubSelected = isAllSubsSelected || (Array.isArray(selectedSubs) && selectedSubs.includes(sub))
                                                  return (
                                                    <button
                                                      key={sub}
                                                      onClick={e => {
                                                        e.stopPropagation()
                                                        toggleScopeSubTopic(topic.id, sub, topic.sub_topics!)
                                                      }}
                                                      className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${isSubSelected
                                                        ? 'bg-purple-700/50 border-purple-500 text-purple-200'
                                                        : 'bg-slate-800 border-slate-600 text-slate-500 line-through'
                                                        }`}
                                                    >
                                                      {isSubSelected ? '✓ ' : '✗ '}{sub}
                                                    </button>
                                                  )
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                            <p className="text-xs text-slate-500">Select topics that will be covered in your exam</p>
                            <div className="flex gap-2">
                              <button
                                onClick={cancelScopeEdit}
                                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 text-sm"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => setScopeConfirmOpen(true)}
                                disabled={Object.keys(scopeSelectedTopics).length === 0}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Continue →
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ✅ WARNING MODAL - SYLLABUS ONLY */}
      {uploadWarningOpen && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-8 max-w-lg w-full shadow-2xl shadow-amber-900/20 transform scale-100 transition-all">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
                <span className="text-5xl">⚠️</span>
              </div>
              <h3 className="text-2xl font-bold text-amber-500 mb-2 tracking-wide font-display">
                One-Time Syllabus Upload
              </h3>
              <p className="text-slate-400 text-sm">Please review the rules carefully before proceeding.</p>
            </div>

            <div className="text-left text-sm text-slate-300 space-y-4 mb-8 bg-slate-950/50 p-6 rounded-xl border border-slate-800">
              <div className="flex gap-4 items-start">
                <div className="mt-1 w-6 h-6 rounded-full bg-amber-900/40 border border-amber-500/50 flex-shrink-0 flex items-center justify-center text-amber-500 text-xs font-bold">1</div>
                <div>
                  <p className="font-bold text-slate-200 block mb-1">Single Upload Only</p>
                  <p className="text-slate-400 text-xs leading-relaxed">You can only upload <strong>ONE syllabus</strong> per subject. Once uploaded, it cannot be changed or deleted in this version.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="mt-1 w-6 h-6 rounded-full bg-amber-900/40 border border-amber-500/50 flex-shrink-0 flex items-center justify-center text-amber-500 text-xs font-bold">2</div>
                <div>
                  <p className="font-bold text-slate-200 block mb-1">AI Processing</p>
                  <p className="text-slate-400 text-xs leading-relaxed">This process uses expensive AI credits. Please ensure your file is clear and readable.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="mt-1 w-6 h-6 rounded-full bg-amber-900/40 border border-amber-500/50 flex-shrink-0 flex items-center justify-center text-amber-500 text-xs font-bold">3</div>
                <div>
                  <p className="font-bold text-slate-200 block mb-1">No Reverts</p>
                  <p className="text-slate-400 text-xs leading-relaxed">Double-check your file. There is no undo button.</p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setUploadWarningOpen(false)
                  setUploadSubjectId(null)
                }}
                className="flex-1 px-4 py-3 bg-slate-800 text-slate-300 font-medium rounded-xl hover:bg-slate-700 transition border border-slate-700 hover:border-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={proceedToFileSelection}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold rounded-xl hover:from-amber-500 hover:to-amber-400 transition shadow-lg shadow-amber-900/30 flex items-center justify-center gap-2 group"
              >
                I Understand
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WARNING MODAL - QUESTIONS */}
      {questionsWarningOpen && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-purple-500/50 rounded-2xl p-8 max-w-lg w-full shadow-2xl shadow-purple-900/20 transform scale-100 transition-all max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
                <span className="text-5xl">📋</span>
              </div>
              <h3 className="text-2xl font-bold text-purple-400 mb-2 tracking-wide font-display">
                Upload All Papers Now
              </h3>
              <p className="text-slate-400 text-sm">This is a one-time upload. Read carefully.</p>
            </div>

            <div className="text-left text-sm text-slate-300 space-y-4 mb-8 bg-slate-950/50 p-6 rounded-xl border border-slate-800">
              <div className="flex gap-4 items-start">
                <div className="mt-1 w-6 h-6 rounded-full bg-purple-900/40 border border-purple-500/50 flex-shrink-0 flex items-center justify-center text-purple-400 text-xs font-bold">1</div>
                <div>
                  <p className="font-bold text-slate-200 block mb-1">Upload Everything Now</p>
                  <p className="text-slate-400 text-xs leading-relaxed">Add ALL your question papers in this session. You won't be able to add more later in this version.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="mt-1 w-6 h-6 rounded-full bg-purple-900/40 border border-purple-500/50 flex-shrink-0 flex items-center justify-center text-purple-400 text-xs font-bold">2</div>
                <div>
                  <p className="font-bold text-slate-200 block mb-1">Batch Processing</p>
                  <p className="text-slate-400 text-xs leading-relaxed">All files will be processed together in ONE AI call for efficiency.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="mt-1 w-6 h-6 rounded-full bg-purple-900/40 border border-purple-500/50 flex-shrink-0 flex items-center justify-center text-purple-400 text-xs font-bold">3</div>
                <div>
                  <p className="font-bold text-slate-200 block mb-1">Check Your Files</p>
                  <p className="text-slate-400 text-xs leading-relaxed">Ensure all papers are clear and readable for best AI extraction results.</p>
                </div>
              </div>
            </div>

            {uploadResourceType === 'ASSIGNMENT' && currentUploadSubject && (
              <div className="mb-8 p-4 rounded-xl border bg-slate-900/70 border-slate-700">
                <h4 className="text-sm font-semibold text-slate-100 mb-2">
                  Do assignments appear in your exam?
                </h4>
                <p className="text-xs text-slate-400 mb-4">
                  This controls how much assignment-based signal should influence predictions.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      value: 1.0 as 1.0,
                      label: 'Yes, heavily tested',
                      subtitle: 'Assignments closely mirror exam questions'
                    },
                    {
                      value: 0.6 as 0.6,
                      label: 'Sometimes overlap',
                      subtitle: 'Partial overlap — some topics appear'
                    },
                    {
                      value: 0.3 as 0.3,
                      label: 'Rarely on exams',
                      subtitle: 'Assignments are mostly for practice'
                    },
                    {
                      value: 0.0 as 0.0,
                      label: 'Never / Just for marks',
                      subtitle: 'Exams are completely independent'
                    }
                  ].map(option => {
                    const isSelected = pendingAssignmentFactor === option.value

                    return (
                      <button
                        key={option.label}
                        onClick={() => {
                          setPendingAssignmentFactor(option.value)
                          setAssignmentPrefSelected(true)
                        }}
                        className={`text-left rounded-xl border p-4 transition ${
                          isSelected
                            ? 'border-sky-400 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.4)]'
                            : 'border-slate-700 bg-slate-800/70 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className={`text-sm font-semibold ${isSelected ? 'text-sky-300' : 'text-slate-200'}`}>
                            {option.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {option.subtitle}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setQuestionsWarningOpen(false)
                  setUploadSubjectId(null)
                }}
                className="flex-1 px-4 py-3 bg-slate-800 text-slate-300 font-medium rounded-xl hover:bg-slate-700 transition border border-slate-700 hover:border-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={proceedToFileSelection}
                disabled={uploadResourceType === 'ASSIGNMENT' && !assignmentPrefSelected}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-500 text-white font-bold rounded-xl hover:from-purple-500 hover:to-purple-400 transition shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-purple-600 disabled:hover:to-purple-500"
              >
                I Understand
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ENHANCED UPLOAD MODAL */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-2xl w-full shadow-2xl relative">
            <button
              onClick={() => setUploadModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-2xl z-10"
            >
              ×
            </button>

            {/* Header with Icon */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${uploadResourceType === 'SYLLABUS' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700' :
                uploadResourceType === 'TEST_PAPER' ? 'bg-purple-900/30 text-purple-400 border border-purple-700' :
                  'bg-blue-900/30 text-blue-400 border border-blue-700'
                }`}>
                {uploadResourceType === 'SYLLABUS' ? '📄' : uploadResourceType === 'TEST_PAPER' ? '📊' : '📋'}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  Upload {uploadResourceType === 'SYLLABUS' ? 'Syllabus' : uploadResourceType === 'TEST_PAPER' ? 'Test Paper' : 'Assignment'}
                </h3>
                <p className="text-sm text-slate-400">
                  {uploadResourceType === 'SYLLABUS' ? 'Required to map topics' : 'AI will extract questions automatically'}
                </p>
              </div>
            </div>


            {/* Toggle for Single Paper - REMOVED/HIDDEN as per user request to not promote it */
              /* (Logic was here) */
            }

            {/* Limits Display for Question Papers */}
            {uploadResourceType !== 'SYLLABUS' && (
              <div className="mb-4 flex items-center justify-between text-xs text-slate-400 px-1">
                <span>📊 {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected</span>
                <span className={selectedFiles.length > 10 ? 'text-red-400' : 'text-slate-500'}>
                  Max 10 files per upload
                </span>
              </div>
            )}

            {/* Paper Tagging is now shown on file chips - see below */}

            {/* Drag & Drop Zone */}
            <div className="mb-4">
              <label className="block w-full h-32 border-2 border-dashed border-slate-600 rounded-xl hover:border-sky-400 hover:bg-slate-800/50 transition-colors cursor-pointer flex flex-col items-center justify-center group">
                <input
                  type="file"
                  multiple={true}
                  accept={ACCEPTED_TYPES[uploadResourceType].join(',')}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <span className="text-xl text-slate-400 group-hover:text-sky-400">+</span>
                </div>
                <p className="text-sm font-medium text-slate-300 group-hover:text-white">
                  {selectedFiles.length > 0 ? 'Add more files' : 'Click to upload'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {uploadResourceType === 'SYLLABUS' ? 'Images only (PNG, JPEG, WebP), max 3' : 'PDF or Images (max 20MB each)'}
                </p>
              </label>
            </div>

            {/* Selected Files - Perplexity-style Chips */}
            {selectedFiles.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>
                    Selected Files
                    {uploadResourceType !== 'SYLLABUS' && (
                      <span className="text-sky-400 ml-2 normal-case font-normal">
                        {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''} (Click to tag)
                      </span>
                    )}
                  </span>
                  {selectedFiles.length > 1 && (
                    <button
                      onClick={() => setSelectedFiles([])}
                      className="text-red-400 hover:text-red-300 text-xs font-normal"
                    >
                      Clear all
                    </button>
                  )}
                </h4>

                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, idx) => {
                    const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE'
                    const isImage = file.type.startsWith('image/')
                    const isPdf = file.type === 'application/pdf'

                    const tag = fileTags[idx]
                    const isTagged = !!(tag?.type && tag?.year)

                    const error = fileErrors[file.name]

                    // ✅ Get duplicate status for this file
                    const dupInfo = fileDuplicates[file.name]
                    const isDuplicate = dupInfo?.isDuplicate
                    const isCheckingDup = dupInfo?.isChecking

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (uploadResourceType !== 'SYLLABUS' && !isDuplicate) {
                            setTaggingFileIndex(idx)
                            setTaggingModalOpen(true)
                          }
                        }}
                        className={`group cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all hover:scale-[1.02] ${isDuplicate
                          ? 'bg-orange-900/30 border-orange-500/80'
                          : isCheckingDup
                            ? 'bg-slate-800/50 border-slate-600/50'
                            : error
                              ? 'bg-red-900/20 border-red-500/80 animate-pulse'
                              : uploadResourceType !== 'SYLLABUS'
                                ? (isTagged ? 'bg-emerald-900/20 border-emerald-600/50' : 'bg-amber-900/20 border-amber-500/50 animate-pulse-subtle')
                                : (isPdf ? 'bg-red-900/20 border-red-700/50' : 'bg-blue-900/20 border-blue-700/50')
                          }`}
                      >
                        {/* Status Icon */}
                        {isCheckingDup ? (
                          <span className="text-sm animate-spin">⏳</span>
                        ) : isDuplicate ? (
                          <span className="text-sm">🔄</span>
                        ) : error ? (
                          <span className="text-sm">⚠️</span>
                        ) : uploadResourceType !== 'SYLLABUS' && (
                          <span className="text-sm">
                            {isTagged ? '✅' : '✨'}
                          </span>
                        )}

                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-xs opacity-60 font-mono">[{ext}]</span>
                            <span className={`truncate max-w-[120px] font-medium ${isDuplicate ? 'text-orange-300 line-through' : 'text-slate-200'}`} title={file.name}>
                              {file.name.length > 15 ? file.name.slice(0, 12) + '...' : file.name}
                            </span>
                          </div>
                          {/* Show checking state */}
                          {isCheckingDup && (
                            <span className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">
                              Checking...
                            </span>
                          )}
                          {/* Show Duplicate warning */}
                          {!isCheckingDup && isDuplicate && (
                            <span className="text-[10px] text-orange-400 font-bold leading-none mt-0.5" title={`Already exists as: ${dupInfo.existingAs}`}>
                              Already uploaded{dupInfo.existingAs ? ` as "${dupInfo.existingAs.slice(0, 15)}..."` : ''}
                            </span>
                          )}
                          {/* Show Error if present */}
                          {!isCheckingDup && !isDuplicate && error && (
                            <span className="text-[10px] text-red-400 font-bold leading-none mt-0.5">
                              {error}
                            </span>
                          )}
                          {/* Show Tag if present and no error/duplicate */}
                          {!isCheckingDup && !isDuplicate && !error && isTagged && (
                            <span className="text-[10px] text-emerald-400 font-mono leading-none mt-0.5">
                              {tag.type} - {tag.year}
                            </span>
                          )}
                          {!isCheckingDup && !isDuplicate && !error && !isTagged && uploadResourceType !== 'SYLLABUS' && (
                            <span className="text-[10px] text-amber-400 font-mono leading-none mt-0.5">
                              Click to tag
                            </span>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFile(idx)
                          }}
                          className="opacity-50 hover:opacity-100 hover:text-red-400 transition-opacity ml-2 p-1 hover:bg-slate-700/50 rounded"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setUploadModalOpen(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={
                  selectedFiles.length === 0 ||
                  isUploading ||
                  isCheckingDuplicates ||
                  // Block if ALL files are duplicates
                  selectedFiles.every(f => fileDuplicates[f.name]?.isDuplicate) ||
                  (
                    uploadResourceType !== 'SYLLABUS' &&
                    // For non-syllabus: check that all non-duplicate files are tagged
                    selectedFiles.some((f, i) => !fileDuplicates[f.name]?.isDuplicate && !fileTags[i])
                  )
                }
                className={`flex-1 px-5 py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${selectedFiles.length === 0 ||
                  isUploading ||
                  isCheckingDuplicates ||
                  selectedFiles.every(f => fileDuplicates[f.name]?.isDuplicate) ||
                  (
                    uploadResourceType !== 'SYLLABUS' &&
                    selectedFiles.some((f, i) => !fileDuplicates[f.name]?.isDuplicate && !fileTags[i])
                  )
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : uploadResourceType === 'SYLLABUS'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20'
                  }`}
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : isCheckingDuplicates ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Checking...
                  </>
                ) : selectedFiles.length > 0 && selectedFiles.every(f => fileDuplicates[f.name]?.isDuplicate) ? (
                  <>
                    🔄 All Files Already Uploaded
                  </>
                ) : uploadResourceType !== 'SYLLABUS' && selectedFiles.some((f, i) => !fileDuplicates[f.name]?.isDuplicate && !fileTags[i]) ? (
                  <>
                    🏷️ Tag All Files First
                  </>
                ) : (
                  <>
                    Upload {selectedFiles.filter(f => !fileDuplicates[f.name]?.isDuplicate).length > 0
                      ? `${selectedFiles.filter(f => !fileDuplicates[f.name]?.isDuplicate).length} File(s)`
                      : ''}
                  </>
                )}
              </button>
            </div>
          </div >
        </div >
      )}

      {/* Paper Tagging Modal - Opens when user clicks the spark */}
      {taggingModalOpen && taggingFileIndex !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-amber-900/20">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-900/30 rounded-xl flex items-center justify-center text-2xl border border-amber-600/50">
                  🏷️
                </div>
                <div>
                  <h3 className="text-lg font-bold text-amber-200">Tag Your Paper</h3>
                  <p className="text-xs text-amber-500/70 font-mono mt-1">
                    {selectedFiles[taggingFileIndex]?.name.slice(0, 30)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTaggingModalOpen(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Exam Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'TT1', label: 'Term Test 1' },
                    { value: 'TT2', label: 'Term Test 2' },
                    { value: 'END_SEMESTER', label: 'End Sem' }
                  ].map(opt => {
                    const currentType = fileTags[taggingFileIndex]?.type
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFileTags(prev => ({
                          ...prev,
                          [taggingFileIndex]: { ...prev[taggingFileIndex], type: opt.value }
                        }))}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${currentType === opt.value
                          ? 'bg-amber-600 text-white shadow-lg'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                          }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Year *</label>
                <div className="grid grid-cols-3 gap-2">
                  {yearOptions.slice(0, 6).map(year => {
                    const currentYear = fileTags[taggingFileIndex]?.year
                    return (
                      <button
                        key={year}
                        onClick={() => setFileTags(prev => ({
                          ...prev,
                          [taggingFileIndex]: { ...prev[taggingFileIndex], year }
                        }))}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${currentYear === year
                          ? 'bg-amber-600 text-white shadow-lg'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                          }`}
                      >
                        {year}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-700">
              <p className="text-xs text-amber-400/60 mb-4">
                💡 Tags help us sort your papers correctly.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setTaggingModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setTaggingModalOpen(false)}
                  disabled={!fileTags[taggingFileIndex]?.type || !fileTags[taggingFileIndex]?.year}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${fileTags[taggingFileIndex]?.type && fileTags[taggingFileIndex]?.year
                    ? 'bg-amber-600 text-white hover:bg-amber-500'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                >
                  {fileTags[taggingFileIndex]?.type && fileTags[taggingFileIndex]?.year ? '✓ Done' : 'Select Both'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {
        deleteConfirmOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border-2 border-red-500 rounded-xl p-6 max-w-md w-full">
              <div className="text-center mb-4">
                <div className="text-5xl mb-3">⚠️</div>
                <h3 className="text-xl font-bold text-red-400 mb-2">
                  Delete Subject
                </h3>
                <p className="text-slate-300 text-sm mb-4">
                  This will permanently delete the subject and ALL associated data:
                </p>
                <ul className="text-left text-sm text-slate-400 space-y-1 mb-4">
                  <li>• All modules and topics</li>
                  <li>• All uploaded documents</li>
                  <li>• All questions and predictions</li>
                  <li>• This action CANNOT be undone</li>
                </ul>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Type <span className="font-bold text-red-400">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-red-400"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDeleteConfirmOpen(false)
                    setDeleteSubjectId(null)
                    setDeleteConfirmText('')
                  }}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteSubject}
                  disabled={deleteConfirmText !== 'DELETE'}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete Forever
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* ✅ Exam Scope Confirmation Modal */}
      {
        scopeConfirmOpen && scopeEditingSubjectId && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="glass-panel rounded-xl p-6 max-w-md w-full animate-scale-in shadow-2xl">
              <div className="text-center mb-4">
                <div className="text-5xl mb-3 animate-bounce">⚠️</div>
                <h3 className="text-xl font-bold text-yellow-400 mb-2">
                  Confirm Exam Scope
                </h3>
              </div>

              <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-4 mb-4">
                <p className="text-slate-300 text-sm mb-3">
                  You are about to save your exam scope with:
                </p>
                <ul className="text-sm text-slate-400 space-y-1 mb-3">
                  <li className="flex items-center gap-2">
                    <span className="text-purple-400">📝</span>
                    <span>Exam Type: <strong className="text-purple-300">{scopeExamType}</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-purple-400">📚</span>
                    <span>Topics Selected: <strong className="text-purple-300">{scopeSelectedTopics.size}</strong></span>
                  </li>
                </ul>
              </div>

              <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 mb-4">
                <p className="text-red-400 text-sm font-semibold mb-1">⚠️ This action cannot be undone!</p>
                <p className="text-slate-400 text-xs">
                  Once saved, the exam scope is locked. If you need to change it later, you will need to create a new subject.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setScopeConfirmOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg transition hover-lift"
                >
                  ← Go Back
                </button>
                <button
                  onClick={() => {
                    saveExamScope(scopeEditingSubjectId)
                    setScopeConfirmOpen(false)
                  }}
                  disabled={isSavingScope}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-semibold rounded-lg shadow-lg hover:shadow-purple-500/20 transition hover-lift disabled:opacity-50"
                >
                  {isSavingScope ? 'Saving...' : '💾 Save Scope'}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  )
}
