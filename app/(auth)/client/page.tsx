'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import BgOrbs from '@/components/BgOrbs'
import Badge, { catBadge, confBadge } from '@/components/Badge'
import { createClient } from '@/lib/supabase'
import { N8N_BASE } from '@/lib/supabase'
import type { ChatResponse, Session } from '@/lib/types'
import { MessageSquare, Clock, Star, Home, Sun, Moon, LogOut, Bot, User, AlertTriangle, FolderOpen, Bug, Key, CreditCard, BookOpen, Zap, ThumbsUp, ThumbsDown, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

type View = 'chat' | 'history' | 'feedback'

interface Msg { id: string; role: 'user'|'ai'; text: string; time: string; confidence?: number; category?: string; escalated?: boolean }

function getTime() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

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
  msgUser:   { display:'flex', gap:14, maxWidth:'80%', alignSelf:'flex-end', flexDirection:'row-reverse', animation:'fadeIn 0.3s ease' },
  msgAvatar: { width:34, height:34, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.875rem' },
  bubbleAi:  { padding:'0.875rem 1.125rem', borderRadius:12, fontSize:'0.875rem', lineHeight:1.7, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderBottomLeftRadius:4 },
  bubbleUser:{ padding:'0.875rem 1.125rem', borderRadius:12, fontSize:'0.875rem', lineHeight:1.7, background:'linear-gradient(135deg,var(--primary),var(--chart-2))', borderBottomRightRadius:4 },
  msgMeta:   { display:'flex', alignItems:'center', gap:12, fontSize:'0.7rem', color:'var(--muted-foreground)', marginTop:6 },
  escalNote: { padding:'0.875rem 1.125rem', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, fontSize:'0.8125rem', color:'var(--destructive)', marginTop:6 },
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
}

export default function ClientPortal() {
  const { user, profile, loading, signOut, getFreshToken } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()
  const [view, setView]         = useState<View>('chat')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput]       = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [sessionId, setSessionId] = useState(() => 'cli_' + Date.now())
  const [sessions, setSessions] = useState<Session[]>([])
  const [helpfulCnt, setHelpfulCnt]       = useState(0)
  const [notHelpfulCnt, setNotHelpfulCnt] = useState(0)
  const [correction, setCorrection]       = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/')
      else if (profile?.is_admin) router.replace('/admin')
    }
  }, [user, profile, loading, router])

  async function sendMessage(text?: string) {
    const freshToken = await getFreshToken()
    if (!freshToken) return
    const msg = text || input.trim()
    if (!msg) return
    setInput('')
    const msgId = 'msg_' + Date.now()
    setMessages(prev => [...prev, { id: msgId+'u', role: 'user', text: msg, time: getTime() }])
    setChatLoading(true)
    try {
      const res = await fetch(`${N8N_BASE}/client-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
        body: JSON.stringify({ message: msg, sessionId })
      })
      const data: ChatResponse = await res.json()
      const reply = typeof data.reply === 'string' ? data.reply : 'I could not process your request.'
      setMessages(prev => [...prev, {
        id: msgId, role: 'ai', text: reply,
        confidence: data.confidence, category: data.category, escalated: data.should_escalate,
        time: getTime()
      }])
    } catch {
      setMessages(prev => [...prev, { id: msgId, role: 'ai', text: 'Unable to connect. Please try again.', time: getTime() }])
    }
    setChatLoading(false)
  }

  async function loadHistory() {
    if (!user) return
    const { data } = await supabase.from('public_sessions').select('*, public_messages(content,category,confidence,created_at)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
    if (data) setSessions(data as Session[])
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
    <div style={S.page}>
      <BgOrbs />

      {/* SIDEBAR */}
      <div style={S.sidebar}>
        <div style={S.sidebarLogo}><div style={S.logoDot} /><span>SupportAI</span></div>

        <div style={S.productBox}>
          <div style={{ fontSize:'0.7rem', color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Active Product</div>
          <div style={{ fontSize:'0.875rem', fontWeight:600 }}>{(profile as any)?.products?.name || 'No Product Assigned'}</div>
          {profile?.product_id && <div style={{ fontSize:'0.7rem', color:'var(--muted-foreground)', fontFamily:'monospace', marginTop:2 }}>{profile.product_id.substr(0,12)}…</div>}
        </div>

        <div style={{ marginBottom:'2rem' }}>
          <div style={S.sectionLabel}>Support</div>
          {([['chat',<MessageSquare size={16} />,'Chat Support'],['history',<Clock size={16} />,'Session History'],['feedback',<Star size={16} />,'Feedback']] as const).map(([v, icon, label]) => (
            <div key={v as string} style={{ ...S.navItem, ...(view===v ? S.navActive : {}) }} onClick={() => { setView(v); if(v==='history') loadHistory() }}>
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
            <div style={S.topbar}>
              <div style={S.topbarTitle}>AI Chat Support</div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ color:'var(--muted-foreground)', cursor:'pointer', display:'flex', padding:'0.4375rem 0.625rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)' }} onClick={toggleTheme} title="Toggle theme">{theme==='dark'?<Sun size={14}/>:<Moon size={14}/>}</div>
                <button style={S.btnGhost} onClick={() => { setMessages([]); setSessionId('cli_' + Date.now()) }}>New Chat</button>
              </div>
            </div>
            <div style={S.banner}>
              <span>Responding to questions about: <strong style={{ color:'var(--primary)' }}>{(profile as any)?.products?.name || 'your product'}</strong></span>
              <span style={{ color:'var(--muted-foreground)', fontSize:'0.75rem' }}>Scoped to your product KB only</span>
            </div>
            <div style={S.chatMsgs}>
              {messages.length === 0 && (
                <div style={S.emptyState}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem' }}><Bot size={48} color="var(--muted-foreground)" /></div>
                  <div style={{ fontFamily:'Inter,sans-serif', fontSize:'1.125rem', color:'var(--muted-foreground)', marginBottom:'0.5rem' }}>How can I help you today?</div>
                  <div style={{ fontSize:'0.875rem', maxWidth:300, lineHeight:1.6 }}>Ask anything about your product. I'll search our knowledge base and give you an accurate answer.</div>
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} style={m.role === 'ai' ? S.msgAi : S.msgUser}>
                  <div style={{ ...S.msgAvatar, background: m.role === 'ai' ? 'linear-gradient(135deg,var(--primary),var(--chart-2))' : 'rgba(255,255,255,0.08)' }}>{m.role==='ai'?<Bot size={16} />:<User size={16} />}</div>
                  <div>
                    <div style={m.role === 'ai' ? S.bubbleAi : S.bubbleUser} className="chat-message">{m.role === 'ai' ? <ReactMarkdown>{m.text}</ReactMarkdown> : m.text}</div>
                    {m.escalated && <div style={S.escalNote}><span style={{ display:'inline-flex', alignItems:'center', gap:6, marginRight:4 }}><AlertTriangle size={14} /></span>This query has been escalated to our support team. You'll be contacted shortly.</div>}
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
            <div style={S.inputArea}>
              <div style={S.inputRow}>
                <textarea style={S.msgInput} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()} }} placeholder="Type your support question..." rows={1} />
                <button style={S.escalBtn} onClick={() => sendMessage('I need to speak to a human agent — please escalate this.')} title="Request escalation"><AlertTriangle size={18} /></button>
                <button style={S.sendBtn} onClick={() => sendMessage()}>
                  <Send size={18} color="white" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <>
            <div style={S.topbar}><div style={S.topbarTitle}>Session History</div></div>
            <div style={{ flex:1, overflowY:'auto', padding:'2rem 1.5rem' }}>
              <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.375rem' }}>Past Conversations</h2>
              <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'2rem' }}>Your previous AI support sessions.</p>
              {sessions.length === 0 ? (
                <div style={{ ...S.emptyState, height:'auto', paddingTop:'3rem' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem' }}><FolderOpen size={48} color="var(--muted-foreground)" /></div>
                  <div style={{ fontFamily:'Inter,sans-serif', fontSize:'1.125rem', color:'var(--muted-foreground)' }}>No sessions yet</div>
                </div>
              ) : sessions.map(s => {
                const msgs = (s as any).public_messages || []
                const last = msgs[msgs.length - 1]
                return (
                  <div key={s.id} style={S.sessionCard}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>{new Date(s.created_at).toLocaleDateString()}</span>
                      {last?.category && <Badge variant={catBadge(last.category)}>{last.category}</Badge>}
                    </div>
                    <div style={{ fontSize:'0.8125rem', color:'var(--muted-foreground)', lineHeight:1.5 }}>{last?.content?.slice(0,120) || 'No messages'}{last?.content?.length > 120 ? '…' : ''}</div>
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
        {view === 'feedback' && (
          <>
            <div style={S.topbar}><div style={S.topbarTitle}>Feedback</div></div>
            <div style={{ flex:1, overflowY:'auto', padding:'2rem 1.5rem' }}>
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
      </div>
    </div>
  )
}
