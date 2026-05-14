import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await request.json()

  const { data, error } = await supabase
    .from('subjects')
    .insert({ name, user_id: user.id })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const subjectId = searchParams.get('id')

  if (!subjectId) {
    return NextResponse.json({ success: false, error: 'Subject ID required' }, { status: 400 })
  }

  // Verify ownership before delete
  const { data: subject } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .eq('user_id', user.id)
    .single()

  if (!subject) {
    return NextResponse.json({ success: false, error: 'Subject not found or not owned by user' }, { status: 404 })
  }

  // ── 1. Fetch all notes metadata for this subject ──────────────────────────
  const { data: notesMeta } = await supabase
    .from('qdrant_notes_metadata')
    .select('id, storage_path')
    .eq('subject_id', subjectId)

  const cleanupResults = { qdrant: 0, storage: 0, metadata: 0 }

  if (notesMeta && notesMeta.length > 0) {
    // ── 2. Delete Qdrant chunks for each upload ─────────────────────────────
    try {
      const { deleteByUploadId } = await import('@/lib/qdrant')
      await Promise.allSettled(
        notesMeta.map(async (note) => {
          await deleteByUploadId(note.id)
          cleanupResults.qdrant++
        })
      )
    } catch (err) {
      // Non-fatal: Qdrant may be unavailable but subject should still delete
      console.error('[SubjectDelete] Qdrant cleanup error (non-fatal):', err)
    }

    // ── 3. Delete storage files ──────────────────────────────────────────────
    const storagePaths = notesMeta.map(n => n.storage_path).filter(Boolean) as string[]
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('resources')
        .remove(storagePaths)
      if (storageError) {
        console.error('[SubjectDelete] Storage cleanup error (non-fatal):', storageError)
      } else {
        cleanupResults.storage = storagePaths.length
      }
    }

    // ── 4. Delete qdrant_notes_metadata rows ────────────────────────────────
    const { error: metaError } = await supabase
      .from('qdrant_notes_metadata')
      .delete()
      .eq('subject_id', subjectId)

    if (!metaError) {
      cleanupResults.metadata = notesMeta.length
    } else {
      console.error('[SubjectDelete] Metadata cleanup error (non-fatal):', metaError)
    }
  }

  // ── 5. Delete the subject row itself ────────────────────────────────────
  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', subjectId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  console.log(`[SubjectDelete] Subject ${subjectId} deleted. Cleaned up: ${cleanupResults.qdrant} Qdrant uploads, ${cleanupResults.storage} files, ${cleanupResults.metadata} metadata rows`)

  return NextResponse.json({
    success: true,
    cleanup: cleanupResults,
  })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { subject_id, config } = await request.json()

  if (!subject_id || !config || typeof config !== 'object' || Array.isArray(config)) {
    return NextResponse.json({ success: false, error: 'subject_id and config object are required' }, { status: 400 })
  }

  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id, config')
    .eq('id', subject_id)
    .eq('user_id', user.id)
    .single()

  if (subjectError || !subject) {
    return NextResponse.json({ success: false, error: 'Subject not found or not owned by user' }, { status: 404 })
  }

  const existingConfig =
    subject.config && typeof subject.config === 'object' && !Array.isArray(subject.config)
      ? subject.config
      : {}

  const mergedConfig = {
    ...existingConfig,
    ...config,
  }

  const { data, error } = await supabase
    .from('subjects')
    .update({ config: mergedConfig })
    .eq('id', subject_id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

