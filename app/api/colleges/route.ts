import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET all colleges
export async function GET() {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('colleges')
            .select('id, name, short_code')
            .order('name', { ascending: true })

        if (error) {
            console.error('❌ Colleges fetch error:', error)
            return NextResponse.json({
                success: false,
                error: error.message
            }, { status: 500 })
        }

        return NextResponse.json({ success: true, data })

    } catch (error: any) {
        console.error('❌ Colleges GET error:', error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}
