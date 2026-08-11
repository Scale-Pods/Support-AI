import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface WorkflowLinkRow {
  workflows: {
    id: string
    name: string
    webhook_path: string | null
    is_active: boolean
    status: string
    has_webhook: boolean
    steps: unknown
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 })
  }

  const sb = createAdminClient()

  const { data: authData, error: authError } = await sb.auth.getUser(token)
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }

  const { data: profile } = await sb
    .from('users')
    .select('id, product_id')
    .eq('id', authData.user.id)
    .maybeSingle()

  const productId = profile?.product_id ?? null

  if (!productId) {
    return NextResponse.json({ workflows: [] })
  }

  const { data, error } = await sb
    .from('product_workflows')
    .select('workflows!inner(id, name, webhook_path, is_active, status, has_webhook, steps)')
    .eq('product_id', productId)
    .eq('workflows.status', 'published')
    .eq('workflows.is_active', true)
    .neq('workflows.webhook_path', 'client-chat')
    .order('name', { referencedTable: 'workflows', ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const workflows = ((data as unknown as WorkflowLinkRow[] | null) || []).map((row) => {
    const w = row.workflows
    return {
      id: w.id,
      name: w.name,
      webhook_path: w.webhook_path,
      is_active: w.is_active,
      status: w.status,
      has_webhook: w.has_webhook,
      steps_count: Array.isArray(w.steps) ? w.steps.length : 0,
    }
  })

  return NextResponse.json({ workflows })
}
