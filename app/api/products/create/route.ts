import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, slug, created_by } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 })
  }

  const sb = createAdminClient()

  const { data: existing } = await sb.from('products').select('id').eq('slug', slug).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `A product with slug "${slug}" already exists` }, { status: 409 })
  }

  let finalCreatedBy = null
  if (created_by) {
    const { data: userExists } = await sb.from('users').select('id').eq('id', created_by).maybeSingle()
    if (userExists) finalCreatedBy = created_by
  }

  const { data, error } = await sb.from('products').insert({ name, slug, is_active: true, created_by: finalCreatedBy }).select()

  if (error) {
    console.error('Admin insert product error:', JSON.stringify(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, product: data })
}
