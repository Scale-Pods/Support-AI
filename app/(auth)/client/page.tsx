'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import BgOrbs from '@/components/BgOrbs'
import Badge, { catBadge, confBadge } from '@/components/Badge'
import { createClient } from '@/lib/supabase'
import { N8N_BASE } from '@/lib/supabase'
import type { ChatResponse, Session, Workflow } from '@/lib/types'
import { MessageSquare, Clock, Star, Home, Sun, Moon, LogOut, Bot, User, AlertTriangle, FolderOpen, Bug, Key, CreditCard, BookOpen, Zap, ThumbsUp, ThumbsDown, Send, Paperclip, FileText, X, Headphones, Menu } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

type View = 'chat' | 'history' | 'feedback'

interface FileAttach { name: string; type: string; data: string; url?: string }
interface Msg { id: string; role: 'user'|'ai'|'agent'; text: string; time: string; confidence?: number; category?: string; escalated?: boolean; files?: FileAttach[] }
interface DbMessageRow {
  id: string
  sender: string
  content: string | null
  created_at: string | null
  confidence: number | null
  category: string | null
  should_escalate: string | boolean | null
  files: FileAttach[] | null
}

function getTime() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

const FORBIDDEN_CHAT_RE = /\bclient[- ]?(?:portal|chat)\b/gi
const CHAT_INTERNAL_INDICATOR = /\b(?:client[- ]?(?:portal|chat)|portal chat|chat webhook|webhook[- ]based|support chat|chat workflow)\b/i
const CHAT_INTERNAL_DETAIL = /\b(?:pii|supabase|auth token|access token|product[- ]scoped|vector search|escalat\w*|llm|large language model|classif\w*|redact\w*|sentiment|confidence|jwt)\b/i

function sanitizeReply(text: string): string {
  if (!text) return text
  const kept = text
    .split('\n')
    .filter(line => {
      if (/^\s*(?:[-*+]\s+|\d+[.)]\s+|\**\s*)?client[- ]?(?:portal|chat)\b/i.test(line)) return false
      if (CHAT_INTERNAL_INDICATOR.test(line) && CHAT_INTERNAL_DETAIL.test(line)) return false
      return true
    })
    .join('\n')
  const out = kept
    .replace(/\bthe\s+client[- ]?(?:portal|chat)\b/gi, 'the support chat')
    .replace(FORBIDDEN_CHAT_RE, 'the support chat')
    .replace(/chat\s+chat\b/gi, 'chat')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out || "I couldn't find a clear answer — try asking about your HR workflows."
}

// ─── STYLES ──────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page:   { display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative', background:'var(--background)' },
  // AUTH
  formLabel: { display:'block', fontSize:'0.8125rem', fontWeight:500, marginBottom:'0.5rem', color:'var(--muted-foreground)' },
  // SIDEBAR
  sidebar:   { width:260, flexShrink:0, height:'100vh', background:'rgba(255,255,255,0.015)', borderRight:'1px solid rgba(255,255,255,0.06)', display:'flex', flexDirection:'column', padding:'1.5rem 1rem', position:'relative', zIndex:10 },
  sidebarLogo: { fontFamily:'Inter,sans-serif', fontSize:'1.125rem', fontWeight:700, background:'linear-gradient(135deg,var(--primary),var(--chart-2))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', display:'flex', alignItems:'center', gap:8, padding:'0 0.5rem', marginBottom:'2rem' },
  logoDot:   { width:8, height:8, borderRadius:'50%', background:'var(--primary)', boxShadow:'0 0 12px rgba(96,165,250,0.5)', flexShrink:0, WebkitTextFillColor:'initial' },
  sectionLabel: { fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted-foreground)', padding:'0 0.5rem', marginBottom:'0.75rem' },
  navItem:   { display:'flex', alignItems:'center', gap:12, padding:'0.625rem 0.75rem', borderRadius:8, fontSize:'0.875rem', fontWeight:500, color:'var(--muted-foreground)', cursor:'pointer', border:'1px solid transparent', transition:'all 0.2s ease', textDecoration:'none', marginBottom:2 },
  navActive: { background:'rgba(96,165,250,0.08)', border:'1px solid rgba(96,165,250,0.15)', color:'var(--primary)' },
  productBox: { margin:'0 0 2rem', padding:'0.75rem', background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12 },
  userRow:   { marginTop:'auto', display:'flex', alignItems:'center', gap:12, padding:'0.75rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12 },
  avatar:    { width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,var(--primary),var(--chart-2))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', fontWeight:700, flexShrink:0, color:'#fff' },
  // MAIN
  main:      { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', zIndex:1 },
  topbar:    { height:60, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.75rem', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.008)' },
  topbarTitle: { fontFamily:'Inter,sans-serif', fontSize:'1rem', fontWeight:600, color:'var(--foreground)' },
  btnGhost:  { display:'inline-flex', alignItems:'center', gap:6, padding:'0.4375rem 1rem', borderRadius:8, fontSize:'0.8125rem', fontWeight:600, cursor:'pointer', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'var(--muted-foreground)', fontFamily:'Inter,sans-serif', transition:'all 0.2s ease' },
  btnPrimary:{ display:'inline-flex', alignItems:'center', gap:6, padding:'0.5rem 1rem', borderRadius:8, fontSize:'0.8125rem', fontWeight:600, cursor:'pointer', border:'none', background:'linear-gradient(135deg,var(--primary),var(--chart-2))', color:'#fff', fontFamily:'Inter,sans-serif', boxShadow:'0 4px 14px rgba(96,165,250,0.25)', transition:'all 0.2s ease' },
  btnDanger: { display:'inline-flex', alignItems:'center', gap:6, padding:'0.4375rem 1rem', borderRadius:8, fontSize:'0.8125rem', fontWeight:600, cursor:'pointer', border:'1px solid rgba(239,68,68,0.2)', background:'rgba(239,68,68,0.08)', color:'var(--destructive)', fontFamily:'Inter,sans-serif' },
  // CHAT
  banner:    { padding:'0.75rem 1.5rem', background:'rgba(96,165,250,0.06)', borderBottom:'1px solid rgba(96,165,250,0.15)', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.8125rem' },
  chatMsgs:  { flex:1, overflowY:'auto', padding:'2rem 1.5rem', display:'flex', flexDirection:'column', gap:'1.25rem' },
  msgAi:     { display:'flex', gap:14, maxWidth:'80%', alignSelf:'flex-start', animation:'fadeIn 0.3s ease' },
  msgAgent:  { display:'flex', gap:14, maxWidth:'80%', alignSelf:'flex-start', animation:'fadeIn 0.3s ease' },
  msgUser:   { display:'flex', gap:14, maxWidth:'80%', alignSelf:'flex-end', flexDirection:'row-reverse', animation:'fadeIn 0.3s ease' },
  msgAvatar: { width:34, height:34, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.875rem' },
  bubbleAi:  { padding:'0.875rem 1.125rem', borderRadius:12, fontSize:'0.875rem', lineHeight:1.7, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderBottomLeftRadius:4 },
  bubbleAgent:{ padding:'0.875rem 1.125rem', borderRadius:12, fontSize:'0.875rem', lineHeight:1.7, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', borderBottomLeftRadius:4 },
  bubbleUser:{ padding:'0.875rem 1.125rem', borderRadius:12, fontSize:'0.875rem', lineHeight:1.7, background:'linear-gradient(135deg,var(--primary),var(--chart-2))', borderBottomRightRadius:4 },
  msgMeta:   { display:'flex', alignItems:'center', gap:12, fontSize:'0.7rem', color:'var(--muted-foreground)', marginTop:6 },
  escalNote: { padding:'0.875rem 1.125rem', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, fontSize:'0.8125rem', color:'var(--destructive)', marginTop:6 },
  workflowBar: { padding:'0.625rem 1.5rem', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.012)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontSize:'0.75rem' },
  workflowChip: { display:'inline-flex', alignItems:'center', gap:6, padding:'0.25rem 0.625rem', borderRadius:100, background:'rgba(96,165,250,0.08)', border:'1px solid rgba(96,165,250,0.18)', color:'var(--primary)', fontSize:'0.7rem', fontWeight:500, whiteSpace:'nowrap' },
  workflowMore: { color:'var(--muted-foreground)', fontSize:'0.7rem' },
  inputArea: { padding:'1rem 1.5rem 1.5rem', borderTop:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.01)' },
  chips:     { display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 },
  chip:      { padding:'0.3125rem 0.75rem', borderRadius:100, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', fontSize:'0.75rem', color:'var(--muted-foreground)', cursor:'pointer' },
  inputRow:  { display:'flex', gap:12, alignItems:'flex-end' },
  msgInput:  { flex:1, padding:'0.875rem 1rem', minHeight:48, maxHeight:140, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.9rem', resize:'none', outline:'none' },
  sendBtn:   { width:48, height:48, borderRadius:8, border:'none', cursor:'pointer', background:'linear-gradient(135deg,var(--primary),var(--chart-2))', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 16px rgba(59,130,246,0.25)', flexShrink:0 },
  escalBtn:  { width:48, height:48, borderRadius:8, border:'1px solid rgba(239,68,68,0.2)', background:'rgba(239,68,68,0.1)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', flexShrink:0 },
  emptyState:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', textAlign:'center', padding:'2rem', color:'var(--muted-foreground)' },
  // HISTORY
  sessionCard:{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'1.125rem 1.25rem', cursor:'pointer', marginBottom:12 },
  // FEEDBACK
  ratingGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginTop:'1.5rem' },
  ratingCard:{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'1.25rem', display:'flex', flexDirection:'column', alignItems:'center', gap:8, textAlign:'center', cursor:'pointer' },
  formTextarea:{ width:'100%', padding:'0.75rem', minHeight:120, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.875rem', resize:'vertical', outline:'none', marginTop:8 },
  uploadBtn:{ width:48, height:48, borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'var(--muted-foreground)' },
  filePreviewRow:{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 },
  fileChip:{ display:'flex', alignItems:'center', gap:6, padding:'0.375rem 0.625rem', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, fontSize:'0.75rem', maxWidth:240, overflow:'hidden' },
  fileChipName:{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 },
  fileChipRemove:{ cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted-foreground)', flexShrink:0, marginLeft:4 },
  fileMsgContainer:{ display:'flex', flexDirection:'column', gap:6, marginTop:8, width:'100%' },
  fileMsgItem:{ display:'flex', alignItems:'center', gap:8, padding:'0.5rem 0.75rem', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:'0.75rem', cursor:'pointer', textDecoration:'none', color:'var(--foreground)', overflow:'hidden' },
  fileMsgImage:{ maxWidth:'100%', maxHeight:260, borderRadius:8, objectFit:'contain', cursor:'pointer' },
  hamburger:  { background:'none', border:'none', color:'var(--foreground)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' },
}

export default function ClientPortal() {
  const { user, profile, loading, signOut, getFreshToken } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()
  const [view, setView]         = useState<View>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput]       = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [sessionId, setSessionId] = useState(() => 'cli_' + Date.now())
  const [persistedSessionId, setPersistedSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [openSession, setOpenSession] = useState<Session | null>(null)
  const [helpfulCnt, setHelpfulCnt]       = useState(0)
  const [notHelpfulCnt, setNotHelpfulCnt] = useState(0)
  const [correction, setCorrection]       = useState('')
  const [showEscalate, setShowEscalate] = useState(false)
  const [escalReason, setEscalReason]   = useState<string | null>(null)
  const [escalNote, setEscalNote]       = useState('')
  const [escalSubmitting, setEscalSubmitting] = useState(false)
  const [isEscalated, setIsEscalated] = useState(false)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [workflowsLoading, setWorkflowsLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ensurePromiseRef = useRef<Promise<string | null> | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const supabase = createClient()

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function dataUrlToBlob(dataUrl: string): Blob {
    const [meta, b64] = dataUrl.split(',')
    const mime = meta.match(/data:(.*?);/)?.[1] || 'application/octet-stream'
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return new Blob([arr], { type: mime })
  }

  async function uploadFile(f: FileAttach): Promise<string | null> {
    try {
      const name = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user?.id ?? 'anonymous'}/${sessionId}/${Date.now()}-${name}`
      const { error } = await supabase.storage.from('chat-attachments').upload(path, dataUrlToBlob(f.data), { contentType: f.type })
      if (error) { console.error('File upload failed:', error.message); return null }
      const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path)
      return data.publicUrl
    } catch (e) {
      console.error('File upload error:', e)
      return null
    }
  }

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  const fetchWorkflows = useCallback(async (token: string): Promise<Workflow[]> => {
    const res = await fetch('/api/client/workflows', { headers: { 'Authorization': `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      return data.workflows || []
    }
    return []
  }, [])

  const loadWorkflows = useCallback(async () => {
    const freshToken = await getFreshToken()
    if (!freshToken) return
    try {
      setWorkflows(await fetchWorkflows(freshToken))
    } catch (e) {
      console.error('Failed to load workflows:', e)
    } finally {
      setWorkflowsLoading(false)
    }
  }, [getFreshToken, fetchWorkflows])

  useEffect(() => {
    if (loading || !user) return
    let cancelled = false
    void (async () => {
      const freshToken = await getFreshToken()
      if (!freshToken) return
      try {
        const list = await fetchWorkflows(freshToken)
        if (!cancelled) setWorkflows(list)
      } catch (e) {
        console.error('Failed to load workflows:', e)
      } finally {
        if (!cancelled) setWorkflowsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [loading, user, getFreshToken, fetchWorkflows])

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/')
      else if (profile?.is_admin) router.replace('/admin')
    }
  }, [user, profile, loading, router])

  useEffect(() => {
    if (loading || !user) return
    let cancelled = false
    void (async () => {
      const stored = sessionStorage.getItem(`sa_chat_session_${user.id}`)
      const token = stored || sessionId
      if (stored) setSessionId(stored)
      const sid = await ensureSession(token)
      if (cancelled || !sid) return
      const { data } = await supabase
        .from('public_messages')
        .select('*')
        .eq('session_id', sid)
        .order('created_at', { ascending: true })
      if (cancelled || !data) return
      const restored: Msg[] = (data as DbMessageRow[]).map((m) => ({
        id: m.id,
        role: m.sender === 'user' ? 'user' : m.sender === 'agent' ? 'agent' : 'ai',
        text: m.content || '',
        time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : getTime(),
        confidence: typeof m.confidence === 'number' ? m.confidence : undefined,
        category: m.category || undefined,
        escalated: m.should_escalate === 'true' || m.should_escalate === true,
        files: Array.isArray(m.files) && m.files.length > 0 ? m.files : undefined,
      }))
      setMessages(restored)
      if (restored.some(m => m.escalated)) setIsEscalated(true)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  useEffect(() => {
    if (!persistedSessionId) return
    const channel = supabase
      .channel('agent-replies-' + persistedSessionId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'public_messages',
        filter: `session_id=eq.${persistedSessionId}`
      }, (payload) => {
        const row = payload.new as { id?: string; sender?: string; content?: string }
        if (row.sender !== 'agent' || !row.content) return
        const msgId = 'agent-' + row.id
        setMessages(prev => prev.some(m => m.id === msgId)
          ? prev
          : [...prev, { id: msgId, role: 'agent', text: row.content || '', time: getTime() }])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [persistedSessionId, supabase])

  function persistSessionToken(token: string) {
    if (user) sessionStorage.setItem(`sa_chat_session_${user.id}`, token)
  }

  async function ensureSession(token?: string): Promise<string | null> {
    if (!user) return null
    if (persistedSessionId) return persistedSessionId
    if (ensurePromiseRef.current) return ensurePromiseRef.current
    const attempt = (async () => {
      const useToken = token || sessionId
      const { data: existing } = await supabase
        .from('public_sessions')
        .select('id')
        .eq('session_token', useToken)
        .maybeSingle()
      if (existing) { setPersistedSessionId(existing.id); persistSessionToken(useToken); return existing.id }
      const { data, error } = await supabase
        .from('public_sessions')
        .insert({
          session_token: useToken,
          user_id: user.id,
          product_id: profile?.product_id ?? null,
          channel: 'client',
          status: 'active'
        })
        .select('id')
        .single()
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          const { data: winner } = await supabase
            .from('public_sessions')
            .select('id')
            .eq('session_token', useToken)
            .maybeSingle()
          if (winner) { setPersistedSessionId(winner.id); persistSessionToken(useToken); return winner.id }
        }
        console.error('Failed to create session:', error.message)
        return null
      }
      if (data) { setPersistedSessionId(data.id); persistSessionToken(useToken) }
      return data?.id ?? null
    })()
    ensurePromiseRef.current = attempt.finally(() => { ensurePromiseRef.current = null })
    return ensurePromiseRef.current
  }

  async function persistMessage(m: {
    role: 'user' | 'ai'
    text: string
    confidence?: number
    category?: string
    escalated?: boolean
    files?: { name: string; type: string; url?: string; data?: string }[]
  }, sessionIdDb: string | null) {
    if (!sessionIdDb || !user) return
    const files = m.files?.map(f => ({ name: f.name, type: f.type, url: f.url ?? null, data: f.url ? undefined : f.data })) ?? null
    const { error } = await supabase.from('public_messages').insert({
      session_id: sessionIdDb,
      user_id: user.id,
      product_id: profile?.product_id ?? null,
      session_token: sessionId,
      sender: m.role,
      content: m.text,
      message: m.text,
      category: m.category ?? null,
      confidence: m.confidence ?? null,
      should_escalate: m.escalated ? 'true' : 'false',
      files
    })
    if (error) console.error('Failed to persist message:', error.message)
  }

  async function confirmEscalation() {
    if (escalSubmitting) return
    setEscalSubmitting(true)
    try {
      const sid = await ensureSession()
      if (!sid) { console.error('No session for escalation'); return }
      await supabase.from('escalations').insert({
        session_id: sid,
        reason: 'user_requested',
        triggered_by: 'client',
        client_reason: escalReason,
        client_note: escalNote.trim() || null,
        routed_to: 'support'
      })
    } catch (e) {
      console.error('Failed to save escalation:', e)
    } finally {
      setShowEscalate(false)
      setEscalSubmitting(false)
    }
    const reason = escalReason || ''
    const note = escalNote.trim()
    await sendMessage(`I need to speak to a human agent — please escalate this.${reason ? ` Reason: ${reason}` : ''}${note ? ` (${note})` : ''}`)
    setIsEscalated(true)
  }

  function resetChat() {
    if (!user) return
    const next = 'cli_' + Date.now()
    sessionStorage.removeItem(`sa_chat_session_${user.id}`)
    sessionStorage.setItem(`sa_chat_session_${user.id}`, next)
    setMessages([])
    setSessionId(next)
    setPersistedSessionId(null)
    setIsEscalated(false)
    loadWorkflows()
  }

  async function sendMessage(text?: string) {
    const freshToken = await getFreshToken()
    if (!freshToken) return
    const msg = text || input.trim()
    if (!msg && selectedFiles.length === 0) return
    setInput('')
    const files = await Promise.all(selectedFiles.map(async (f) => ({
      name: f.name,
      type: f.type,
      data: await readFileAsDataUrl(f)
    })))
    const uploads = await Promise.all(files.map(f => uploadFile(f)))
    const storedFiles = files.map((f, i) => ({ name: f.name, type: f.type, url: uploads[i] || undefined, data: uploads[i] ? undefined : f.data }))
    setSelectedFiles([])
    const msgId = 'msg_' + Date.now()
    const userMsg = { id: msgId+'u', role: 'user' as const, text: msg, time: getTime(), files }
    setMessages(prev => [...prev, userMsg])
    const sid = await ensureSession()
    await persistMessage({ role: 'user' as const, text: msg, files: storedFiles }, sid)
    setChatLoading(true)
    try {
      if (isEscalated) {
        setChatLoading(false)
        return
      }
      const res = await fetch(`${N8N_BASE}/client-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
        body: JSON.stringify({
          message: msg,
          sessionId,
          history: messages.slice(-20).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text, time: m.time })),
          files: files.map(f => ({ name: f.name, type: f.type, data: f.data.split(',')[1] || f.data, is_binary: true })),
          ...(files.length > 0 && {
            file: files[0].data.split(',')[1] || files[0].data,
            filename: files[0].name,
            mimetype: files[0].type
          })
        })
      })
      const data: ChatResponse = await res.json()
      const reply = typeof data.reply === 'string' ? sanitizeReply(data.reply) : 'I could not process your request.'
      const aiMsg = {
        id: msgId, role: 'ai' as const, text: reply,
        confidence: data.confidence, category: data.category, escalated: data.should_escalate,
        time: getTime()
      }
      setMessages(prev => [...prev, aiMsg])
      await persistMessage(aiMsg, sid)
      if (data.should_escalate) setIsEscalated(true)
    } catch {
      setMessages(prev => [...prev, { id: msgId, role: 'ai', text: 'Unable to connect. Please try again.', time: getTime() }])
    }
    setChatLoading(false)
  }

  async function loadHistory() {
    if (!user) return
    const { data } = await supabase.from('public_sessions').select('*, public_messages(sender,content,category,confidence,created_at,files)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
    if (!data) return
    const sorted = (data as Session[]).map(s => ({
      ...s,
      public_messages: [...(s.public_messages || [])].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }))
    setSessions(sorted)
  }

  async function saveFeedback(rating: string) {
    if (!sessionId) return
    await supabase.from('feedback').insert({ session_id: sessionId, rating })
  }

  async function submitCorrection() {
    if (!correction.trim()) return
    await supabase.from('feedback').insert({ session_id: sessionId, rating: 'correction', correction })
    setCorrection(''); alert('Correction submitted. Thank you!')
  }

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--background)', color:'var(--muted-foreground)' }}>
      Loading…
    </div>
  )

  if (!user) return null

  const initials = (profile?.full_name || profile?.email || user?.email || 'U').split(' ').map((w:string) => w[0]).join('').substr(0,2).toUpperCase()

  return (
    <div className="client-page" style={S.page}>
      <BgOrbs />
      <style>{`
        .client-hamburger { display: none; }
        .client-sidebar-overlay { display: none !important; position: fixed; inset: 0; z-index: 105; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); }
        .client-sidebar-overlay.visible { display: block !important; }
        @media (max-width: 768px) {
          .client-sidebar { position: fixed !important; left: 0; top: 0; bottom: 0; transform: translateX(-100%); z-index: 110 !important; transition: transform 0.3s ease; }
          .client-sidebar.open { transform: translateX(0); }
          .client-hamburger { display: flex !important; }
          .client-topbar { padding: 0 0.75rem !important; }
          .client-chatmsgs, .client-viewpad { padding: 1rem 0.75rem !important; }
          .client-banner, .client-workflowbar { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
          .client-input { padding: 0.75rem !important; }
        }
      `}</style>

      {/* SIDEBAR BACKDROP */}
      <div className={`client-sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* SIDEBAR */}
      <div className={`client-sidebar ${sidebarOpen ? 'open' : ''}`} style={S.sidebar}>
        <div style={S.sidebarLogo}><div style={S.logoDot} /><span>SupportAI</span></div>

        <div style={S.productBox}>
          <div style={{ fontSize:'0.7rem', color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Active Product</div>
          <div style={{ fontSize:'0.875rem', fontWeight:600 }}>{profile?.products?.name || 'No Product Assigned'}</div>
          {profile?.product_id && <div style={{ fontSize:'0.7rem', color:'var(--muted-foreground)', fontFamily:'monospace', marginTop:2 }}>{profile.product_id.substr(0,12)}…</div>}
        </div>

        <div style={{ marginBottom:'2rem' }}>
          <div style={S.sectionLabel}>Support</div>
          {([['chat',<MessageSquare size={16} key="chat" />,'Chat Support'],['history',<Clock size={16} key="history" />,'Session History'],['feedback',<Star size={16} key="feedback" />,'Feedback']] as const).map(([v, icon, label]) => (
            <div key={v as string} style={{ ...S.navItem, ...(view===v ? S.navActive : {}) }} onClick={() => { setView(v); setSidebarOpen(false); if(v==='history') loadHistory() }}>
              <span>{icon}</span>{label}
            </div>
          ))}
        </div>

        <div style={{ marginBottom:'2rem' }}>
          <div style={S.sectionLabel}>Info</div>
          <Link href="/" style={{ ...S.navItem }}><span><Home size={16} /></span>Company Home</Link>
        </div>

        <div style={S.userRow}>
          <div style={S.avatar}>{initials}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'0.8125rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.full_name || profile?.email || user?.email}</div>
            <div style={{ fontSize:'0.7rem', color:'var(--muted-foreground)' }}>Client</div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <div style={{ display:'flex', alignItems:'center', color:'var(--muted-foreground)', cursor:'pointer' }} onClick={signOut} title="Sign out"><LogOut size={16} /></div>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={S.main}>

        {/* CHAT VIEW */}
        {view === 'chat' && (
          <>
            <div className="client-topbar" style={S.topbar}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
                <button className="client-hamburger" style={S.hamburger} onClick={() => setSidebarOpen(true)} title="Menu"><Menu size={18} /></button>
                <div style={{ ...S.topbarTitle, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>AI Chat Support</div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                <div style={{ color:'var(--muted-foreground)', cursor:'pointer', display:'flex', padding:'0.4375rem 0.625rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)' }} onClick={toggleTheme} title="Toggle theme">{theme==='dark'?<Sun size={14}/>:<Moon size={14}/>}</div>
                <button style={S.btnGhost} onClick={resetChat}>New Chat</button>
              </div>
            </div>
            <div className="client-banner" style={S.banner}>
              <span>Responding to questions about: <strong style={{ color:'var(--primary)' }}>{profile?.products?.name || 'your product'}</strong></span>
              <span style={{ color:'var(--muted-foreground)', fontSize:'0.75rem' }}>Scoped to your product KB only</span>
            </div>
            <div className="client-workflowbar" style={S.workflowBar}>
              <Zap size={13} style={{ flexShrink:0 }} />
              <span style={{ color:'var(--muted-foreground)' }}>Workflows you can ask about:</span>
              {workflowsLoading ? (
                <span style={{ color:'var(--muted-foreground)' }}>Loading…</span>
              ) : workflows.length === 0 ? (
                <span style={{ color:'var(--muted-foreground)' }}>None assigned to your product yet</span>
              ) : (
                <>
                  {workflows.slice(0, 6).map(w => (
                    <span key={w.id} style={S.workflowChip} title={w.webhook_path || undefined}>{w.name}</span>
                  ))}
                  {workflows.length > 6 && <span style={S.workflowMore}>+{workflows.length - 6} more</span>}
                </>
              )}
            </div>
            <div className="client-chatmsgs" style={S.chatMsgs}>
              {messages.length === 0 && (
                <div style={S.emptyState}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem' }}><Bot size={48} color="var(--muted-foreground)" /></div>
                  <div style={{ fontFamily:'Inter,sans-serif', fontSize:'1.125rem', color:'var(--muted-foreground)', marginBottom:'0.5rem' }}>How can I help you today?</div>
                  <div style={{ fontSize:'0.875rem', maxWidth:340, lineHeight:1.6 }}>Ask about your product&apos;s automation workflows, what they do, or any known issues. I&apos;ll search our knowledge base and give you an accurate answer.</div>
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} style={m.role === 'user' ? S.msgUser : (m.role === 'agent' ? S.msgAgent : S.msgAi)}>
                  <div style={{ ...S.msgAvatar, background: m.role === 'ai' ? 'linear-gradient(135deg,var(--primary),var(--chart-2))' : (m.role === 'agent' ? 'linear-gradient(135deg,var(--chart-1),var(--chart-3))' : 'rgba(255,255,255,0.08)') }}>{m.role==='ai'?<Bot size={16} />:m.role==='agent'?<Headphones size={16} />:<User size={16} />}</div>
                    <div>
                      <div style={m.role === 'user' ? S.bubbleUser : (m.role === 'agent' ? S.bubbleAgent : S.bubbleAi)} className="chat-message">{m.role === 'ai' ? <ReactMarkdown>{m.text}</ReactMarkdown> : m.text}</div>
                      {m.role === 'agent' && <div style={{ fontSize:'0.6875rem', color:'var(--chart-1)', marginTop:4 }}>Support Agent</div>}
                      {m.files && m.files.length > 0 && (
                        <div style={S.fileMsgContainer}>
                          {m.files.map((f, i) => f.type.startsWith('image/') ? (
                            <img key={i} src={f.data} alt={f.name} style={S.fileMsgImage} title={f.name} />
                          ) : (
                            <a key={i} href={f.data} download={f.name} style={S.fileMsgItem}>
                              <FileText size={14} />
                              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{f.name}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {m.escalated && <div style={S.escalNote}><span style={{ display:'inline-flex', alignItems:'center', gap:6, marginRight:4 }}><AlertTriangle size={14} /></span>This query has been escalated to our support team. You&apos;ll be contacted shortly.</div>}
                    {m.role === 'ai' && (
                      <div style={S.msgMeta}>
                        {m.time}
                        {m.confidence !== undefined && (
                          <Badge variant={confBadge(m.confidence)}>{Math.round(m.confidence*100)}% confidence</Badge>
                        )}
                        {m.category && <span style={{ color:'var(--muted-foreground)' }}>{m.category}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={S.msgAi}>
                  <div style={{ ...S.msgAvatar, background:'linear-gradient(135deg,var(--primary),var(--chart-2))' }}><Bot size={16} /></div>
                  <div style={{ ...S.bubbleAi, display:'flex', gap:4 }}>
                    {[0,1,2].map(i => <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--muted-foreground)', display:'inline-block', animation:`typing 1.2s infinite ${i*0.2}s` }} />)}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="client-input" style={S.inputArea}>
              <div style={S.inputRow}>
                <textarea style={S.msgInput} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()} }} placeholder="Type your support question..." rows={1} />
                <button style={S.uploadBtn} onClick={() => fileInputRef.current?.click()} title="Attach files"><Paperclip size={18} /></button>
                <button style={S.escalBtn} onClick={() => { setEscalReason(null); setEscalNote(''); setShowEscalate(true) }} title="Request escalation"><AlertTriangle size={18} /></button>
                <button style={S.sendBtn} onClick={() => sendMessage()}>
                  <Send size={18} color="white" />
                </button>
              </div>
              <input ref={fileInputRef} type="file" multiple hidden accept=".pdf,.txt,.png,.jpg,.jpeg,.gif,.webp" onChange={e => { const fs = Array.from(e.target.files || []); setSelectedFiles(prev => [...prev, ...fs]); e.target.value = '' }} />
              {selectedFiles.length > 0 && (
                <div style={S.filePreviewRow}>
                  {selectedFiles.map((f, i) => (
                    <div key={i} style={S.fileChip}>
                      <FileText size={14} style={{ flexShrink:0 }} />
                      <span style={S.fileChipName} title={f.name}>{f.name}</span>
                      <span style={S.fileChipRemove} onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}><X size={14} /></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ESCALATION MODAL */}
            {showEscalate && (
              <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }} onClick={e => e.target === e.currentTarget && setShowEscalate(false)}>
                <div style={{ width:'100%', maxWidth:480, background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:20, padding:'1.75rem', maxHeight:'90vh', overflowY:'auto' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.375rem' }}>
                    <div style={{ fontFamily:'Inter,sans-serif', fontSize:'1.125rem', fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
                      <AlertTriangle size={18} color="var(--destructive)" />
                      Escalate to a human agent
                    </div>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setShowEscalate(false)}><X size={14} /></div>
                  </div>
                  <p style={{ color:'var(--muted-foreground)', fontSize:'0.8125rem', marginBottom:'1.5rem' }}>Tell us why you want to escalate so our team can help you faster.</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.625rem', marginBottom:'1.25rem' }}>
                    {['Answer not helpful','Issue not resolved','Need to talk to a human','Urgent problem','Something else'].map(r => (
                      <div key={r} style={{ padding:'0.75rem 1rem', borderRadius:10, fontSize:'0.8125rem', cursor:'pointer', border: escalReason === r ? '1px solid var(--destructive)' : '1px solid rgba(255,255,255,0.08)', background: escalReason === r ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)', color: escalReason === r ? 'var(--destructive)' : 'var(--foreground)' }} onClick={() => setEscalReason(r)}>{r}</div>
                    ))}
                  </div>
                  <label style={S.formLabel}>Additional details (optional)</label>
                  <textarea style={{ ...S.formTextarea, minHeight:90, marginTop:0 }} value={escalNote} onChange={e => setEscalNote(e.target.value)} placeholder="Describe the issue briefly…" />
                  <div style={{ display:'flex', gap:12, justifyContent:'flex-end', marginTop:'1.5rem' }}>
                    <button style={S.btnGhost} onClick={() => setShowEscalate(false)}>Cancel</button>
                    <button style={{ ...S.btnDanger, padding:'0.5rem 1.25rem', opacity: escalSubmitting ? 0.6 : 1, cursor: escalSubmitting ? 'not-allowed' : 'pointer' }} disabled={escalSubmitting} onClick={confirmEscalation}>
                      {escalSubmitting ? 'Submitting…' : 'Escalate'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <>
            <div className="client-topbar" style={S.topbar}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
                <button className="client-hamburger" style={S.hamburger} onClick={() => setSidebarOpen(true)} title="Menu"><Menu size={18} /></button>
                <div style={{ ...S.topbarTitle, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Session History</div>
              </div>
            </div>
            <div className="client-viewpad" style={{ flex:1, overflowY:'auto', padding:'2rem 1.5rem' }}>
              <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.375rem' }}>Past Conversations</h2>
              <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'2rem' }}>Your previous AI support sessions.</p>
              {sessions.length === 0 ? (
                <div style={{ ...S.emptyState, height:'auto', paddingTop:'3rem' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem' }}><FolderOpen size={48} color="var(--muted-foreground)" /></div>
                  <div style={{ fontFamily:'Inter,sans-serif', fontSize:'1.125rem', color:'var(--muted-foreground)' }}>No sessions yet</div>
                </div>
              ) : sessions.map(s => {
                const msgs = s.public_messages || []
                const last = msgs[msgs.length - 1]
                const preview = last?.sender === 'ai' ? sanitizeReply(last.content || '') : (last?.content || '')
                return (
                  <div key={s.id} style={{ ...S.sessionCard, borderColor: openSession?.id === s.id ? 'rgba(96,165,250,0.4)' : undefined }} onClick={() => setOpenSession(s)}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{new Date(s.created_at).toLocaleDateString()}</span>
                      {last?.category && <Badge variant={catBadge(last.category)}>{last.category}</Badge>}
                    </div>
                    <div style={{ fontSize:'0.8125rem', color:'var(--muted-foreground)', lineHeight:1.5 }}>{preview.slice(0,120) || 'No messages'}{preview.length > 120 ? '…' : ''}</div>
                    <div style={{ display:'flex', gap:12, marginTop:10 }}>
                      <span style={{ fontSize:'0.7rem', color:'var(--muted-foreground)' }}>{msgs.length} messages</span>
                      {last?.confidence && <span style={{ fontSize:'0.7rem', color:'var(--muted-foreground)' }}>Confidence: {Math.round(last.confidence*100)}%</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* FEEDBACK VIEW */}
        {view === 'feedback' && (          <>
            <div className="client-topbar" style={S.topbar}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
                <button className="client-hamburger" style={S.hamburger} onClick={() => setSidebarOpen(true)} title="Menu"><Menu size={18} /></button>
                <div style={{ ...S.topbarTitle, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Feedback</div>
              </div>
            </div>
            <div className="client-viewpad" style={{ flex:1, overflowY:'auto', padding:'2rem 1.5rem' }}>
              <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.375rem' }}>Rate Your Experience</h2>
              <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>Your feedback helps improve AI support for your product.</p>
              <div style={S.ratingGrid}>
                {[{icon:<ThumbsUp size={24} />,label:'Helpful',cnt:helpfulCnt,fn:() => { setHelpfulCnt(c=>c+1); saveFeedback('helpful') }},{icon:<ThumbsDown size={24} />,label:'Not Helpful',cnt:notHelpfulCnt,fn:() => { setNotHelpfulCnt(c=>c+1); saveFeedback('not_helpful') }}].map((item) => (
                  <div key={item.label} style={S.ratingCard} onClick={item.fn}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>{item.icon}</div>
                    <div style={{ fontSize:'0.8125rem', fontWeight:600 }}>{item.label}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{item.cnt} responses</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:'2rem' }}>
                <label style={{ ...S.formLabel }}>Correction / Suggestion (optional)</label>
                <textarea style={S.formTextarea} value={correction} onChange={e => setCorrection(e.target.value)} placeholder="What should the correct answer have been?" />
                <button style={{ ...S.btnPrimary, marginTop:'1rem', padding:'0.75rem 1.5rem' }} onClick={submitCorrection}>Submit Correction</button>
              </div>
            </div>
          </>
        )}

        {/* SESSION THREAD MODAL */}
        {openSession && (() => {
          const thread = [...(openSession.public_messages || [])].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          return (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:'1.5rem' }} onClick={() => setOpenSession(null)}>
              <div style={{ width:'min(720px,100%)', maxHeight:'90vh', background:'var(--background)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontFamily:'Inter,sans-serif', fontSize:'1rem', fontWeight:600 }}>Session Thread</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{new Date(openSession.created_at).toLocaleString()} · {thread.length} messages</div>
                  </div>
                  <button style={S.btnGhost} onClick={() => setOpenSession(null)}><X size={16} /></button>
                </div>
                <div style={{ flex:1, overflowY:'auto', padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
                  {thread.map((m, i) => {
                    const role = m.sender === 'user' ? 'user' : (m.sender === 'agent' ? 'agent' : 'ai')
                    return (
                      <div key={m.id || i} style={role === 'user' ? S.msgUser : (role === 'agent' ? S.msgAgent : S.msgAi)}>
                        <div style={{ ...S.msgAvatar, background: role === 'ai' ? 'linear-gradient(135deg,var(--primary),var(--chart-2))' : (role === 'agent' ? 'linear-gradient(135deg,var(--chart-1),var(--chart-3))' : 'rgba(255,255,255,0.08)') }}>{role==='ai'?<Bot size={16} />:role==='agent'?<Headphones size={16} />:<User size={16} />}</div>
                        <div>
                          <div style={role === 'user' ? S.bubbleUser : (role === 'agent' ? S.bubbleAgent : S.bubbleAi)} className="chat-message">{role === 'ai' ? <ReactMarkdown>{sanitizeReply(m.content)}</ReactMarkdown> : m.content}</div>
                          {role === 'agent' && <div style={{ fontSize:'0.6875rem', color:'var(--chart-1)', marginTop:4 }}>Support Agent</div>}
                          {m.files && m.files.length > 0 && (
                            <div style={S.fileMsgContainer}>
                              {m.files.map((f, fi) => f.type.startsWith('image/') ? (
                                <img key={fi} src={f.url || f.data} alt={f.name} style={S.fileMsgImage} title={f.name} />
                              ) : (
                                <a key={fi} href={f.url || f.data} target="_blank" rel="noreferrer" style={S.fileMsgItem}>
                                  <FileText size={14} />
                                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{f.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          <div style={S.msgMeta}>
                            {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : ''}
                            {m.sender === 'ai' && typeof m.confidence === 'number' && <Badge variant={confBadge(m.confidence)}>{Math.round(m.confidence*100)}% confidence</Badge>}
                            {m.category && <span style={{ color:'var(--muted-foreground)' }}>{m.category}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {thread.length === 0 && (
                    <div style={{ textAlign:'center', color:'var(--muted-foreground)', padding:'3rem 0' }}>No messages in this session</div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
