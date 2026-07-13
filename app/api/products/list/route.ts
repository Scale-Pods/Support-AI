import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  const sb = createAdminClient()

  const { data, error } = await sb
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const products = data || []

  const creatorIds = [...new Set(products.map((p: any) => p.created_by).filter(Boolean))]
  let creatorMap: Record<string, any> = {}
  if (creatorIds.length > 0) {
    const { data: creators } = await sb.from('users').select('id, full_name, email').in('id', creatorIds)
    creatorMap = Object.fromEntries((creators || []).map((c: any) => [c.id, c]))
  }

  const enriched = products.map((p: any) => ({
    ...p,
    creator: creatorMap[p.created_by] || null,
  }))

  return NextResponse.json({ products: enriched })
}
