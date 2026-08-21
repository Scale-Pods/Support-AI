'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import BgOrbs from '@/components/BgOrbs'
import Badge, { statusBadge, priorityBadge, catBadge, confBadge, severityBadge } from '@/components/Badge'
import { createClient } from '@/lib/supabase'
import { N8N_BASE } from '@/lib/supabase'
import type { Ticket, Escalation, AuditLog, Product, Message, Session } from '@/lib/types'
import {
  LayoutDashboard, ScrollText, Ticket as TicketIcon, AlertTriangle,
  Package, Upload, Users, Home, User, MessageSquare, Target,
  AlertOctagon, Box, RefreshCw, Menu, Sun, Moon, LogOut,
  Check, X, ChevronDown, Globe, Plus, Link2, FileText,
  File, CheckCircle2, CloudUpload, Loader2, Headphones, Eye, EyeOff,
} from 'lucide-react'

type View = 'dashboard'|'tickets'|'escalations'|'products'|'ingest'|'audit'|'users'|'errors'

type EscRow = Escalation & { _client?: string | null }

interface UserLite { id: string; full_name: string | null; email: string }
type AuditLogRow = AuditLog & { _user?: UserLite | null }

interface AdminUserRow extends UserLite {
  product_id: string | null
  is_admin?: boolean
  role?: string | null
  created_at: string
  products?: { id: string; name: string; slug: string } | null
}

interface KbDocRow {
  title?: string | null
  source_type?: string | null
  status?: string | null
  product_id?: string | null
  created_at: string
  products?: { id: string; name: string; slug: string } | null
  _public?: boolean
}

interface WorkflowErrorRow {
  id: string
  workflow_name?: string | null
  error_message?: string | null
  ai_diagnosis?: string | null
  ai_fix?: string | null
  execution_id?: string | null
  client_product_id?: string | null
  resolved?: boolean | string | null
  status?: string | null
  severity?: string | null
  created_at: string
  error_stack?: string | null
  failed_node?: string | null
  ai_resolution_diagnosis?: string | null
  replay_attempts?: number | null
  last_checked_at?: string | null
  product_name?: string
  client_name?: string
  client_email?: string
}

const AUDIT_PAGE_SIZE = 10
const AUDIT_ARCHIVE_DAYS = 15
const ESC_PAGE_SIZE = 10

function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
}

function isLocked(s: string | undefined | null) {
  return s === 'resolved' || s === 'closed'
}

function clientPrefix(name: string | null | undefined, email?: string | null) {
  const src = ((name || '').trim() || (email || '').split('@')[0] || '?')
  const words = src.split(/[\s._-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase() || 'TK'
}

function mergeEscalationPairs(rows: Escalation[]): Escalation[] {
  const WINDOW = 2 * 60 * 1000
  const used = new Set<string>()
  const out: Escalation[] = []
  const ts = (r: Escalation) => new Date(r.created_at).getTime()
  for (const r of rows) {
    if (used.has(r.id)) continue
    if (r.reason === 'user_requested' && r.triggered_by === 'system' && r.ticket_id) {
      let best: Escalation | undefined
      let bestD = Infinity
      for (const c of rows) {
        if (used.has(c.id) || c.id === r.id) continue
        if (!(c.reason === 'user_requested' && c.triggered_by === 'client' && !c.ticket_id)) continue
        if (c.session_id && r.session_id && c.session_id !== r.session_id) continue
        const d = Math.abs(ts(c) - ts(r))
        if (d < WINDOW && d < bestD) { best = c; bestD = d }
      }
      if (best) {
        used.add(best.id)
        out.push({
          ...r,
          session_id: r.session_id ?? best.session_id,
          triggered_by: 'client',
          client_reason: best.client_reason ?? null,
          client_note: best.client_note ?? null,
        })
        continue
      }
    }
    out.push(r)
  }
  return out
}

function ReplyBar(props: { replyText: string; onReplyChange: (v: string) => void; onSend: () => void; sending: boolean; locked: boolean; lockedLabel: string }) {
  return (
    <>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:'1rem', paddingTop:'0.875rem', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <textarea
          rows={2}
          value={props.replyText}
          disabled={props.locked}
          onChange={e => props.onReplyChange(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); props.onSend() } }}
          placeholder={props.locked ? 'Ticket resolved — replies are disabled' : 'Reply to the client as a support agent…'}
          style={{ flex:1, padding:'0.625rem 0.75rem', minHeight:42, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', resize:'none', outline:'none', ...(props.locked ? { opacity:0.5, cursor:'not-allowed' } : {}) }}
        />
        <button onClick={props.onSend} disabled={props.sending || props.locked} style={{ ...S.btnPrimary, flexShrink:0, opacity: (props.sending || props.locked) ? 0.6 : 1, cursor: (props.sending || props.locked) ? 'not-allowed' : 'pointer' }}>
          {props.sending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {props.locked && (
        <div style={{ marginTop:'0.625rem', fontSize:'0.75rem', color:'var(--chart-1)', display:'flex', alignItems:'center', gap:6 }}>
          <CheckCircle2 size={14} /> {props.lockedLabel}
        </div>
      )}
    </>
  )
}

const S: Record<string, React.CSSProperties> = {
  page:       { display:'flex', height:'100vh', overflow:'hidden', position:'relative', background:'var(--background)' },
  logoDot:    { width:8, height:8, borderRadius:'50%', background:'var(--primary)', boxShadow:'0 0 10px var(--primary)', flexShrink:0, WebkitTextFillColor:'initial' },
  sidebar:    { width:240, flexShrink:0, height:'100vh', background:'rgba(255,255,255,0.015)', borderRight:'1px solid rgba(255,255,255,0.06)', display:'flex', flexDirection:'column', position:'relative', zIndex:10 },
  sidebarInner:{ flex:1, overflowY:'auto', padding:'1.5rem 0.875rem' },
  sidebarLogo:{ fontFamily:'Inter,sans-serif', fontSize:'1.1rem', fontWeight:700, background:'linear-gradient(135deg,var(--primary),var(--chart-2))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', display:'flex', alignItems:'center', gap:8, padding:'0 0.5rem', marginBottom:'0.25rem' },
  sLogo2:     { width:8, height:8, borderRadius:'50%', background:'var(--primary)', boxShadow:'0 0 12px rgba(96,165,250,0.5)', flexShrink:0, WebkitTextFillColor:'initial' },
  pill:       { display:'inline-flex', padding:'0.1875rem 0.625rem', borderRadius:100, fontSize:'0.6rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', background:'rgba(139,92,246,0.12)', color:'var(--chart-2)', border:'1px solid rgba(139,92,246,0.2)', margin:'0 0.5rem 1.5rem' },
  secLabel:   { fontSize:'0.6rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted-foreground)', padding:'0 0.5rem', marginBottom:'0.625rem' },
  navItem:    { display:'flex', alignItems:'center', gap:10, padding:'0.5rem 0.625rem', borderRadius:8, fontSize:'0.8375rem', fontWeight:500, color:'var(--muted-foreground)', cursor:'pointer', border:'1px solid transparent', transition:'all 0.2s ease', textDecoration:'none', marginBottom:2, position:'relative' },
  navActive:  { background:'rgba(139,92,246,0.08)', border:'1px solid rgba(139,92,246,0.15)', color:'var(--chart-2)' },
  tktBadge:   { marginLeft:'auto', minWidth:18, height:18, padding:'0 5px', background:'var(--destructive)', color:'#fff', borderRadius:100, fontSize:'0.6rem', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' },
  userRow:    { marginTop:'auto', display:'flex', alignItems:'center', gap:10, padding:'0.75rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12 },
  uAvatar:    { width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,var(--chart-2),var(--primary))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', fontWeight:700, flexShrink:0, color:'#fff' },
  main:       { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', zIndex:1 },
  topbar:     { height:60, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.75rem', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.008)' },
  topbarTitle:{ fontFamily:'Inter,sans-serif', fontSize:'0.95rem', fontWeight:600, color:'var(--foreground)' },
  scroll:     { flex:1, overflowY:'auto', padding:'1.75rem' },
  vHeader:    { marginBottom:'1.75rem' },
  btnGhost:   { display:'inline-flex', alignItems:'center', gap:6, padding:'0.4375rem 0.875rem', borderRadius:8, fontSize:'0.8rem', fontWeight:600, cursor:'pointer', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'var(--muted-foreground)', fontFamily:'Inter,sans-serif', transition:'all 0.2s ease' },
  btnPrimary: { display:'inline-flex', alignItems:'center', gap:6, padding:'0.5rem 1rem', borderRadius:8, fontSize:'0.8rem', fontWeight:600, cursor:'pointer', border:'none', background:'linear-gradient(135deg,var(--chart-2),var(--primary))', color:'#fff', fontFamily:'Inter,sans-serif', boxShadow:'0 4px 14px rgba(139,92,246,0.25)', transition:'all 0.2s ease' },
  btnSuccess: { display:'inline-flex', alignItems:'center', gap:6, padding:'0.3125rem 0.625rem', borderRadius:6, fontSize:'0.75rem', fontWeight:600, cursor:'pointer', border:'1px solid rgba(34,197,94,0.2)', background:'rgba(34,197,94,0.08)', color:'var(--chart-1)', fontFamily:'Inter,sans-serif' },
  btnDanger:  { display:'inline-flex', alignItems:'center', gap:6, padding:'0.3125rem 0.625rem', borderRadius:6, fontSize:'0.75rem', fontWeight:600, cursor:'pointer', border:'1px solid rgba(239,68,68,0.2)', background:'rgba(239,68,68,0.08)', color:'var(--destructive)', fontFamily:'Inter,sans-serif' },
  statsGrid:  { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.75rem' },
  statCard:   { background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.25rem', backdropFilter:'blur(16px)', transition:'all 0.2s ease' },
  statLabel:  { fontSize:'0.7rem', fontWeight:500, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em' },
  statValue:  { fontFamily:'Inter,sans-serif', fontSize:'1.75rem', fontWeight:700, margin:'0.75rem 0 0.25rem', letterSpacing:'-0.02em' },
  dashGrid:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem' },
  card:       { background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, overflow:'hidden' },
  cardHeader: { padding:'1rem 1.25rem', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' },
  cardTitle:  { fontFamily:'Inter,sans-serif', fontSize:'0.9rem', fontWeight:600, color:'var(--foreground)' },
  table:      { width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' },
  th:         { textAlign:'left', padding:'0.75rem 0.875rem', color:'var(--muted-foreground)', fontWeight:600, fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid rgba(255,255,255,0.06)' },
  td:         { padding:'0.75rem 0.875rem', borderBottom:'1px solid rgba(255,255,255,0.03)', color:'var(--muted-foreground)', verticalAlign:'middle' },
  tktCard:    { background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'1.125rem 1.25rem', marginBottom:10, cursor:'pointer', transition:'all 0.2s ease' },
  filterBtn:  { padding:'0.375rem 0.75rem', borderRadius:100, fontSize:'0.75rem', fontWeight:500, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', color:'var(--muted-foreground)', cursor:'pointer', transition:'all 0.2s ease' },
  filterActive:{ background:'rgba(139,92,246,0.1)', border:'1px solid rgba(139,92,246,0.2)', color:'var(--chart-2)' },
  prodCard:   { background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.375rem', transition:'all 0.2s ease', cursor:'pointer' },
  ingestForm: { background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.5rem' },
  formRow:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' },
  fLabel:     { display:'block', fontSize:'0.8125rem', fontWeight:500, marginBottom:'0.5rem', color:'var(--muted-foreground)' },
  fInput:     { width:'100%', padding:'0.6875rem 0.875rem', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.875rem', outline:'none', marginBottom:'1.125rem', transition:'border-color 0.2s ease' },
  fSelect:    { width:'100%', padding:'0.6875rem 0.875rem', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.875rem', outline:'none', cursor:'pointer', marginBottom:'1.125rem' },
  fTextarea:  { width:'100%', padding:'0.75rem', minHeight:140, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.875rem', resize:'vertical', outline:'none' },
  progBar:    { height:4, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden', margin:'8px 0' },
  progFill:   { height:'100%', background:'linear-gradient(135deg,var(--chart-2),var(--primary))', borderRadius:4, transition:'width 0.4s ease' },
  modal:      { position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' },
  modalInner: { width:'100%', maxWidth:560, background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:20, padding:'1.75rem', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)', position:'relative', zIndex:1 },
  modalTitle: { fontFamily:'Inter,sans-serif', fontSize:'1.1rem', fontWeight:700, color:'var(--foreground)' },
  mFieldLabel:{ fontSize:'0.7rem', color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, fontWeight:600 },
  mFieldVal:  { fontSize:'0.875rem', lineHeight:1.6, color:'var(--foreground)' },
}

export default function AdminDashboard() {
  const { user, profile, token, loading, signIn, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [view, setView]         = useState<View>('dashboard')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [authErr, setAuthErr]   = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [redirected, setRedirected] = useState(false)
  const [tickets, setTickets]   = useState<Ticket[]>([])
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([])
  const [activeFilter, setActiveFilter]       = useState('all')
  const [escalations, setEscalations] = useState<EscRow[]>([])
  const [escPage, setEscPage]         = useState(1)
  const [auditLogs, setAuditLogs]     = useState<AuditLogRow[]>([])
  const [auditPage, setAuditPage]     = useState(1)
  const [auditTotal, setAuditTotal]   = useState(0)
  const [auditArchived, setAuditArchived] = useState(false)
  const [products, setProducts]       = useState<Product[]>([])
  const [users, setUsers]             = useState<AdminUserRow[]>([])
  const [kbDocs, setKbDocs]           = useState<KbDocRow[]>([])
  const [stats, setStats]             = useState({ conversations:0, openTickets:0, avgConf:0, escRate:0 })
  const [statInfo, setStatInfo]       = useState<string | null>(null)
  const [ticketCodes, setTicketCodes] = useState<Record<string, string>>({})
  const [categories, setCategories]   = useState<[string,number][]>([])
  const [recentLogs, setRecentLogs]   = useState<AuditLogRow[]>([])
  const [openTicketCount, setOpenTicketCount] = useState(0)
  const [selectedTicket, setSelectedTicket]   = useState<Ticket|null>(null)
  const [modalTeam, setModalTeam]     = useState('')
  const [selectedEscalation, setSelectedEscalation] = useState<Escalation|null>(null)
  const [escalationDetail, setEscalationDetail] = useState<{ msgs: Message[]; ticket: Ticket|null; session: Session|null; user: { full_name: string|null; email: string|null }|null } | null>(null)
  const [ticketDetail, setTicketDetail] = useState<{ msgs: Message[]; session: Session|null; user: { full_name: string|null; email: string|null }|null; escs: Escalation[] } | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [ingestProduct, setIngestProduct]   = useState('')
  const [ingestType, setIngestType]         = useState('faq')
  const [ingestTitle, setIngestTitle]       = useState('')
  const [ingestContent, setIngestContent]   = useState('')
  const [ingestProgress, setIngestProgress] = useState(0)
  const [ingestStatus, setIngestStatus]     = useState('')
  const [charCount, setCharCount]           = useState(0)
  const [ingestContentType, setIngestContentType] = useState<'url'|'text'|'pdf'|'docx'>('text')
  const [ingestFile, setIngestFile]         = useState<File|null>(null)
  const [ingestUrl, setIngestUrl]           = useState('')
  const [ingestLoading, setIngestLoading]   = useState(false)
  const [ingestError, setIngestError]       = useState('')
  const [ingestToast, setIngestToast]       = useState<{type:'success'|'error', msg:string}|null>(null)
  const [showCreateProduct, setShowCreateProduct] = useState(false)
  const [newProductName, setNewProductName]       = useState('')
  const [newProductSlug, setNewProductSlug]       = useState('')
  const [createProductLoading, setCreateProductLoading] = useState(false)
  const [workflowErrors, setWorkflowErrors] = useState<WorkflowErrorRow[]>([])
  const [expandedError, setExpandedError] = useState<string|null>(null)
  const [checkingId, setCheckingId] = useState<string|null>(null)
  const [checkStatus, setCheckStatus] = useState<Record<string,string>>({})
  const [dashLoading, setDashLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!loading && user && profile && !profile.is_admin) router.replace('/client')
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!loading && user && profile?.is_admin) { loadDashboard(); loadProducts(); }
  }, [user, profile, loading])

  useEffect(() => {
    if (showCreateProduct) setCreateProductLoading(false)
  }, [showCreateProduct])

  useEffect(() => {
    if (view !== 'errors') return
    loadErrors()
    const interval = setInterval(loadErrors, 30000)
    return () => clearInterval(interval)
  }, [view])

  async function handleLogin() {
    setAuthErr('')
    const err = await signIn(email, password)
    if (err) { setAuthErr(err); return }
  }

  useEffect(() => {
    if (redirected) return
    if (!loading && user && profile && !profile.is_admin) {
      setRedirected(true)
      router.push('/client')
    }
  }, [loading, user, profile])

  async function loadDashboard() {
    setDashLoading(true)
    try {
      const [logsRes, ticketsRes, sessionsRes] = await Promise.all([
        supabase.from('audit_logs').select('id,confidence,escalated,category,session_id,query,user_id,created_at').order('created_at', { ascending: false }).limit(200),
        supabase.from('tickets').select('id,status').order('created_at', { ascending: false }),
        supabase.from('public_sessions').select('id', { count: 'exact' })
      ])
      if (logsRes.error) console.error('Logs query error:', logsRes.error)
      if (ticketsRes.error) console.error('Tickets query error:', ticketsRes.error)
      if (sessionsRes.error) console.error('Sessions query error:', sessionsRes.error)
      const logs      = (logsRes.data || []) as AuditLog[]
      const allTkts   = ticketsRes.data || []
      const totalSess = sessionsRes.count || 0
      const open      = allTkts.filter(t => t.status === 'open').length
      const avgConf   = logs.length ? logs.reduce((s,l)=>s+(l.confidence||0),0)/logs.length : 0
      const escalated = logs.filter(l => l.escalated).length
      const escRate   = logs.length ? Math.round(escalated/logs.length*100) : 0
      setStats({ conversations: totalSess, openTickets: open, avgConf: Math.round(avgConf*100), escRate })
      buildTicketCodes()
      setOpenTicketCount(open)
      const cats: Record<string,number> = {}
      logs.forEach(l => { if(l.category) cats[l.category] = (cats[l.category]||0)+1 })
      setCategories(Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6))
      const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))]
    let userMap: Record<string, UserLite> = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds)
        userMap = Object.fromEntries((users || []).map(u => [u.id, u]))
      }
      setRecentLogs(logs.slice(0,8).map(l => ({ ...l, _user: userMap[l.user_id] || null })))
    } catch (e) {
      console.error('Dashboard load failed:', e)
    } finally {
      setDashLoading(false)
    }
  }

  async function buildTicketCodes() {
    const [tRes, sRes, uRes] = await Promise.all([
      supabase.from('tickets').select('id,session_id,created_at').order('created_at', { ascending: true }),
      supabase.from('public_sessions').select('id,user_id'),
      supabase.from('users').select('id,full_name,email'),
    ])
    type TRow = { id: string; session_id: string | null }
    type SRow = { id: string; user_id: string | null }
    type URow = { id: string; full_name: string | null; email: string | null }
    const sessUser = new Map<string, string | null>()
    for (const s of (sRes.data || []) as SRow[]) sessUser.set(s.id, s.user_id)
    const userPfx = new Map<string, string>()
    for (const u of (uRes.data || []) as URow[]) userPfx.set(u.id, clientPrefix(u.full_name, u.email))
    const byUser = new Map<string, string[]>()
    for (const t of (tRes.data || []) as TRow[]) {
      const uid = (t.session_id && sessUser.get(t.session_id)) || 'unknown'
      const arr = byUser.get(uid) || []
      arr.push(t.id)
      byUser.set(uid, arr)
    }
    const codes: Record<string, string> = {}
    byUser.forEach((ids, uid) => {
      const pfx = uid === 'unknown' ? 'TK' : (userPfx.get(uid) || 'TK')
      ids.forEach((id, i) => { codes[id] = `${pfx}${i + 1}` })
    })
    setTicketCodes(codes)
  }

  async function loadTickets() {
    const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false })
    const t = (data || []) as Ticket[]
    setTickets(t); setFilteredTickets(t)
    setOpenTicketCount(t.filter(x=>x.status==='open').length)
    buildTicketCodes()
  }

  function filterTickets(status: string) {
    setActiveFilter(status)
    setFilteredTickets(status === 'all' ? tickets : tickets.filter(t=>t.status===status))
  }

  async function updateTicketStatus(id: string, status: string) {
    await supabase.from('tickets').update({ status, ...(status==='resolved'?{resolved_at:new Date().toISOString()}:{}) }).eq('id', id)
    setActiveSessionId(null); setReplyText(''); loadTickets(); setSelectedTicket(null)
  }

  async function saveTicketTeam() {
    if (!selectedTicket) return
    await supabase.from('tickets').update({ assigned_team: modalTeam }).eq('id', selectedTicket.id)
    setActiveSessionId(null); setReplyText(''); setSelectedTicket(null); loadTickets()
  }

  async function loadEscalations() {
    const [eRes, sRes, uRes, tRes] = await Promise.all([
      supabase.from('escalations').select('*').order('created_at', { ascending: false }).limit(150),
      supabase.from('public_sessions').select('id,user_id'),
      supabase.from('users').select('id,full_name,email'),
      supabase.from('tickets').select('id,session_id'),
    ])
    const sessUser = new Map<string, string | null>()
    for (const s of (sRes.data || []) as { id: string; user_id: string | null }[]) sessUser.set(s.id, s.user_id)
    const uName = new Map<string, string>()
    for (const u of (uRes.data || []) as { id: string; full_name: string | null; email: string | null }[])
      uName.set(u.id, (u.full_name || '').trim() || (u.email || '').split('@')[0])
    // n8n-written escalations have session_id = null — recover it via their ticket
    const ticketSess = new Map<string, string | null>()
    for (const t of (tRes.data || []) as { id: string; session_id: string | null }[]) ticketSess.set(t.id, t.session_id)
    const merged = mergeEscalationPairs((eRes.data || []) as Escalation[])
    setEscPage(1)
    setEscalations(merged.map(e => {
      const sid = e.session_id ?? (e.ticket_id ? ticketSess.get(e.ticket_id) ?? null : null)
      return {
        ...e,
        session_id: sid,
        _client: sid ? (uName.get(sessUser.get(sid) || '') || null) : null,
      }
    }))
  }

  function dedupeMessages(msgs: Message[]): Message[] {
    return msgs.filter((m, i) => i === 0 || !(msgs[i-1].sender === m.sender && msgs[i-1].content === m.content))
  }

  async function openEscalation(e: Escalation) {
    setSelectedEscalation(e)
    setEscalationDetail(null)
    const ticketRes = e.ticket_id ? await supabase.from('tickets').select('*').eq('id', e.ticket_id).maybeSingle() : null
    const ticket = ticketRes?.data as Ticket | null
    const sid = e.session_id || ticket?.session_id
    if (!sid) { setEscalationDetail({ msgs: [], ticket, session: null, user: null }); return }
    setActiveSessionId(sid)
    const [msgsRes, sessRes] = await Promise.all([
      supabase.from('public_messages').select('*').eq('session_id', sid).order('created_at', { ascending: true }),
      supabase.from('public_sessions').select('*').eq('id', sid).maybeSingle()
    ])
    const msgs = dedupeMessages(((msgsRes.data || []) as Message[]).filter(m => !!m.content))
    const session = (sessRes.data as Session | null) || null
    let user: { full_name: string|null; email: string|null } | null = null
    const uid = session?.user_id
    if (uid && uid !== 'anonymous') {
      const { data } = await supabase.from('users').select('full_name, email').eq('id', uid).maybeSingle()
      user = data as { full_name: string|null; email: string|null } | null
    }
    setEscalationDetail({ msgs, ticket, session, user })
  }

  async function openTicket(t: Ticket) {
    setSelectedTicket(t)
    setModalTeam(t.assigned_team||'engineering')
    setTicketDetail(null)
    if (!t.session_id) return
    setActiveSessionId(t.session_id)
    const [msgsRes, sessRes, escRes] = await Promise.all([
      supabase.from('public_messages').select('*').eq('session_id', t.session_id).order('created_at', { ascending: true }),
      supabase.from('public_sessions').select('*').eq('id', t.session_id).maybeSingle(),
      supabase.from('escalations').select('*').or(`ticket_id.eq.${t.id},session_id.eq.${t.session_id}`).order('created_at', { ascending: true })
    ])
    const msgs = dedupeMessages(((msgsRes.data || []) as Message[]).filter(m => !!m.content))
    const escs = ((escRes.data || []) as Escalation[]).filter(e => e.reason !== 'user_requested' || !!e.client_reason)
    const session = (sessRes.data as Session | null) || null
    let user: { full_name: string|null; email: string|null } | null = null
    const uid = session?.user_id
    if (uid && uid !== 'anonymous') {
      const { data } = await supabase.from('users').select('full_name, email').eq('id', uid).maybeSingle()
      user = data as { full_name: string|null; email: string|null } | null
    }
    setTicketDetail({ msgs, user, escs, session })
  }

  async function sendAgentReply() {
    const text = replyText.trim()
    const sid = activeSessionId
    const locked =
      (selectedTicket && isLocked(selectedTicket.status)) ||
      (selectedEscalation && escalationDetail?.ticket && isLocked(escalationDetail.ticket.status))
    if (!text || !sid || replySending || locked) return
    setReplySending(true)
    const ownerId = (ticketDetail?.session?.user_id || escalationDetail?.session?.user_id) as string | undefined
    const { data, error } = await supabase
      .from('public_messages')
      .insert({
        session_id: sid,
        user_id: ownerId ?? null,
        sender: 'agent',
        content: text,
        message: text,
        should_escalate: 'false'
      })
      .select('id, created_at')
      .single()
    setReplySending(false)
    if (error) { console.error('Failed to send reply:', error.message); return }
    const newMsg: Message = {
      id: data?.id ?? 'agent-' + Date.now(),
      session_id: sid,
      sender: 'agent',
      content: text,
      created_at: data?.created_at ?? new Date().toISOString()
    }
    setReplyText('')
    if (ticketDetail) setTicketDetail(d => d && ({ ...d, msgs: dedupeMessages([...d.msgs, newMsg].filter(x => !!x.content)) }))
    if (escalationDetail) setEscalationDetail(d => d && ({ ...d, msgs: dedupeMessages([...d.msgs, newMsg].filter(x => !!x.content)) }))
  }

  useEffect(() => {
    if (!activeSessionId) return
    const channel = supabase
      .channel('admin-live-' + activeSessionId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'public_messages',
        filter: `session_id=eq.${activeSessionId}`
      }, (payload) => {
        const row = payload.new as Message
        if (row.sender !== 'user' || !row.content) return
        setTicketDetail(d => !d || d.msgs.some(x => x.id === row.id)
          ? d
          : ({ ...d, msgs: dedupeMessages([...d.msgs, row].filter(x => !!x.content)) }))
        setEscalationDetail(d => !d || d.msgs.some(x => x.id === row.id)
          ? d
          : ({ ...d, msgs: dedupeMessages([...d.msgs, row].filter(x => !!x.content)) }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeSessionId, supabase])

  async function loadAuditLogs(page = auditPage, archived = auditArchived) {
    const from = (page - 1) * AUDIT_PAGE_SIZE
    const cutoff = new Date(Date.now() - AUDIT_ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    let query = supabase.from('audit_logs').select('*', { count: 'exact' })
    query = archived
      ? query.lt('created_at', cutoff)
      : query.gte('created_at', cutoff)
    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + AUDIT_PAGE_SIZE - 1)
    const logs = (data || []) as AuditLog[]
    setAuditTotal(count || 0)
    const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))]
    let userMap: Record<string, UserLite> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds)
      userMap = Object.fromEntries((users || []).map(u => [u.id, u]))
    }
    setAuditLogs(logs.map(l => ({ ...l, _user: userMap[l.user_id] || null })))
  }

  function gotoAuditPage(p: number) {
    const max = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE))
    if (p < 1 || p > max || p === auditPage) return
    setAuditPage(p)
    loadAuditLogs(p, auditArchived)
  }

  async function toggleAuditArchive() {
    const next = !auditArchived
    setAuditArchived(next)
    setAuditPage(1)
    await loadAuditLogs(1, next)
  }

  async function loadProducts() {
    const res = await fetch('/api/products/list')
    const { products: data } = await res.json()
    setProducts((data || []) as Product[])
  }

  async function loadUsers() {
  const { data } = await supabase.from('users').select('*').eq('role', 'client').order('created_at', { ascending: false })
  if (data && data.length > 0) {
    const rows = data as AdminUserRow[]
    const productIds = [...new Set(rows.map(u => u.product_id).filter(Boolean))] as string[]
    if (productIds.length > 0) {
      const res = await fetch('/api/products/list')
      const { products: allProds } = await res.json()
      const prods = ((allProds || []) as Product[]).filter(p => productIds.includes(p.id))
      const prodMap = Object.fromEntries(prods.map(p => [p.id, p]))
      rows.forEach(u => { u.products = prodMap[u.product_id ?? ''] || null })
    }
  }
  setUsers(data || [])
 }

  async function loadErrors() {
    const { data: errors } = await supabase.from('workflow_errors')
      .select('id, workflow_name, error_message, ai_diagnosis, ai_fix, execution_id, client_product_id, resolved, status, created_at, error_stack, failed_node, severity, webhook_path, has_webhook, ai_resolution_diagnosis, replay_attempts, last_checked_at')
      .order('created_at', { ascending: false }).limit(100)
    if (!errors || errors.length === 0) { setWorkflowErrors([]); return }
    const rows = errors as WorkflowErrorRow[]
    const productIds = [...new Set(rows.map(e => e.client_product_id).filter(Boolean))] as string[]
    let prodMap: Record<string, Product> = {}
    if (productIds.length > 0) {
      const res = await fetch('/api/products/list')
      const { products: allProds } = await res.json()
      const prods = ((allProds || []) as Product[]).filter(p => productIds.includes(p.id))
      prodMap = Object.fromEntries(prods.map(p => [p.id, p]))
    }
    const userIds = [...new Set(rows.map(e => prodMap[e.client_product_id ?? '']?.id).filter(Boolean))] as string[]
    const userMap: Record<string, AdminUserRow> = {}
    if (userIds.length > 0) {
      const { data: clients } = await supabase.from('users').select('id, full_name, email, product_id').in('product_id', userIds)
      ;(clients || []).forEach(u => { const c = u as AdminUserRow; if (c.product_id) userMap[c.product_id] = c })
    }
    const enriched = rows.map(e => ({
      ...e,
      resolved: e.resolved === true || e.resolved === 'true' || e.status === 'resolved',
      product_name: prodMap[e.client_product_id ?? '']?.name || '—',
      client_name: userMap[e.client_product_id ?? '']?.full_name || '—',
      client_email: userMap[e.client_product_id ?? '']?.email || '—',
    }))
    setWorkflowErrors(enriched)
  }

  async function runResolutionCheck(e: WorkflowErrorRow) {
    setCheckingId(e.id)
    setCheckStatus(s => ({ ...s, [e.id]: 'Triggering check…' }))
    try {
      const res = await fetch('/api/admin/check-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setCheckStatus(s => ({ ...s, [e.id]: `Failed to start check: ${data.error || res.status}` }))
        setCheckingId(null)
        return
      }
    } catch (err) {
      setCheckStatus(s => ({ ...s, [e.id]: `Network error: ${err instanceof Error ? err.message : String(err)}` }))
      setCheckingId(null)
      return
    }
    setCheckStatus(s => ({ ...s, [e.id]: 'Check started — diagnosing…' }))
    let attempts = 0
    const timer = setInterval(async () => {
      attempts++
      const { data: row } = await supabase.from('workflow_errors')
        .select('id, status, resolved, ai_resolution_diagnosis, replay_attempts, last_checked_at')
        .eq('id', e.id)
        .maybeSingle()
      if (row) {
        const isResolved = row.resolved === true || row.resolved === 'true' || row.status === 'resolved'
        setWorkflowErrors(list => list.map(x => x.id === row.id ? { ...x, ...row, resolved: isResolved } : x))
        const diag = (row.ai_resolution_diagnosis || '').trim()
        if (diag) {
          setCheckStatus(s => ({ ...s, [e.id]: (isResolved ? 'Resolved — ' : 'Not resolved — ') + diag }))
          clearInterval(timer)
          setCheckingId(null)
          return
        }
      }
      if (attempts >= 10) {
        setCheckStatus(s => ({ ...s, [e.id]: 'Check finished — no new diagnosis recorded yet. Click again or Refresh to re-check.' }))
        clearInterval(timer)
        setCheckingId(null)
      }
    }, 5000)
  }

  async function loadKBDocs() {
    const { data } = await supabase.from('knowledge_documents').select('*').order('created_at', { ascending: false }).limit(20)
    const docs = (data || []) as KbDocRow[]
    const productIds = [...new Set(docs.map(d => d.product_id).filter(Boolean))] as string[]
    let prodMap: Record<string, Product> = {}
    if (productIds.length > 0) {
      const res = await fetch('/api/products/list')
      const { products: allProds } = await res.json()
      const prods = ((allProds || []) as Product[]).filter(p => productIds.includes(p.id))
      prodMap = Object.fromEntries(prods.map(p => [p.id, p]))
    }
    setKbDocs(docs.map(d => ({ ...d, products: prodMap[d.product_id ?? ''] || null, _public: !d.product_id })))
  }

  async function toggleProduct(id: string, active: boolean) {
    await supabase.from('products').update({ is_active: active }).eq('id', id); loadProducts()
  }

  async function assignProduct(userId: string, productId: string) {
    await supabase.from('users').update({ product_id: productId || null }).eq('id', userId)
  }

  async function handleCreateProduct() {
    if (!newProductName.trim() || !newProductSlug.trim()) { alert('Name and slug are required.'); return }
    setCreateProductLoading(true)
    try {
      const slug = newProductSlug.trim().toLowerCase().replace(/\s+/g, '-')
      const res = await fetch('/api/products/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProductName.trim(), slug, created_by: user?.id }),
      })
      if (!res.ok) { const err = await res.json(); alert('Failed to create product: ' + (err.error || 'Unknown error')); return }
      setNewProductName(''); setNewProductSlug(''); setShowCreateProduct(false)
      loadProducts()
    } catch (e) {
      alert('Network error: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCreateProductLoading(false)
    }
  }

  function isTextFile(file: File) {
    return /\.(txt|md|csv|json|xml|yaml|yml|log|env)$/i.test(file.name) || file.type.startsWith('text/')
  }

  function isPDF(file: File) {
    return /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
  }

  async function extractPDFText(file: File): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist')
    const worker = new Worker('/pdf.worker.min.mjs', { type: 'module' })
    pdfjsLib.GlobalWorkerOptions.workerPort = worker
    const buffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
    let text = ''
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n\n'
    }
    worker.terminate()
    return text.trim()
  }

  async function readFileContent(file: File): Promise<string> {
    if (isTextFile(file)) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsText(file)
      })
    }
    if (isPDF(file)) {
      return extractPDFText(file)
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function validateIngestUrl(url: string): boolean {
    try {
      const u = new URL(url)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch { return false }
  }

  function ingestFileBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function ingestDocument() {
    setIngestError('')
    if (!ingestProduct) { setIngestError('Please select a target product.'); return }
    if (!ingestTitle.trim()) { setIngestError('Please enter a document title.'); return }

    if (ingestContentType === 'url') {
      if (!ingestUrl.trim() || !validateIngestUrl(ingestUrl.trim())) {
        setIngestError('Please enter a valid http/https URL.'); return
      }
    } else if (ingestContentType === 'text') {
      if (!ingestContent.trim()) { setIngestError('Content cannot be empty.'); return }
    } else {
      if (!ingestFile) { setIngestError('Please select a file to upload.'); return }
      const ext = ingestContentType === 'pdf' ? '.pdf' : '.docx'
      if (!ingestFile.name.toLowerCase().endsWith(ext)) {
        setIngestError(`File must be a ${ext.toUpperCase()} file.`); return
      }
      if (ingestFile.size > 10 * 1024 * 1024) {
        setIngestError('File exceeds the 10 MB limit.'); return
      }
    }

    setIngestLoading(true); setIngestProgress(20); setIngestStatus('Processing…')
    try {
      const title = ingestTitle.trim() || (ingestContentType === 'url' ? ingestUrl.trim() : ingestFile?.name || ingestTitle)
      const productId = ingestProduct === '__public__' ? null : ingestProduct
      const isPublic = ingestProduct === '__public__'

      const body: Record<string, string | boolean | null> = {
        product_id: productId,
        title,
        is_public: isPublic,
      }

      if (ingestContentType === 'url') {
        body.url = ingestUrl.trim()
      } else if (ingestContentType === 'text') {
        body.content = ingestContent
        body.source_type = 'txt'
      } else {
        const base64 = await ingestFileBase64(ingestFile!)
        body.content = base64
        body.is_binary = true
        body.file_name = ingestFile!.name
      }

      setIngestProgress(50); setIngestStatus('Sending to n8n…')
      const res = await fetch(`${N8N_BASE}/admin-ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => null)

      if (res.ok && data?.success !== false) {
        setIngestProgress(100); setIngestToast({ type: 'success', msg: data?.message || 'Ingested successfully!' })
        setIngestTitle(''); setIngestContent(''); setCharCount(0); setIngestFile(null); setIngestUrl('')
        setTimeout(() => { setIngestProgress(0); setIngestToast(null) }, 4000)
        loadKBDocs()
      } else {
        const errMsg = data?.error || data?.message || `Server returned ${res.status}`
        setIngestProgress(0); setIngestStatus('')
        setIngestToast({ type: 'error', msg: errMsg })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setIngestProgress(0); setIngestStatus('')
      setIngestToast({ type: 'error', msg: `Network error: ${msg}` })
    } finally {
      setIngestLoading(false)
    }
  }

  function switchView(v: View) {
    setView(v); setSidebarOpen(false)
    if (v==='dashboard')   { loadDashboard(); loadProducts() }
    if (v==='tickets')     loadTickets()
    if (v==='escalations') loadEscalations()
    if (v==='audit')       loadAuditLogs()
    if (v==='products')    loadProducts()
    if (v==='users')       loadUsers()
    if (v==='ingest')      { loadKBDocs(); loadProducts() }
    if (v==='errors')      loadErrors()
  }

  const catColors = ['var(--primary)','var(--chart-2)','var(--ring)','var(--chart-1)','#eab308','#f97316']
  const initials = (profile?.full_name || profile?.email || 'A').split(' ').map((w:string)=>w[0]).join('').substr(0,2).toUpperCase()

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--background)', color:'var(--muted-foreground)', flexDirection:'column', gap:12 }}>
      <Loader2 size={28} style={{ animation:'spin 0.8s linear infinite', color:'var(--primary)' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize:'0.875rem', color:'var(--muted-foreground)' }}>Loading dashboard…</span>
    </div>
  )

  if (!user) return (
    <div style={{
      position:'fixed', inset:0, zIndex:200, background:'var(--background)',
      display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <BgOrbs />
      <div style={{
        width:'100%', maxWidth:420, background:'rgba(255,255,255,0.04)',
        border:'1px solid rgba(255,255,255,0.08)', borderRadius:20,
        padding:'2.5rem', backdropFilter:'blur(24px)', position:'relative', zIndex:1
      }}>
        <div style={{
          fontFamily:'Inter,sans-serif', fontSize:'1.25rem', fontWeight:700,
          background:'linear-gradient(135deg,var(--primary),var(--ring))', WebkitBackgroundClip:'text',
          WebkitTextFillColor:'transparent', display:'flex', alignItems:'center', gap:8, marginBottom:'2rem'
        }}>
          <div style={{
            width:8, height:8, borderRadius:'50%', background:'var(--primary)',
            boxShadow:'0 0 10px var(--primary)', flexShrink:0, WebkitTextFillColor:'initial'
          }} />
          <span>SupportAI</span>
        </div>
          <div style={{
            display:'inline-flex', alignItems:'center', padding:'0.25rem 0.75rem',
            borderRadius:100, fontSize:'0.75rem', fontWeight:600, textTransform:'uppercase',
            letterSpacing:'0.05em', background:'rgba(139,92,246,0.1)', color:'var(--chart-2)',
            border:'1px solid rgba(139,92,246,0.2)', marginBottom:'1rem'
          }}>
            <AlertOctagon size={12} style={{ marginRight:6 }} /> Admin Access
          </div>
        <h1 style={{
          fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.5rem'
        }}>Admin Dashboard</h1>
        <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'2rem' }}>
          Sign in with your admin credentials.
        </p>
        <label style={{ display:'block', fontSize:'0.8125rem', fontWeight:500, marginBottom:'0.5rem', color:'var(--muted-foreground)' }}>
          Email
        </label>
        <input
          type="email"
          style={{
            width:'100%', padding:'0.75rem 1rem', background:'rgba(255,255,255,0.05)',
            border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'var(--foreground)',
            fontFamily:'Inter,sans-serif', fontSize:'0.9rem', outline:'none', marginBottom:'1.25rem'
          }}
          value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@company.com"
        />
        <label style={{ display:'block', fontSize:'0.8125rem', fontWeight:500, marginBottom:'0.5rem', color:'var(--muted-foreground)' }}>
          Password
        </label>
        <div style={{ position:'relative', marginBottom:'1.25rem' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            style={{
              width:'100%', padding:'0.75rem 2.75rem 0.75rem 1rem', background:'rgba(255,255,255,0.05)',
              border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'var(--foreground)',
              fontFamily:'Inter,sans-serif', fontSize:'0.9rem', outline:'none'
            }}
            value={password} onChange={e=>setPassword(e.target.value)}
            placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&handleLogin()}
          />
          <button
            type="button"
            onClick={()=>setShowPassword(v=>!v)}
            style={{ position:'absolute', right:'0.625rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--muted-foreground)', padding:4, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:0 }}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        </div>
        <button
          style={{
            width:'100%', padding:'0.875rem', background:'linear-gradient(135deg,var(--chart-2),var(--primary))',
            border:'none', borderRadius:8, color:'#fff', fontFamily:'Inter,sans-serif',
            fontSize:'0.9375rem', fontWeight:600, cursor:'pointer',
            boxShadow:'0 0 20px rgba(139,92,246,0.3)'
          }}
          onClick={handleLogin}
        >
          Access Dashboard →
        </button>
        {authErr && (
          <div style={{
            color:'var(--destructive)', fontSize:'0.8125rem', textAlign:'center',
            marginTop:'1rem'
          }}>
            {authErr}
          </div>
        )}
      </div>
    </div>
  )

  const icons: Record<string, React.ReactNode> = {
    dashboard: <LayoutDashboard size={16} />,
    audit: <ScrollText size={16} />,
    tickets: <TicketIcon size={16} />,
    escalations: <AlertTriangle size={16} />,
    products: <Package size={16} />,
    ingest: <Upload size={16} />,
    users: <Users size={16} />,
    home: <Home size={16} />,
    user: <User size={16} />,
    chat: <MessageSquare size={16} />,
    target: <Target size={16} />,
    alert: <AlertOctagon size={16} />,
    box: <Box size={16} />,
  }

  const navItems: [View, string, string][] = [
    ['dashboard','dashboard','Dashboard'],['audit','audit','Audit Logs'],
    ['tickets','tickets','Tickets'],['escalations','escalations','Escalations'],
    ['products','products','Products'],['ingest','ingest','KB Ingestion'],['users','users','Client Users']
  ]

  return (
    <><style>{`
      .admin-hamburger { display: none; }
      .admin-sidebar-overlay { display: none !important; position: fixed; inset:0; z-index:105; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); }
      .admin-sidebar-overlay.visible { display: block !important; }
      .admin-scroll table { min-width: 600px; }
      .admin-scroll tbody tr { transition: background 0.15s; }
      .admin-scroll tbody tr:hover { background: rgba(255,255,255,0.03); }
      @media (max-width: 768px) {
        .admin-sidebar { transform: translateX(-100%); position: fixed !important; z-index: 110 !important; transition: transform 0.3s ease; }
        .admin-sidebar.open { transform: translateX(0); }
        .admin-sidebar-overlay.visible { display: block !important; }
        .admin-stats-grid { grid-template-columns: repeat(2,1fr) !important; }
        .admin-dash-grid { grid-template-columns: 1fr !important; }
        .admin-form-row { grid-template-columns: 1fr !important; }
        .admin-prod-grid { grid-template-columns: 1fr !important; }
        .admin-scroll { padding: 1rem !important; }
        .admin-scroll table { min-width: 500px; }
      }
      @media (max-width: 480px) {
        .admin-stats-grid { grid-template-columns: 1fr !important; }
        .admin-hamburger { display: flex !important; }
        .admin-scroll table { min-width: 400px; }
      }
    `}</style>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <div style={S.page}>
      <BgOrbs />

      {/* TICKET MODAL */}
      {selectedTicket && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&(setSelectedTicket(null), setActiveSessionId(null))}>
          <div style={{ ...S.modalInner, maxWidth:680 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
              <div style={S.modalTitle}>Ticket #{ticketCodes[selectedTicket.id] || selectedTicket.id.substr(0,8)}</div>
              <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=>{setSelectedTicket(null); setActiveSessionId(null)}}><X size={14} /></div>
            </div>
            {[['Title',selectedTicket.title],['Description',selectedTicket.description||'—']].map(([l,v])=>(
              <div key={l} style={{ marginBottom:'1rem' }}>
                <div style={S.mFieldLabel}>{l}</div>
                <div style={S.mFieldVal}>{v}</div>
              </div>
            ))}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
              <div><div style={S.mFieldLabel}>Status</div><Badge variant={statusBadge(selectedTicket.status)}>{selectedTicket.status}</Badge></div>
              <div><div style={S.mFieldLabel}>Priority</div><Badge variant={priorityBadge(selectedTicket.priority)}>{selectedTicket.priority}</Badge></div>
              <div><div style={S.mFieldLabel}>Team</div><div style={S.mFieldVal}>{selectedTicket.assigned_team||'—'}</div></div>
              <div><div style={S.mFieldLabel}>Admin Only</div><Badge variant="purple">Hidden from client</Badge></div>
            </div>
            <div style={{ marginBottom:'1rem' }}>
              <div style={S.mFieldLabel}>Client</div>
              <div style={S.mFieldVal}>{ticketDetail?.user?.full_name || ticketDetail?.user?.email || '—'}</div>
              {ticketDetail?.user?.email && <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{ticketDetail.user.email}</div>}
            </div>
            <div style={{ marginBottom:'1rem' }}>
              <div style={S.mFieldLabel}>Update Team</div>
              <select style={{ ...S.fSelect, marginTop:6, marginBottom:0 }} value={modalTeam} onChange={e=>setModalTeam(e.target.value)}>
                {['engineering','product','ops','finance','support'].map(t=><option key={t} value={t} style={{ background:'var(--card)', color:'var(--foreground)' }}>{t}</option>)}
              </select>
            </div>

            {/* Why the client escalated */}
            {ticketDetail && ticketDetail.escs.length > 0 && (
              <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.18)', borderRadius:12, padding:'1rem 1.125rem', marginBottom:'1.25rem' }}>
                <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--destructive)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Why they escalated</div>
                {ticketDetail.escs.map((e) => (
                  <div key={e.id} style={{ marginBottom:10 }}>
                    <div style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--foreground)', marginBottom:4 }}>
                      {e.client_reason || (e.reason === 'auto_threshold' ? 'Low confidence response (auto-escalated)' : e.reason || 'Not specified')}
                    </div>
                    {e.client_note && <div style={{ fontSize:'0.8125rem', color:'var(--muted-foreground)', lineHeight:1.6, marginBottom:4 }}>“{e.client_note}”</div>}
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <Badge variant={e.triggered_by==='system'?'blue':'purple'}>{e.triggered_by||'—'}</Badge>
                      {e.confidence_at_trigger!=null && <Badge variant={confBadge(e.confidence_at_trigger)}>{Math.round(e.confidence_at_trigger*100)}% confidence</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Full chat transcript */}
            <div style={{ marginBottom:'0.625rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Full Chat Transcript</div>
              <span style={{ fontSize:'0.7rem', color:'var(--muted-foreground)' }}>{ticketDetail?.msgs?.length || 0} messages</span>
            </div>
            <div style={{ maxHeight:300, overflowY:'auto', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'1rem', display:'flex', flexDirection:'column', gap:'0.875rem' }}>
              {!ticketDetail ? (
                <div style={{ textAlign:'center', color:'var(--muted-foreground)', fontSize:'0.8125rem', padding:'2rem 0' }}>Loading transcript…</div>
              ) : ticketDetail.msgs.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--muted-foreground)', fontSize:'0.8125rem', padding:'2rem 0' }}>No messages stored for this session.</div>
              ) : ticketDetail.msgs.map((m) => (
                <div key={m.id} style={{ display:'flex', gap:10, alignItems:'flex-start', maxWidth:'80%', alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: m.sender === 'user' ? 'rgba(255,255,255,0.08)' : m.sender === 'agent' ? 'linear-gradient(135deg,var(--chart-1),var(--chart-3))' : 'linear-gradient(135deg,var(--chart-2),var(--primary))', color:'#fff' }}>
                    {m.sender === 'user' ? <User size={14} /> : m.sender === 'agent' ? <Headphones size={14} /> : <MessageSquare size={14} />}
                  </div>
                  <div style={{ maxWidth:'75%' }}>
                    {m.sender === 'agent' && <div style={{ fontSize:'0.6875rem', color:'var(--chart-1)', marginBottom:2 }}>Support Agent</div>}
                    <div style={{ padding:'0.625rem 0.875rem', borderRadius:10, fontSize:'0.8125rem', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word', background: m.sender === 'user' ? 'rgba(255,255,255,0.06)' : m.sender === 'agent' ? 'rgba(34,197,94,0.08)' : 'rgba(139,92,246,0.08)', border: m.sender === 'user' ? '1px solid rgba(255,255,255,0.08)' : m.sender === 'agent' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(139,92,246,0.15)' }}>
                      {m.content}
                      {Array.isArray(m.files) && m.files.length > 0 && (
                        <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6, alignItems:'flex-start' }}>
                          {m.files.map((f, i) => (f.url || f.data) && f.type?.startsWith('image/') ? (
                            <img key={i} src={f.url || f.data} alt={f.name} style={{ maxWidth:'100%', maxHeight:240, borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', cursor:'pointer' }} onClick={() => window.open(f.url || f.data, '_blank')} title={f.name} />
                          ) : (f.url || f.data) ? (
                            <a key={i} href={f.url || f.data} download={f.name} target={f.url ? '_blank' : undefined} rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'0.25rem 0.5rem', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, fontSize:'0.6875rem', textDecoration:'none', color:'inherit' }}><FileText size={11} />{f.name}</a>
                          ) : (
                            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'0.25rem 0.5rem', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, fontSize:'0.6875rem' }}><FileText size={11} />{f.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.6875rem', color:'var(--muted-foreground)', marginTop:4, justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                      {fmtDate(m.created_at)}
                      {m.category && <Badge variant={catBadge(m.category)}>{m.category}</Badge>}
                      {m.confidence != null && <Badge variant={confBadge(m.confidence)}>{Math.round(m.confidence*100)}%</Badge>}
                      {m.should_escalate === 'true' && <Badge variant="red">Escalated</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <ReplyBar
              replyText={replyText}
              onReplyChange={setReplyText}
              onSend={sendAgentReply}
              sending={replySending}
              locked={isLocked(selectedTicket.status)}
              lockedLabel={`This ticket is marked ${selectedTicket.status} — agent replies are disabled.`}
            />
            <div style={{ display:'flex', gap:12, marginTop:'1.5rem' }}>
              <button style={S.btnPrimary} onClick={saveTicketTeam}>Save Team</button>
              <button style={S.btnSuccess} onClick={()=>updateTicketStatus(selectedTicket.id,'resolved')}>Mark Resolved</button>
              <button style={S.btnGhost} onClick={()=>setSelectedTicket(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ESCALATION DETAIL MODAL */}
      {selectedEscalation && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&(setSelectedEscalation(null), setActiveSessionId(null))}>
          <div style={{ ...S.modalInner, maxWidth:720 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <AlertTriangle size={16} color="var(--destructive)" />
                <div style={S.modalTitle}>Escalation</div>
              </div>
              <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=>{setSelectedEscalation(null); setActiveSessionId(null)}}><X size={14} /></div>
            </div>

            {/* Why the client escalated */}
            <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.18)', borderRadius:12, padding:'1rem 1.125rem', marginBottom:'1.25rem' }}>
              <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--destructive)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Why they escalated</div>
              <div style={{ fontSize:'0.9375rem', fontWeight:700, color:'var(--foreground)', marginBottom: selectedEscalation.client_note ? 6 : 0 }}>
                {selectedEscalation.client_reason || (selectedEscalation.reason === 'auto_threshold' ? 'Low confidence response (auto-escalated)' : selectedEscalation.reason || 'Not specified')}
              </div>
              {selectedEscalation.client_note && <div style={{ fontSize:'0.8125rem', color:'var(--muted-foreground)', lineHeight:1.6 }}>“{selectedEscalation.client_note}”</div>}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
              <div><div style={S.mFieldLabel}>Triggered By</div><Badge variant={selectedEscalation.triggered_by==='system'?'blue':'purple'}>{selectedEscalation.triggered_by||'—'}</Badge></div>
              <div><div style={S.mFieldLabel}>Confidence at Trigger</div><div style={S.mFieldVal}>{selectedEscalation.confidence_at_trigger!=null?Math.round(selectedEscalation.confidence_at_trigger*100)+'%':'—'}</div></div>
              <div><div style={S.mFieldLabel}>Routed To</div><div style={S.mFieldVal}>{selectedEscalation.routed_to||'—'}</div></div>
              <div><div style={S.mFieldLabel}>Time</div><div style={S.mFieldVal}>{fmtDate(selectedEscalation.created_at)}</div></div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.25rem' }}>
              <div>
                <div style={S.mFieldLabel}>Client</div>
                <div style={S.mFieldVal}>{escalationDetail?.user?.full_name || escalationDetail?.user?.email || '—'}</div>
                {escalationDetail?.user?.email && <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{escalationDetail.user.email}</div>}
              </div>
              <div>
                <div style={S.mFieldLabel}>Ticket</div>
                {escalationDetail?.ticket ? (
                  <div style={S.mFieldVal}>
                    <span style={{ fontFamily:'monospace', fontSize:'0.75rem' }}>#{ticketCodes[escalationDetail.ticket.id] || escalationDetail.ticket.id.substr(0,8)}</span>{' '}
                    <Badge variant={statusBadge(escalationDetail.ticket.status)}>{escalationDetail.ticket.status}</Badge>
                    <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)', marginTop:2 }}>{escalationDetail.ticket.assigned_team||'unassigned'}</div>
                  </div>
                ) : <div style={S.mFieldVal}>No ticket</div>}
              </div>
            </div>

            {/* Full transcript */}
            <div style={{ marginBottom:'0.625rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Full Chat Transcript</div>
              <span style={{ fontSize:'0.7rem', color:'var(--muted-foreground)' }}>{escalationDetail?.msgs?.length || 0} messages</span>
            </div>
            <div style={{ maxHeight:320, overflowY:'auto', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'1rem', display:'flex', flexDirection:'column', gap:'0.875rem' }}>
              {!escalationDetail ? (
                <div style={{ textAlign:'center', color:'var(--muted-foreground)', fontSize:'0.8125rem', padding:'2rem 0' }}>Loading transcript…</div>
              ) : escalationDetail.msgs.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--muted-foreground)', fontSize:'0.8125rem', padding:'2rem 0' }}>No messages stored for this session.</div>
              ) : escalationDetail.msgs.map((m) => (
                <div key={m.id} style={{ display:'flex', gap:10, alignItems:'flex-start', maxWidth:'80%', alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: m.sender === 'user' ? 'rgba(255,255,255,0.08)' : m.sender === 'agent' ? 'linear-gradient(135deg,var(--chart-1),var(--chart-3))' : 'linear-gradient(135deg,var(--chart-2),var(--primary))', color:'#fff' }}>
                    {m.sender === 'user' ? <User size={14} /> : m.sender === 'agent' ? <Headphones size={14} /> : <MessageSquare size={14} />}
                  </div>
                  <div style={{ maxWidth:'75%' }}>
                    {m.sender === 'agent' && <div style={{ fontSize:'0.6875rem', color:'var(--chart-1)', marginBottom:2 }}>Support Agent</div>}
                    <div style={{ padding:'0.625rem 0.875rem', borderRadius:10, fontSize:'0.8125rem', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word', background: m.sender === 'user' ? 'rgba(255,255,255,0.06)' : m.sender === 'agent' ? 'rgba(34,197,94,0.08)' : 'rgba(139,92,246,0.08)', border: m.sender === 'user' ? '1px solid rgba(255,255,255,0.08)' : m.sender === 'agent' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(139,92,246,0.15)' }}>
                      {m.content}
                      {Array.isArray(m.files) && m.files.length > 0 && (
                        <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6, alignItems:'flex-start' }}>
                          {m.files.map((f, i) => (f.url || f.data) && f.type?.startsWith('image/') ? (
                            <img key={i} src={f.url || f.data} alt={f.name} style={{ maxWidth:'100%', maxHeight:240, borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', cursor:'pointer' }} onClick={() => window.open(f.url || f.data, '_blank')} title={f.name} />
                          ) : (f.url || f.data) ? (
                            <a key={i} href={f.url || f.data} download={f.name} target={f.url ? '_blank' : undefined} rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'0.25rem 0.5rem', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, fontSize:'0.6875rem', textDecoration:'none', color:'inherit' }}><FileText size={11} />{f.name}</a>
                          ) : (
                            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'0.25rem 0.5rem', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, fontSize:'0.6875rem' }}><FileText size={11} />{f.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.6875rem', color:'var(--muted-foreground)', marginTop:4, justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                      {fmtDate(m.created_at)}
                      {m.category && <Badge variant={catBadge(m.category)}>{m.category}</Badge>}
                      {m.confidence != null && <Badge variant={confBadge(m.confidence)}>{Math.round(m.confidence*100)}%</Badge>}
                      {m.should_escalate === 'true' && <Badge variant="red">Escalated</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <ReplyBar
              replyText={replyText}
              onReplyChange={setReplyText}
              onSend={sendAgentReply}
              sending={replySending}
              locked={!!escalationDetail?.ticket && isLocked(escalationDetail.ticket.status)}
              lockedLabel={escalationDetail?.ticket ? `Linked ticket is marked ${escalationDetail.ticket.status} — agent replies are disabled.` : 'This ticket is resolved — agent replies are disabled.'}
            />
          </div>
        </div>
      )}

      {/* CREATE PRODUCT MODAL */}
      {showCreateProduct && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setShowCreateProduct(false)}>
          <div style={S.modalInner}>
            <div style={S.modalTitle}>Create Product</div>
            <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem', marginTop:'0.375rem' }}>Add a new product with its own isolated knowledge base.</p>
            <label style={S.fLabel}>Product Name</label>
            <input type="text" style={S.fInput} value={newProductName} onChange={e=>{const v=e.target.value;setNewProductName(v);setNewProductSlug(v.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))}} placeholder="e.g. Acme Dashboard" />
            <label style={S.fLabel}>Slug</label>
            <input type="text" style={S.fInput} value={newProductSlug} onChange={e=>setNewProductSlug(e.target.value.toLowerCase().replace(/\s+/g,'-'))} placeholder="e.g. acme-dashboard" />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:'1.5rem' }}>
              <button style={S.btnGhost} onClick={()=>setShowCreateProduct(false)}>Cancel</button>
              <button style={{ ...S.btnPrimary, opacity: createProductLoading ? 0.6 : 1, cursor: createProductLoading ? 'not-allowed' : 'pointer' }} disabled={createProductLoading} onClick={handleCreateProduct}>
                {createProductLoading ? 'Creating…' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR BACKDROP */}
      <div className={`admin-sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* SIDEBAR */}
      <div className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`} style={S.sidebar}>
        <div style={S.sidebarInner}>
          <div style={S.sidebarLogo}><div style={S.sLogo2} /><span>SupportAI</span></div>
          <div style={S.pill}>Admin Portal</div>
            {([['Overview',navItems.slice(0,2)],['Support',navItems.slice(2,4)],['Configuration',navItems.slice(4)]] as [string, typeof navItems][]).map(([sec, items])=>(
            <div key={sec} style={{ marginBottom:'1.5rem' }}>
              <div style={S.secLabel}>{sec}</div>
              {items.map(([v,iconKey,label])=>(
                <div key={v} style={{ ...S.navItem, ...(view===v?S.navActive:{}) }} onClick={()=>switchView(v)}>
                  <span style={{ flexShrink:0, display:'flex', color:'currentColor' }}>{icons[iconKey]}</span>{label}
                  {v==='tickets' && openTicketCount > 0 && <div style={S.tktBadge}>{openTicketCount}</div>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ marginBottom:'1.5rem' }}>
            <div style={S.secLabel}>Workflows</div>
            <Link href="/admin/workflows" style={{ ...S.navItem }}><span style={{ flexShrink:0, display:'flex', color:'currentColor' }}>{icons.box}</span>Workflows</Link>
            <div style={{ ...S.navItem, ...(view==='errors'?S.navActive:{}) }} onClick={()=>switchView('errors')}><span style={{ flexShrink:0, display:'flex', color:'currentColor' }}>{icons.alert}</span>Workflow Errors</div>
          </div>
          <div style={{ marginBottom:'1.5rem' }}>
            <div style={S.secLabel}>Other</div>
            <Link href="/"       style={{ ...S.navItem }}><span style={{ flexShrink:0, display:'flex', color:'currentColor' }}>{icons.home}</span>Landing Page</Link>
            <div style={{ ...S.navItem }} onClick={signOut}><span style={{ flexShrink:0, display:'flex', color:'currentColor' }}>{icons.user}</span>Client Portal</div>
          </div>
        </div>
        <div style={S.userRow}>
          <div style={S.uAvatar}>{initials}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'0.8rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.full_name||profile?.email}</div>
            <div style={{ fontSize:'0.7rem', color:'var(--chart-2)' }}>Administrator</div>
          </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <div style={{ color:'var(--muted-foreground)', cursor:'pointer', display:'flex' }} onClick={signOut}><LogOut size={16}/></div>
            </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={S.main}>

        {/* DASHBOARD */}
        {view==='dashboard' && <>
          <div style={S.topbar}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="admin-hamburger" onClick={()=>setSidebarOpen(true)}
                style={{ background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
                <Menu size={18} />
              </button>
              <div style={S.topbarTitle}>Overview</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ color:'var(--muted-foreground)', cursor:'pointer', display:'flex', padding:'0.4375rem 0.625rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)' }} onClick={toggleTheme} title="Toggle theme">{theme==='dark'?<Sun size={14}/>:<Moon size={14}/>}</div>
              <button style={{ ...S.btnGhost, opacity: dashLoading ? 0.6 : 1, cursor: dashLoading ? 'not-allowed' : 'pointer' }} onClick={loadDashboard} disabled={dashLoading}>
                {dashLoading ? <Loader2 size={14} style={{ marginRight:4, animation:'spin 0.8s linear infinite' }} /> : <RefreshCw size={14} style={{ marginRight:4 }} />}
                {dashLoading ? 'Loading…' : 'Refresh'}
              </button>
              <button style={S.btnPrimary} onClick={()=>switchView('ingest')}><Plus size={14} style={{ marginRight:4 }} />Ingest</button>
            </div>
          </div>
          <div className="admin-scroll" style={S.scroll}>
            <div className="admin-stats-grid" style={S.statsGrid}>
              {([
                { label:'Total Conversations', icon:'chat', value: stats.conversations, sub:'All time', info:'Every chat session an end user has ever started with your AI support widget, counted all-time from the public_sessions table. It grows by one each time someone begins a new conversation.' },
                { label:'Open Tickets',        icon:'tickets', value: stats.openTickets,  sub:'Needs attention', red: stats.openTickets > 0, info:'Support tickets currently in "open" status — received but not yet resolved or closed by your team. Each one represents a user question that still needs human action.' },
                { label:'Avg Confidence',      icon:'target', value: stats.avgConf+'%',  sub: stats.avgConf > 65 ? '↑ Above threshold' : '↓ Below threshold', info:'Average confidence score of the AI across your last 200 logged queries. For every answer, the model rates how well its knowledge-base sources match the question on a 0–100% scale; this card shows the mean of those scores. Above 65% is considered healthy — if it drops, ingest more or better content so the AI stops guessing.' },
                { label:'Escalation Rate',     icon:'alert', value: stats.escRate+'%',  sub: stats.escRate < 15 ? '↓ Under control' : '↑ High rate', info:'The share of your last 200 queries that were escalated to a human ticket instead of answered directly — typically because the AI\'s confidence fell below the escalation threshold. Under 15% means the AI resolves most questions on its own.' },
              ] as { label:string; icon:string; value:string|number; sub:string; red?:boolean; info:string }[]).map(s=>(
                <div key={s.label} style={{ ...S.statCard, position:'relative' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={S.statLabel}>{s.label}</span>
                    <span
                      onClick={()=>setStatInfo(statInfo===s.label ? null : s.label)}
                      style={{ flexShrink:0, display:'flex', color:'var(--muted-foreground)', width:18, height:18, cursor:'pointer' }}
                      title={`About ${s.label}`}
                    >{icons[s.icon]}</span>
                  </div>
                  {statInfo===s.label && (
                    <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:'2.9rem', right:'0.75rem', zIndex:60, width:270, maxWidth:'calc(100vw - 3rem)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'0.875rem', boxShadow:'0 10px 30px rgba(0,0,0,0.25)' }}>
                      <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--chart-2)', marginBottom:'0.5rem' }}>{s.label}</div>
                      <div style={{ fontSize:'0.75rem', lineHeight:1.55, color:'var(--muted-foreground)' }}>{s.info}</div>
                    </div>
                  )}
                  <div style={{ ...S.statValue, color: s.red ? 'var(--destructive)' : 'var(--foreground)' }}>{s.value}</div>
                  <div style={{ fontSize:'0.75rem', color: stats.avgConf>65||stats.escRate<15 ? 'var(--chart-1)' : 'var(--muted-foreground)' }}>{s.sub}</div>
                </div>
              ))}
            </div>
            <div style={S.dashGrid}>
              <div style={S.card}>
                <div style={S.cardHeader}><span style={S.cardTitle}>Query Categories</span><Badge variant="blue">Last 200</Badge></div>
                <div style={{ padding:'1.25rem', display:'flex', flexDirection:'column', gap:12 }}>
                  {categories.length === 0 ? <div style={{ color:'var(--muted-foreground)', fontSize:'0.8125rem' }}>No data yet</div> :
                    categories.map(([cat,cnt],i)=>{
                      const max = categories[0][1]
                      return <div key={cat} style={{ display:'flex', alignItems:'center', gap:12, fontSize:'0.8125rem' }}>
                        <span style={{ width:80, color:'var(--muted-foreground)', flexShrink:0 }}>{cat}</span>
                        <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${cnt/max*100}%`, background:catColors[i]||catColors[0], borderRadius:3 }} />
                        </div>
                        <span style={{ width:30, textAlign:'right', color:'var(--muted-foreground)' }}>{cnt}</span>
                      </div>
                    })
                  }
                </div>
              </div>
              <div style={S.card}>
                <div style={S.cardHeader}><span style={S.cardTitle}>AI Confidence Score</span></div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
                  <svg width={120} height={120} viewBox="0 0 120 120">
                    <circle cx={60} cy={60} r={50} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
                    <circle cx={60} cy={60} r={50} fill="none" stroke="url(#adminGrad)" strokeWidth={10}
                      strokeDasharray={314} strokeDashoffset={314 - (314 * stats.avgConf / 100)}
                      strokeLinecap="round" transform="rotate(-90 60 60)" style={{ transition:'stroke-dashoffset 0.8s ease' }} />
                    <defs><linearGradient id="adminGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--chart-2)" /><stop offset="100%" stopColor="var(--primary)" />
                    </linearGradient></defs>
                  </svg>
                  <div style={{ fontFamily:'Inter,sans-serif', fontSize:'1.75rem', fontWeight:700, marginTop:8 }}>{stats.avgConf}%</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>Average confidence</div>
                </div>
              </div>
              <div style={{ ...S.card, gridColumn:'1/-1' }}>
                <div style={S.cardHeader}><span style={S.cardTitle}>Recent Activity</span><button style={S.btnGhost} onClick={()=>switchView('audit')}>View All</button></div>
                <table style={S.table}>
                  <thead><tr>{['User','Query','Category','Confidence','Escalated','Time'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {recentLogs.length === 0
                      ? <tr key="empty"><td colSpan={6} style={{ ...S.td, textAlign:'center', padding:'2rem', color:'var(--muted-foreground)' }}>No activity yet</td></tr>
                      : recentLogs.map(l=>(
                        <tr key={l.id}>
                          <td style={{ ...S.td, color:'var(--foreground)' }}>{l._user?.full_name || l._user?.email || ((l.session_id?.startsWith('pub_') || l.user_id === 'anonymous') ? 'Anonymous' : (l.session_id?.substr(0,8) || '—'))}</td>
                          <td style={S.td}>{l.query?.slice(0,60)}{l.query?.length>60?'…':''}</td>
                          <td style={S.td}>{l.category?<Badge variant={catBadge(l.category)}>{l.category}</Badge>:'—'}</td>
                          <td style={S.td}>{l.confidence!=null?<Badge variant={confBadge(l.confidence)}>{Math.round(l.confidence*100)}%</Badge>:'—'}</td>
                          <td style={S.td}>{l.escalated?<Badge variant="red">Yes</Badge>:<Badge variant="green">No</Badge>}</td>
                          <td style={S.td}>{fmtDate(l.created_at)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>}

        {/* TICKETS */}
        {view==='tickets' && <>
          <div style={S.topbar}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="admin-hamburger" onClick={()=>setSidebarOpen(true)}
                style={{ background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
                <Menu size={18} />
              </button>
              <div style={S.topbarTitle}>Tickets — Admin Only</div>
            </div>
            <button style={S.btnGhost} onClick={loadTickets}><RefreshCw size={14} style={{ marginRight:4 }} />Refresh</button>
          </div>
          <div className="admin-scroll" style={S.scroll}>
            <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.375rem', fontWeight:700, marginBottom:'0.25rem' }}>Support Tickets</h2>
            <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.25rem' }}>Admin-only. Clients cannot view these regardless of access level.</p>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:'1.25rem' }}>
              {['all','open','in_progress','resolved','closed'].map(f=>(
                <button key={f} style={{ ...S.filterBtn, ...(activeFilter===f?S.filterActive:{}) }} onClick={()=>filterTickets(f)}>{f}</button>
              ))}
            </div>
            {filteredTickets.length === 0
              ? <div style={{ color:'var(--muted-foreground)', textAlign:'center', padding:'3rem', fontSize:'0.875rem' }}>No tickets found.</div>
              : filteredTickets.map(t=>(
                <div key={t.id} style={S.tktCard} onClick={()=>openTicket(t)}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                    <span style={{ fontFamily:'monospace', fontSize:'0.7rem', color:'var(--muted-foreground)' }}>#{ticketCodes[t.id] || t.id.substr(0,8)}</span>
                    <span style={{ fontWeight:600, fontSize:'0.875rem', flex:1 }}>{t.title}</span>
                    <Badge variant={statusBadge(t.status)}>{t.status}</Badge>
                    <Badge variant={priorityBadge(t.priority)}>{t.priority||'medium'}</Badge>
                  </div>
                  <div style={{ fontSize:'0.8125rem', color:'var(--muted-foreground)', lineHeight:1.55, marginBottom:10 }}>{t.description?.slice(0,180)}{t.description?.length>180?'…':''}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    <span style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{fmtDate(t.created_at)}</span>
                    <span style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{t.assigned_team||'unassigned'}</span>
                    <div style={{ display:'flex', gap:8, marginLeft:'auto' }} onClick={e=>e.stopPropagation()}>
                      {t.status!=='in_progress' && <button style={S.btnGhost} onClick={()=>updateTicketStatus(t.id,'in_progress')}>Start</button>}
                      {t.status!=='resolved'    && <button style={S.btnSuccess} onClick={()=>updateTicketStatus(t.id,'resolved')}>Resolve</button>}
                      {t.status!=='closed'      && <button style={S.btnDanger}  onClick={()=>updateTicketStatus(t.id,'closed')}>Close</button>}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>}

        {/* ESCALATIONS */}
        {view==='escalations' && <>
          <div style={S.topbar}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="admin-hamburger" onClick={()=>setSidebarOpen(true)}
                style={{ background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
                <Menu size={18} />
              </button>
              <div style={S.topbarTitle}>Escalations</div>
            </div>
          </div>
          <div className="admin-scroll" style={S.scroll}>
            <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.375rem', fontWeight:700, marginBottom:'0.25rem' }}>Escalation Log</h2>
            <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>System-triggered and user-requested escalations.</p>
            <div style={S.card}>
              <table style={S.table}>
                <thead><tr>{['Ticket ID','Reason','Triggered By','Confidence','Routed To','Time'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {escalations.length===0
                    ? <tr key="empty-escalations"><td colSpan={6} style={{ ...S.td, textAlign:'center', padding:'2rem', color:'var(--muted-foreground)' }}>No escalations yet</td></tr>
                    : escalations.slice((escPage-1)*ESC_PAGE_SIZE, escPage*ESC_PAGE_SIZE).map(e=>(
                      <tr key={e.id} onClick={()=>openEscalation(e)} style={{ cursor:'pointer', transition:'background 0.15s' }} onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.03)'} onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background=''}>
                        <td style={{ ...S.td, fontFamily:'monospace', fontSize:'0.75rem', color:'var(--foreground)' }}>{e.ticket_id ? (ticketCodes[e.ticket_id] || e.ticket_id.substr(0,8)+'…') : <span style={{ color:'var(--muted-foreground)', fontStyle:'italic' }}>Pending</span>}</td>
                        <td style={S.td}><Badge variant={e.reason==='low_confidence'?'yellow':'red'}>{e.reason||'—'}</Badge>{e.client_reason && <div style={{ fontSize:'0.7rem', color:'var(--destructive)', marginTop:4 }}>{e.client_reason}</div>}</td>
                        <td style={S.td}>
                          <div style={{ display:'inline-flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                            <Badge variant={e.reason==='user_requested' ? 'purple' : 'blue'}>{e.reason==='user_requested' ? 'client' : (e.triggered_by||'—')}</Badge>
                            {e._client && <div style={{ fontSize:'0.7rem', color:'var(--muted-foreground)' }}>({e._client})</div>}
                          </div>
                        </td>
                        <td style={S.td}>{e.confidence_at_trigger!=null?Math.round(e.confidence_at_trigger*100)+'%':'—'}</td>
                        <td style={S.td}>{e.routed_to||'—'}</td>
                        <td style={S.td}>{fmtDate(e.created_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const totalPages = Math.max(1, Math.ceil(escalations.length / ESC_PAGE_SIZE))
              return (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'1rem', flexWrap:'wrap', gap:8 }}>
                  <span style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>
                    {escalations.length} escalation{escalations.length===1?'':'s'} · page {escPage} of {totalPages}
                  </span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>setEscPage(p=>Math.max(1,p-1))} disabled={escPage<=1}
                      style={{ padding:'0.4375rem 0.875rem', fontSize:'0.75rem', fontWeight:600, fontFamily:'Inter,sans-serif', borderRadius:8, cursor: escPage<=1?'not-allowed':'pointer', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color: escPage<=1?'var(--muted-foreground)':'var(--foreground)', opacity: escPage<=1?0.5:1 }}>
                      ← Prev
                    </button>
                    <button onClick={()=>setEscPage(p=>Math.min(totalPages,p+1))} disabled={escPage>=totalPages}
                      style={{ padding:'0.4375rem 0.875rem', fontSize:'0.75rem', fontWeight:600, fontFamily:'Inter,sans-serif', borderRadius:8, cursor: escPage>=totalPages?'not-allowed':'pointer', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color: escPage>=totalPages?'var(--muted-foreground)':'var(--foreground)', opacity: escPage>=totalPages?0.5:1 }}>
                      Next →
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </>}

        {/* PRODUCTS */}
        {view==='products' && <>
          <div style={S.topbar}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="admin-hamburger" onClick={()=>setSidebarOpen(true)}
                style={{ background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
                <Menu size={18} />
              </button>
              <div style={S.topbarTitle}>Products</div>
            </div>
            <button style={S.btnPrimary} onClick={()=>setShowCreateProduct(true)}><Plus size={14} style={{ marginRight:4 }} />Create Product</button>
          </div>
          <div className="admin-scroll" style={S.scroll}>
            <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.375rem', fontWeight:700, marginBottom:'0.25rem' }}>Product Management</h2>
            <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>Each product has its own isolated knowledge base.</p>
            <div className="admin-prod-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'1rem' }}>
              {products.map(p=>(
                <div key={p.id} style={S.prodCard}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
                    <div style={{ width:40, height:40, borderRadius:8, background:'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(139,92,246,0.2))', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--primary)' }}><Package size={20} /></div>
                    <Badge variant={p.is_active?'green':'gray'}>{p.is_active?'Active':'Inactive'}</Badge>
                  </div>
                  <div style={{ fontFamily:'Inter,sans-serif', fontSize:'1rem', fontWeight:600, marginBottom:4 }}>{p.name}</div>
                  <div style={{ fontFamily:'monospace', fontSize:'0.7rem', color:'var(--muted-foreground)', marginBottom:'0.25rem' }}>/{p.slug}</div>
                  <div style={{ fontSize:'0.7rem', color:'var(--muted-foreground)', marginBottom:'1rem' }}>Created by {p.creator?.full_name || p.creator?.email || '—'}</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button style={S.btnGhost} onClick={()=>switchView('ingest')}><Plus size={14} style={{ marginRight:4 }} />Add Docs</button>
                    <Link href={`/admin/products/${p.id}`} style={{ ...S.btnGhost, textDecoration:'none' }}>Workflows</Link>
                    <button style={S.btnDanger} onClick={()=>toggleProduct(p.id,!p.is_active)}>{p.is_active?'Deactivate':'Activate'}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* INGEST */}
        {view==='ingest' && <>
          <div style={S.topbar}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="admin-hamburger" onClick={()=>setSidebarOpen(true)}
                style={{ background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
                <Menu size={18} />
              </button>
              <div style={S.topbarTitle}>Knowledge Base Ingestion</div>
            </div>
          </div>
          <div className="admin-scroll" style={S.scroll}>
            <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.375rem', fontWeight:700, marginBottom:'0.25rem' }}>Ingest Documents</h2>
            <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>Add content from a URL, paste text, or upload a PDF/DOCX file. n8n chunks, embeds, and stores in pgvector.</p>
            <div style={S.ingestForm}>

              {/* Toast */}
              {ingestToast && (
                <div style={{
                  marginBottom:'1rem', padding:'0.75rem 1rem', borderRadius:10,
                  fontSize:'0.8125rem', fontWeight:600,
                  background: ingestToast.type==='success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${ingestToast.type==='success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  color: ingestToast.type==='success' ? 'var(--chart-1)' : 'var(--destructive)',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                }}>
                  <span style={{ display:'flex', alignItems:'center', gap:6 }}>{ingestToast.type==='success' ? <><Check size={14} />{ingestToast.msg}</> : <><X size={14} />{ingestToast.msg}</>}</span>
                  <span style={{ cursor:'pointer', opacity:0.6, display:'flex' }} onClick={()=>setIngestToast(null)}><X size={14} /></span>
                </div>
              )}

              {/* Error banner */}
              {ingestError && (
                <div style={{
                  marginBottom:'1rem', padding:'0.625rem 1rem', borderRadius:10,
                  fontSize:'0.8125rem', background:'rgba(239,68,68,0.08)',
                  border:'1px solid rgba(239,68,68,0.2)', color:'var(--destructive)',
                }}>
                  {ingestError}
                </div>
              )}

              {/* Target Product + Document Type */}
              <div className="admin-form-row" style={S.formRow}>
                <div>
                  <label style={S.fLabel}>Target Product *</label>
                  <select style={S.fSelect} value={ingestProduct} onChange={e=>setIngestProduct(e.target.value)}>
                    <option value="" style={{ background:'var(--card)', color:'var(--muted-foreground)' }}>Select a product…</option>
                    <option value="__public__" style={{ background:'var(--card)', color:'var(--foreground)' }}>Public Knowledge Base</option>
                    {products.map(p=><option key={p.id} value={p.id} style={{ background:'var(--card)', color:'var(--foreground)' }}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.fLabel}>Document Type</label>
                  <select style={S.fSelect} value={ingestType} onChange={e=>setIngestType(e.target.value)}>
                    {[['faq','FAQ'],['sop','SOP / Process Guide'],['doc','Product Documentation'],['ticket_resolution','Resolved Ticket']].map(([v,l])=><option key={v} value={v} style={{ background:'var(--card)', color:'var(--foreground)' }}>{l}</option>)}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={S.fLabel}>Document Title *</label>
                <input type="text" style={S.fInput} value={ingestTitle} onChange={e=>setIngestTitle(e.target.value)} placeholder="e.g. Getting Started Guide" />
              </div>

              {/* Content Type Tabs */}
              <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1.25rem', flexWrap:'wrap' }}>
                {([
                  ['url','🔗 URL','Fetch a web page'],
                  ['text','📝 Text','Paste raw text'],
                  ['pdf','📄 PDF','Upload a PDF file'],
                  ['docx','📘 Word Doc','Upload a .docx file'],
                ] as const).map(([val, label, desc]) => (
                  <button key={val} style={{
                    ...S.filterBtn,
                    ...(ingestContentType===val ? S.filterActive : {}),
                    padding:'0.5rem 0.875rem',
                    textAlign:'left',
                    flex:1, minWidth:120,
                  }} onClick={()=>{ setIngestContentType(val); setIngestFile(null); setIngestError('') }}>
                    <div style={{ fontSize:'0.8125rem', fontWeight:600 }}>{label}</div>
                    <div style={{ fontSize:'0.6875rem', opacity:0.7, marginTop:2 }}>{desc}</div>
                  </button>
                ))}
              </div>

              {/* URL Input */}
              {ingestContentType==='url' && (
                <div>
                  <label style={S.fLabel}>Page URL *</label>
                  <input type="url" style={S.fInput} value={ingestUrl} onChange={e=>setIngestUrl(e.target.value)} placeholder="https://example.com/page" />
                  {ingestUrl.trim() && validateIngestUrl(ingestUrl.trim()) && (
                      <div style={{ fontSize:'0.75rem', color:'var(--chart-1)', marginTop:-8, marginBottom:12, display:'flex', alignItems:'center', gap:4 }}>
                        <CheckCircle2 size={12} />
                        Valid URL detected — n8n will fetch and extract content
                      </div>
                  )}
                  {ingestUrl.trim() && !validateIngestUrl(ingestUrl.trim()) && (
                    <div style={{ fontSize:'0.75rem', color:'var(--destructive)', marginTop:-8, marginBottom:12 }}>
                      Invalid URL — must start with http:// or https://
                    </div>
                  )}
                </div>
              )}

              {/* Text Input */}
              {ingestContentType==='text' && (
                <div>
                  <label style={S.fLabel}>Document Content *</label>
                  <textarea style={S.fTextarea} value={ingestContent} onChange={e=>{setIngestContent(e.target.value);setCharCount(e.target.value.length)}} placeholder="Paste the full document content here. n8n will chunk it into 800-character segments." />
                  <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)', marginTop:6 }}>{charCount} characters</div>
                </div>
              )}

              {/* PDF / DOCX File Input */}
              {(ingestContentType==='pdf' || ingestContentType==='docx') && (
                <div>
                  <label style={S.fLabel}>Upload {ingestContentType==='pdf' ? 'PDF' : 'Word Document'} *</label>
                  <div style={{
                    background:'rgba(255,255,255,0.03)', border:'1px dashed rgba(255,255,255,0.15)',
                    borderRadius:12, padding:'2rem 1.5rem', textAlign:'center', cursor:'pointer',
                  }}
                    onClick={() => document.getElementById('ingest-file-input')?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setIngestFile(f); setIngestError('') } }}
                  >
                    {ingestFile ? (
                      <div>
                        {ingestContentType==='pdf'
                          ? <File size={32} color="var(--primary)" style={{ marginBottom:8 }} />
                          : <FileText size={32} color="var(--primary)" style={{ marginBottom:8 }} />}
                        <div style={{ fontSize:'0.875rem', fontWeight:600, marginBottom:4 }}>{ingestFile.name}</div>
                        <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>
                          {(ingestFile.size / 1024).toFixed(1)} KB · {ingestContentType.toUpperCase()}
                        </div>
                        <button style={{ ...S.btnGhost, marginTop:8 }} onClick={(e) => { e.stopPropagation(); setIngestFile(null) }}>Remove</button>
                      </div>
                    ) : (
                      <div>
                        <CloudUpload size={40} color="var(--muted-foreground)" style={{ marginBottom:12 }} />
                        <div style={{ fontSize:'0.875rem', color:'var(--muted-foreground)', marginBottom:4 }}>Drop a file here or click to browse</div>
                        <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>
                          {ingestContentType==='pdf' ? 'PDF files only' : '.docx files only'} — max 10 MB
                        </div>
                      </div>
                    )}
                  </div>
                  <input id="ingest-file-input" type="file"
                    accept={ingestContentType==='pdf' ? '.pdf' : '.docx'}
                    style={{ display:'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setIngestFile(f); setIngestError('') } }}
                  />
                </div>
              )}

              {/* Preview Summary */}
              {((ingestContentType==='url' && ingestUrl.trim() && validateIngestUrl(ingestUrl.trim())) ||
                (ingestContentType==='text' && ingestContent.trim()) ||
                (ingestFile && (ingestContentType==='pdf' || ingestContentType==='docx'))) && (
                <div style={{
                  marginTop:'0.75rem', marginBottom:'0.75rem',
                  padding:'0.625rem 0.875rem', borderRadius:10,
                  background:'rgba(139,92,246,0.06)', border:'1px solid rgba(139,92,246,0.12)',
                  fontSize:'0.75rem', color:'var(--muted-foreground)',
                }}>
                  <strong style={{ color:'var(--foreground)' }}>Ready to submit:</strong>{' '}
                  {ingestContentType==='url' && <span>{ingestUrl.trim()}</span>}
                  {ingestContentType==='text' && <span>{ingestContent.trim().length.toLocaleString()} characters of text</span>}
                  {ingestFile && <span>{ingestFile.name} ({(ingestFile.size / 1024).toFixed(1)} KB)</span>}
                </div>
              )}

              {/* Submit Button */}
              <button
                style={{
                  ...S.btnPrimary, padding:'0.75rem 1.5rem', fontSize:'0.875rem', marginTop:'0.5rem',
                  opacity: ingestLoading ? 0.6 : 1, cursor: ingestLoading ? 'not-allowed' : 'pointer',
                  display:'inline-flex', alignItems:'center', gap:8,
                }}
                onClick={ingestDocument}
                disabled={ingestLoading}
              >
                {ingestLoading && (
                  <Loader2 size={14} style={{ animation:'spin 0.7s linear infinite' }} />
                )}
                {ingestLoading
                  ? 'Processing…'
                  : ingestContentType==='url'
                    ? 'Fetch & Ingest URL'
                    : ingestContentType==='text'
                      ? 'Ingest & Embed Text'
                      : `Upload & Process ${ingestContentType==='pdf' ? 'PDF' : 'DOCX'}`
                }
              </button>

              {/* Progress Bar */}
              {ingestProgress > 0 && (
                <div style={{ marginTop:'1rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'1rem' }}>
                  <div style={{ fontSize:'0.875rem', fontWeight:600, marginBottom:6 }}>{ingestStatus}</div>
                  <div style={S.progBar}><div style={{ ...S.progFill, width:`${ingestProgress}%` }} /></div>
                </div>
              )}
            </div>

            {/* Recent KB Documents Table */}
            <div style={{ marginTop:'2rem' }}>
              <div style={S.card}>
                <div style={S.cardHeader}><span style={S.cardTitle}>Recent KB Documents</span></div>
                <table style={S.table}>
                  <thead><tr>{['Title','Product','Type','Status','Added'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {kbDocs.length===0
                      ? <tr key="empty-docs"><td colSpan={5} style={{ ...S.td, textAlign:'center', padding:'2rem', color:'var(--muted-foreground)' }}>No documents yet</td></tr>
                      : kbDocs.map((d,i)=>(
                        <tr key={i}>
                          <td style={{ ...S.td, color:'var(--foreground)' }}>{d.title||'—'}</td>
                          <td style={S.td}>{d._public ? <Badge variant="cyan">Public KB</Badge> : (d.products?.name||'—')}</td>
                          <td style={S.td}><Badge variant="blue">{d.source_type||'—'}</Badge></td>
                          <td style={S.td}><Badge variant={d.status==='active'?'green':'gray'}>{d.status}</Badge></td>
                          <td style={S.td}>{fmtDate(d.created_at)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>}

        {/* AUDIT */}
        {view==='audit' && <>
          <div style={S.topbar}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="admin-hamburger" onClick={()=>setSidebarOpen(true)}
                style={{ background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
                <Menu size={18} />
              </button>
              <div style={S.topbarTitle}>Audit Logs</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ display:'inline-flex', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, overflow:'hidden' }}>
                <button onClick={()=>{ if(auditArchived){ setAuditArchived(false); setAuditPage(1); loadAuditLogs(1,false) } }}
                  style={{ padding:'0.4375rem 0.75rem', fontSize:'0.75rem', fontWeight:600, fontFamily:'Inter,sans-serif', cursor:'pointer', border:'none', background: auditArchived ? 'transparent' : 'rgba(139,92,246,0.15)', color: auditArchived ? 'var(--muted-foreground)' : 'var(--chart-2)' }}>
                  Active
                </button>
                <button onClick={toggleAuditArchive}
                  style={{ padding:'0.4375rem 0.75rem', fontSize:'0.75rem', fontWeight:600, fontFamily:'Inter,sans-serif', cursor:'pointer', border:'none', borderLeft:'1px solid rgba(255,255,255,0.08)', background: auditArchived ? 'rgba(139,92,246,0.15)' : 'transparent', color: auditArchived ? 'var(--chart-2)' : 'var(--muted-foreground)' }}>
                  Archive
                </button>
              </div>
              <button style={S.btnGhost} onClick={()=>loadAuditLogs()}><RefreshCw size={14} style={{ marginRight:4 }} />Refresh</button>
            </div>
          </div>
          <div className="admin-scroll" style={S.scroll}>
            <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.375rem', fontWeight:700, marginBottom:'0.25rem' }}>{auditArchived ? 'Archived Logs' : 'Full Audit Trail'}</h2>
            <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>
              {auditArchived
                ? `Logs older than ${AUDIT_ARCHIVE_DAYS} days, kept for reference.`
                : `Every interaction, PII-redacted. Query, response, confidence, category, sentiment, escalation status. Logs move to Archive after ${AUDIT_ARCHIVE_DAYS} days.`}
            </p>
            <div style={S.card}>
              <table style={S.table}>
                <thead><tr>{['User','Query','Category','Confidence','Sentiment','Escalated','Time'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {auditLogs.length===0
                    ? <tr key="empty-logs"><td colSpan={7} style={{ ...S.td, textAlign:'center', padding:'2rem', color:'var(--muted-foreground)' }}>No logs yet</td></tr>
                    : auditLogs.map(l=>(
                      <tr key={l.id}>
                        <td style={{ ...S.td, color:'var(--foreground)' }}>{l._user?.full_name || l._user?.email || (l.user_id === 'anonymous' ? 'Anonymous' : (l.user_id?.substr(0,8) || '—'))}</td>
                        <td style={S.td}>{l.query?.slice(0,60)}{l.query?.length>60?'…':''}</td>
                        <td style={S.td}>{l.category?<Badge variant={catBadge(l.category)}>{l.category}</Badge>:'—'}</td>
                        <td style={S.td}>{l.confidence!=null?<Badge variant={confBadge(l.confidence)}>{Math.round(l.confidence*100)}%</Badge>:'—'}</td>
                        <td style={S.td}>{l.sentiment||'—'}</td>
                        <td style={S.td}>{l.escalated?<Badge variant="red">Yes</Badge>:<Badge variant="green">No</Badge>}</td>
                        <td style={S.td}>{fmtDate(l.created_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const totalPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE))
              return (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'1rem', flexWrap:'wrap', gap:8 }}>
                  <span style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>
                    {auditTotal} log{auditTotal===1?'':'s'} · page {auditPage} of {totalPages}
                  </span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>gotoAuditPage(auditPage-1)} disabled={auditPage<=1}
                      style={{ padding:'0.4375rem 0.875rem', fontSize:'0.75rem', fontWeight:600, fontFamily:'Inter,sans-serif', borderRadius:8, cursor: auditPage<=1?'not-allowed':'pointer', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color: auditPage<=1?'var(--muted-foreground)':'var(--foreground)', opacity: auditPage<=1?0.5:1 }}>
                      ← Prev
                    </button>
                    <button onClick={()=>gotoAuditPage(auditPage+1)} disabled={auditPage>=totalPages}
                      style={{ padding:'0.4375rem 0.875rem', fontSize:'0.75rem', fontWeight:600, fontFamily:'Inter,sans-serif', borderRadius:8, cursor: auditPage>=totalPages?'not-allowed':'pointer', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color: auditPage>=totalPages?'var(--muted-foreground)':'var(--foreground)', opacity: auditPage>=totalPages?0.5:1 }}>
                      Next →
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </>}

        {/* USERS */}
        {view==='users' && <>
          <div style={S.topbar}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="admin-hamburger" onClick={()=>setSidebarOpen(true)}
                style={{ background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
                <Menu size={18} />
              </button>
              <div style={S.topbarTitle}>Client Users</div>
            </div>
          </div>
          <div className="admin-scroll" style={S.scroll}>
            <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.375rem', fontWeight:700, marginBottom:'0.25rem' }}>Client Management</h2>
            <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>Assign clients to products. Each client&apos;s RAG is scoped to their assigned product only.</p>
            <div style={S.card}>
              <table style={S.table}>
                <thead><tr>{['Name','Email','Product','Role','Created','Assign Product'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {users.length===0
                    ? <tr key="empty-users"><td colSpan={6} style={{ ...S.td, textAlign:'center', padding:'2rem', color:'var(--muted-foreground)' }}>No users yet</td></tr>
                    : users.map(u=>(
                      <tr key={u.id}>
                        <td style={{ ...S.td, color:'var(--foreground)' }}>{u.full_name||'—'}</td>
                        <td style={S.td}>{u.email||'—'}</td>
                        <td style={S.td}>{u.products?.name||<span style={{color:'var(--muted-foreground)'}}>Unassigned</span>}</td>
                        <td style={S.td}><Badge variant={u.is_admin?'purple':'blue'}>{u.role||'client'}</Badge></td>
                        <td style={S.td}>{fmtDate(u.created_at)}</td>
                        <td style={S.td}>
                          <select style={{ padding:'0.25rem 0.5rem', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:6, color:'var(--foreground)', fontSize:'0.75rem', cursor:'pointer' }} defaultValue={u.product_id||''} onChange={e=>assignProduct(u.id,e.target.value)}>
                            <option value="" style={{ background:'var(--card)', color:'var(--muted-foreground)' }}>No product</option>
                            {products.map(p=><option key={p.id} value={p.id} style={{ background:'var(--card)', color:'var(--foreground)' }}>{p.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* ERRORS */}
        {view==='errors' && <>
          <div style={S.topbar}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="admin-hamburger" onClick={()=>setSidebarOpen(true)}
                style={{ background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
                <Menu size={18} />
              </button>
              <div style={S.topbarTitle}>Workflow Errors</div>
            </div>
            <button style={S.btnGhost} onClick={loadErrors}><RefreshCw size={14} style={{ marginRight:4 }} />Refresh</button>
          </div>
          <div className="admin-scroll" style={S.scroll}>
            <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.375rem', fontWeight:700, marginBottom:'0.25rem' }}>Workflow Error Log</h2>
            <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>AI-diagnosed errors from n8n workflow executions, linked to the client and product that triggered them.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              {workflowErrors.length===0 && (
                <div style={{ ...S.card, padding:'2rem', textAlign:'center', color:'var(--muted-foreground)' }}>No errors recorded yet</div>
              )}
              {workflowErrors.map(e=>{
                const isOpen = expandedError === e.id
                return (
                  <div key={e.id} style={{ ...S.card, cursor:'pointer', transition:'all 0.2s ease' }} onClick={()=>setExpandedError(isOpen?null:e.id)}>
                    <div style={{ padding:'1rem 1.25rem', display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' }}>
                      <div style={{ flex:'1 1 200px', minWidth:0 }}>
                        <div style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--foreground)' }}>{e.workflow_name||'—'}</div>
                        <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{e.failed_node||'—'}</div>
                      </div>
                      <div style={{ flex:'0 0 auto', fontSize:'0.75rem' }}>
                        <div>{e.client_name}</div>
                        <div style={{ color:'var(--muted-foreground)', fontSize:'0.7rem' }}>{e.client_email}</div>
                      </div>
                      <div style={{ flex:'0 0 auto' }}>{e.product_name}</div>
                      <div style={{ flex:'0 0 auto' }}>{e.severity ? <Badge variant={severityBadge(e.severity)}>{e.severity}</Badge> : '—'}</div>
                      <div style={{ flex:'0 0 auto' }}>{e.resolved ? <Badge variant="green">Resolved</Badge> : <Badge variant="red">Open</Badge>}</div>
                      {!e.resolved && (
                        <button
                          onClick={ev => { ev.stopPropagation(); runResolutionCheck(e) }}
                          disabled={checkingId === e.id}
                          style={{ ...S.btnGhost, flexShrink:0 }}
                        >
                          {checkingId === e.id
                            ? <Loader2 size={14} style={{ animation:'rotate 1s linear infinite' }} />
                            : <RefreshCw size={14} />}
                          {checkingId === e.id ? 'Checking…' : 'Check Resolution'}
                        </button>
                      )}
                      <div style={{ flex:'0 0 auto', fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{fmtDate(e.created_at)}</div>
                      <div style={{ flex:'0 0 auto', fontSize:'0.75rem', color:'var(--muted-foreground)', transition:'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', display:'flex' }}><ChevronDown size={14} /></div>
                    </div>
                    {isOpen && (
                      <div style={{ padding:'0 1.25rem 1.25rem', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ marginTop:'1rem' }}>
                          <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Error</div>
                          <div style={{ fontSize:'0.8125rem', color:'var(--destructive)', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{e.error_message}</div>
                        </div>
                        {e.ai_diagnosis && <div style={{ marginTop:'0.875rem' }}>
                          <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>AI Diagnosis</div>
                          <div style={{ fontSize:'0.8125rem', color:'var(--foreground)', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{e.ai_diagnosis}</div>
                        </div>}
                        {e.ai_fix && <div style={{ marginTop:'0.875rem' }}>
                          <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Suggested Fix</div>
                          <div style={{ fontSize:'0.8125rem', color:'var(--foreground)', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{e.ai_fix}</div>
                        </div>}
                        {e.error_stack && <div style={{ marginTop:'0.875rem' }}>
                          <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Stack Trace</div>
                          <pre style={{ fontSize:'0.75rem', color:'var(--muted-foreground)', background:'rgba(255,255,255,0.03)', padding:'0.75rem', borderRadius:8, overflow:'auto', whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0 }}>{e.error_stack}</pre>
                        </div>}
                        {(checkStatus[e.id] || e.ai_resolution_diagnosis) && <div style={{ marginTop:'0.875rem' }}>
                          <div style={{ fontSize:'0.7rem', fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Resolution Check</div>
                          <div style={{ fontSize:'0.8125rem', color:'var(--foreground)', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{checkStatus[e.id] || e.ai_resolution_diagnosis}</div>
                          {Number(e.replay_attempts) > 0 && (
                            <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)', marginTop:6 }}>Replay attempts: {e.replay_attempts}{e.last_checked_at ? ` · Last checked ${fmtDate(e.last_checked_at)}` : ''}</div>
                          )}
                        </div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>}

      </div>
    </div>
    </>
  )
}
