import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  let body: { id?: string } = {}
  try { body = await req.json() } catch { /* ignore invalid body */ }

  const id = body?.id
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const url = process.env.N8N_MANUAL_CHECK_URL
  if (!url) return NextResponse.json({ error: 'N8N_MANUAL_CHECK_URL is not configured' }, { status: 500 })

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.N8N_MANUAL_CHECK_HEADER && process.env.N8N_MANUAL_CHECK_HEADER_VALUE) {
    headers[process.env.N8N_MANUAL_CHECK_HEADER] = process.env.N8N_MANUAL_CHECK_HEADER_VALUE
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 'Error ID': id })
    })
    const text = await res.text()
    return NextResponse.json({ ok: res.ok, status: res.status, response: text })
  } catch (e) {
    console.error('Manual resolution check webhook call failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
