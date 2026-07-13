import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { id, email, fullName } = await req.json()

  if (!id || !email || !fullName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const sb = createAdminClient()

  const { error } = await sb.from('users').insert({
    id,
    email,
    full_name: fullName,
    role: 'client',
    is_admin: false,
    product_id: null,
  })

  if (error) {
    console.error('Admin insert error:', error)
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
