import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { id, email, fullName } = await req.json()

  if (!id || !email || !fullName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set — cannot create profile')
    return NextResponse.json({ error: 'Server misconfigured: service role key missing' }, { status: 500 })
  }

  const sb = createAdminClient()

  const { data: existingProfile } = await sb.from('users').select('id').eq('id', id).maybeSingle()

  const payload = {
    id,
    email,
    full_name: fullName,
    role: 'client',
    is_admin: false,
    product_id: null,
  }

  // The auth row can briefly be invisible to FK checks right after signUp
  // returns (commit race) — retry the upsert on 23503 instead of failing.
  let error: { code?: string; message: string } | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await sb.from('users').upsert(payload, { onConflict: 'id' })
    error = res.error
    if (!error || error.code !== '23503') break
    await new Promise(r => setTimeout(r, 400))
  }

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: true })
    }
    console.error('Admin insert error:', error.code, error.message)
    return NextResponse.json(
      { error: 'Failed to create profile', code: error.code },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, existing: !!existingProfile })
}
