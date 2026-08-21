import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

interface ProductRow {
  id: string
  created_by: string | null
  [key: string]: unknown
}

interface CreatorRow {
  id: string
  full_name: string | null
  email: string
}

export async function GET() {
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const products = (data || []) as ProductRow[]

  const creatorIds = [...new Set(products.map(p => p.created_by).filter(Boolean))] as string[]
  const creatorMap: Record<string, CreatorRow> = {}
  if (creatorIds.length > 0) {
    const { data: creators } = await sb.from('users').select('id, full_name, email').in('id', creatorIds)
    for (const c of (creators || []) as CreatorRow[]) creatorMap[c.id] = c
  }

  const enriched = products.map(p => ({
    ...p,
    creator: creatorMap[p.created_by ?? ''] || null,
  }))

  return NextResponse.json({ products: enriched })
}
