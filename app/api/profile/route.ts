import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET PROFILE
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // If no profile exists, create one
    if (!data) {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({ id: user.id })
        .select()
        .single()

      if (createError) {
        return NextResponse.json({ success: false, error: createError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, data: newProfile })
    }

    return NextResponse.json({ success: true, data })

  } catch (error: any) {
    console.error('❌ Profile GET error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

// UPDATE PROFILE
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { full_name, college, branch, semester } = await request.json()

    // Lookup college_id from college name
    let college_id = null
    if (college) {
      const { data: collegeData } = await supabase
        .from('colleges')
        .select('id')
        .ilike('name', college)
        .maybeSingle()

      if (collegeData) {
        college_id = collegeData.id
      }
    }

    // Use UPSERT to handle both create and update
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name,
        college,
        college_id,
        branch,
        semester
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    console.log('✅ Profile updated:', data)

    return NextResponse.json({ success: true, data })

  } catch (error: any) {
    console.error('❌ Profile PUT error:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
