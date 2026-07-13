'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import BgOrbs from '@/components/BgOrbs'
import { N8N_BASE } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { Brain, Shield, Zap, BarChart3, EyeOff, FolderOpen, Globe, User, Settings, Bot, Check, Send, Sun, Moon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface ChatMsg { role: 'user'|'ai'; text: string; time: string }

function getTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme()
  const [messages, setMessages] = useState<ChatMsg[]>([{
    role: 'ai',
    text: "Hi! I'm the SupportAI assistant. I can answer general questions about our platform and company. For product-specific support, please sign into the client portal.",
    time: getTime()
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => 'pub_' + Date.now() + '_' + Math.random().toString(36).substr(2,9))
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = chatBoxRef.current
    if (!box) return
    box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg, time: getTime() }])
    setLoading(true)
    try {
      const res = await fetch(`${N8N_BASE}/public-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, sessionId })
      })
      const data = await res.json()
      const reply = typeof data.reply === 'string' ? data.reply : 'Sorry, I could not process that.'
      setMessages(prev => [...prev, { role: 'ai', text: reply, time: getTime() }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Unable to connect to the support system. Please try again.', time: getTime() }])
    }
    setLoading(false)
  }

  const S: Record<string, React.CSSProperties> = {
    page: { position: 'relative', minHeight: '100vh' },
    z1:   { position: 'relative', zIndex: 1 },

    nav: {
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 2rem',
      background: 'color-mix(in srgb, var(--background) 70%, transparent)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)'
    },
    logo: {
      fontFamily: 'Inter, sans-serif', fontSize: '1.25rem', fontWeight: 700,
      background: 'linear-gradient(135deg,var(--primary),var(--ring))',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      display: 'flex', alignItems: 'center', gap: 8
    },
    logoDot: {
      width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)',
      boxShadow: '0 0 12px var(--primary)', flexShrink: 0,
      WebkitTextFillColor: 'initial'
    },
    navLinks: { display: 'flex', gap: '2rem' },
    navLink: { color: 'var(--muted-foreground)', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 },
    navCta: { display: 'flex', gap: '0.75rem', alignItems: 'center' },

    btnGhost: {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '0.5rem 1.25rem', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600,
      cursor: 'pointer', textDecoration: 'none', border: '1px solid var(--border)',
      background: 'transparent', color: 'var(--muted-foreground)', fontFamily: 'Inter, sans-serif', transition: 'all 0.2s'
    },
    btnPrimary: {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '0.5rem 1.25rem', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600,
      cursor: 'pointer', textDecoration: 'none', border: 'none',
      background: 'linear-gradient(135deg,var(--primary),var(--chart-2))', color: '#fff',
      boxShadow: '0 0 20px color-mix(in srgb, var(--primary) 30%, transparent)', fontFamily: 'Inter, sans-serif', transition: 'all 0.2s'
    },
    btnLg: { padding: '0.875rem 2rem', fontSize: '1rem', borderRadius: 12 },

    hero: {
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: '8rem 1.5rem 4rem'
    },
    badge: {
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '0.375rem 1rem', borderRadius: 100,
      border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)', background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
      fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)',
      letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '2rem'
    },
    badgeDot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'pulse-dot 2s infinite' },
    heroTitle: {
      fontFamily: 'Inter, sans-serif',
      fontSize: 'clamp(2.5rem,6vw,4.5rem)', fontWeight: 700,
      lineHeight: 1.1, letterSpacing: '-0.02em',
      maxWidth: 800, marginBottom: '1.5rem'
    },
    heroSubtitle: {
      fontSize: '1.125rem', color: 'var(--muted-foreground)', maxWidth: 560,
      lineHeight: 1.7, marginBottom: '3rem'
    },
    heroActions: { display: 'flex', gap: '1rem', flexWrap: 'wrap' as const, justifyContent: 'center', marginBottom: '5rem' },
    heroStats: {
      display: 'flex', gap: '3rem', flexWrap: 'wrap' as const, justifyContent: 'center',
      paddingTop: '3rem', borderTop: '1px solid var(--border)'
    },
    statVal: {
      fontFamily: 'Inter, sans-serif', fontSize: '2rem', fontWeight: 700,
      background: 'linear-gradient(135deg,var(--primary),var(--ring))',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
    },
    statLabel: { fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },

    section: { position: 'relative' as const, zIndex: 1, padding: '6rem 1.5rem' },
    sectionInner: { maxWidth: 1100, margin: '0 auto' },
    sectionLabel: { fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--primary)', marginBottom: '1rem' },
    sectionTitle: { fontFamily: 'Inter, sans-serif', fontSize: 'clamp(1.75rem,3vw,2.75rem)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '1rem' },
    sectionSubtitle: { color: 'var(--muted-foreground)', fontSize: '1.0625rem', lineHeight: 1.7, maxWidth: 540 },

    featureCard: {
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 20, padding: '1.75rem', transition: 'all 0.3s'
    },
    featureIcon: { width: 44, height: 44, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', marginBottom: '1.25rem' },
    featureTitle: { fontFamily: 'Inter, sans-serif', fontSize: '1.0625rem', fontWeight: 600, marginBottom: '0.625rem' },
    featureDesc:  { fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.65 },

    flowStep: { display: 'flex', gap: '1.5rem', alignItems: 'flex-start', padding: '1.5rem 0' },
    flowNum:  {
      width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.9rem',
      background: 'var(--card)', border: '1px solid var(--border)',
      color: 'var(--primary)', position: 'relative' as const, zIndex: 1
    },

    portalCard: {
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 28, padding: '2rem', transition: 'all 0.3s'
    },

    chatContainer: {
      maxWidth: 700, margin: '0 auto',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 28, overflow: 'hidden',
      boxShadow: '0 25px 80px rgba(0,0,0,0.3)'
    },
    chatHeader: {
      padding: '1.25rem 1.5rem', background: 'color-mix(in srgb, var(--card) 97%, var(--foreground))',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    },
    chatAvatar: {
      width: 36, height: 36, borderRadius: '50%',
      background: 'linear-gradient(135deg,var(--primary),var(--chart-2))',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem'
    },
    chatMessages: { height: 360, overflowY: 'auto' as const, padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
    msgAi:   { display: 'flex', gap: 12, maxWidth: '85%', alignSelf: 'flex-start' },
    msgUser: { display: 'flex', gap: 12, maxWidth: '85%', alignSelf: 'flex-end', flexDirection: 'row-reverse' as const },
    bubbleAi:   { padding: '0.75rem 1rem', borderRadius: 12, fontSize: '0.875rem', lineHeight: 1.6, background: 'color-mix(in srgb, var(--card) 94%, var(--foreground))', border: '1px solid var(--border)', borderBottomLeftRadius: 4 },
    bubbleUser: { padding: '0.75rem 1rem', borderRadius: 12, fontSize: '0.875rem', lineHeight: 1.6, background: 'linear-gradient(135deg,var(--primary),var(--chart-2))', borderBottomRightRadius: 4 },
    msgTime: { fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: 4 },
    chip: {
      padding: '0.375rem 0.875rem', borderRadius: 100,
      background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
      color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer'
    },
    chatInput: {
      flex: 1, padding: '0.75rem 1rem',
      background: 'color-mix(in srgb, var(--card) 96%, var(--foreground))', border: '1px solid var(--border)',
      borderRadius: 12, color: 'var(--foreground)', fontFamily: 'Inter, sans-serif', fontSize: '0.875rem',
      outline: 'none', resize: 'none' as const, minHeight: 44
    },
    sendBtn: {
      width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer',
      background: 'linear-gradient(135deg,var(--primary),var(--chart-2))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 16px color-mix(in srgb, var(--primary) 30%, transparent)', flexShrink: 0
    },

    ctaCard: {
      maxWidth: 700, margin: '0 auto', padding: '4rem 3rem', textAlign: 'center' as const,
      background: 'linear-gradient(135deg,color-mix(in srgb, var(--primary) 8%, transparent),color-mix(in srgb, var(--chart-2) 8%, transparent))',
      border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)', borderRadius: 28
    },
  }

  const features = [
    { icon: <Brain size={20} />, bg: 'color-mix(in srgb, var(--primary) 12%, transparent)',  title: 'Product-Scoped RAG', desc: 'Every client query searches only their product\'s knowledge base. Powered by pgvector — no cross-product data leakage.' },
    { icon: <Shield size={20} />, bg: 'color-mix(in srgb, var(--chart-2) 12%, transparent)', title: 'Role-Based Access Control', desc: 'Supabase RLS policies enforce strict separation. Clients never see tickets, escalations, or admin configs.' },
    { icon: <Zap size={20} />, bg: 'color-mix(in srgb, var(--ring) 12%, transparent)',  title: 'Auto-Escalation Engine', desc: 'Low confidence scores and critical keywords automatically create tickets routed to the right team.' },
    { icon: <BarChart3 size={20} />, bg: 'color-mix(in srgb, #22c55e 12%, transparent)',  title: 'Audit & Analytics', desc: 'Every interaction is logged with PII redacted — query, response, confidence, category, sentiment.' },
    { icon: <EyeOff size={20} />, bg: 'color-mix(in srgb, #f97316 12%, transparent)', title: 'PII Redaction', desc: 'Email addresses, account numbers, phone numbers, API keys, and JWTs are stripped before processing.' },
    { icon: <FolderOpen size={20} />, bg: 'color-mix(in srgb, #ec4899 12%, transparent)', title: 'KB Ingestion Pipeline', desc: 'Admin uploads docs via webhook — n8n chunks, embeds with text-embedding-3-small, stores in pgvector.' },
  ]

  const steps = [
    { n: '01', title: 'Client sends a message', desc: 'PII is redacted immediately. JWT validated, user\'s product_id fetched from Supabase.' },
    { n: '02', title: 'Query is classified',    desc: 'Category assigned — technical, account, transaction, feature, or escalation.' },
    { n: '03', title: 'Product-scoped vector search', desc: 'match_documents() runs against only this client\'s product knowledge base using pgvector.' },
    { n: '04', title: 'LLM generates reply',    desc: 'GPT-4o-mini composes the response using only retrieved KB context. No hallucination.' },
    { n: '05', title: 'Escalate or respond',    desc: 'If confidence < 0.65 — a ticket is auto-created, escalation logged, team assigned.' },
  ]

  const portals = [
    { tag: <><Globe size={14} /> Public</>, tagStyle: { background:'color-mix(in srgb, var(--ring) 12%, transparent)', color:'var(--ring)', border:'1px solid color-mix(in srgb, var(--ring) 20%, transparent)' }, title: 'Landing Page Chatbot', desc: 'No login required. Answers general company questions.', items: ['Anonymous session tracking','General KB search (no product scope)','Redirects to client portal for support','Audit logged for every interaction'] },
    { tag: <><User size={14} /> Client</>, tagStyle: { background:'color-mix(in srgb, var(--primary) 12%, transparent)', color:'var(--primary)', border:'1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }, title: 'Client Portal', desc: 'Authenticated. Product-scoped RAG specific to each client.', items: ['JWT auth via Supabase Auth','Product-scoped vector search','Request escalation to human','Rate and provide feedback on replies'] },
    { tag: <><Settings size={14} /> Admin</>,  tagStyle: { background:'color-mix(in srgb, var(--chart-2) 12%, transparent)', color:'var(--chart-2)', border:'1px solid color-mix(in srgb, var(--chart-2) 20%, transparent)' }, title: 'Admin Dashboard', desc: 'Full control center — tickets, KB, analytics.', items: ['Analytics — resolution rate, escalations','Ticket & escalation management','KB document ingestion per product','Audit log access & confidence monitoring'] },
  ]

  return (
    <div style={S.page}>
      <BgOrbs />

      <nav style={S.nav}>
        <div style={S.logo}><div style={S.logoDot} /><span>SupportAI</span></div>
        <div style={S.navLinks}>
          {['#features','#how-it-works','#portals','#chat'].map(href => (
            <a key={href} href={href} style={S.navLink}>{href.replace('#','').replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</a>
          ))}
        </div>
        <div style={S.navCta}>
          <button onClick={toggleTheme} style={{ ...S.btnGhost, padding:'0.5rem', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }} title="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link href="/login" style={S.btnGhost}>Client Login</Link>
          <Link href="/admin"  style={S.btnPrimary}>Admin Portal</Link>
        </div>
      </nav>

      <section style={S.hero}>
        <div style={S.badge}><div style={S.badgeDot} />AI-Powered Support Platform</div>
        <h1 style={S.heroTitle}>
          Support that resolves,<br />
          <span className="gradient-text">not just responds</span>
        </h1>
        <p style={S.heroSubtitle}>
          Intelligent multi-product support assistant with product-scoped RAG, auto-escalation,
          and a full admin control center — built for your internal operations.
        </p>
        <div style={S.heroActions}>
          <Link href="/login" style={{ ...S.btnPrimary, ...S.btnLg }}>Access Client Portal</Link>
          <Link href="/admin"  style={{ ...S.btnGhost,   ...S.btnLg }}>Admin Dashboard →</Link>
        </div>
        <div style={S.heroStats}>
          {[['3','Portals'],['RAG','Product-Scoped'],['Auto','Escalation'],['RBAC','Enforced']].map(([v,l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={S.statVal}>{v}</div>
              <div style={S.statLabel}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" style={S.section}>
        <div style={S.sectionInner}>
          <div style={S.sectionLabel}>Platform Capabilities</div>
          <h2 style={S.sectionTitle}>Everything your support team needs</h2>
          <p style={S.sectionSubtitle}>From public chatbot to admin diagnostics — all powered by your internal knowledge base.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '1.25rem', marginTop: '3.5rem' }}>
            {features.map(f => (
              <div key={f.title} style={S.featureCard}>
                <div style={{ ...S.featureIcon, background: f.bg }}>{f.icon}</div>
                <div style={S.featureTitle}>{f.title}</div>
                <div style={S.featureDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" style={{ ...S.section, background: 'var(--card)' }}>
        <div style={{ ...S.sectionInner, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'start' }}>
          <div>
            <div style={S.sectionLabel}>The Flow</div>
            <h2 style={S.sectionTitle}>How it works end-to-end</h2>
            <p style={S.sectionSubtitle}>From the client's question to a resolved ticket — every step automated and logged.</p>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 28, top: 40, bottom: 40, width: 1, background: 'linear-gradient(to bottom,var(--primary),var(--chart-2))' }} />
            {steps.map(s => (
              <div key={s.n} style={S.flowStep}>
                <div style={S.flowNum}>{s.n}</div>
                <div style={{ paddingTop: '0.5rem' }}>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.65 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="portals" style={S.section}>
        <div style={S.sectionInner}>
          <div style={S.sectionLabel}>Three Portals</div>
          <h2 style={S.sectionTitle}>One platform, three interfaces</h2>
          <p style={S.sectionSubtitle}>Each portal has strict RBAC and its own n8n workflow.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '1.5rem', marginTop: '3.5rem' }}>
            {portals.map(p => (
              <div key={p.title} style={S.portalCard}>
                <div style={{ display:'inline-flex', alignItems:'center', padding:'0.25rem 0.75rem', borderRadius:100, fontSize:'0.75rem', fontWeight:600, textTransform:'uppercase' as const, marginBottom:'1.25rem', ...p.tagStyle }}>{p.tag}</div>
                <h3 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.25rem', fontWeight:700, marginBottom:'0.75rem' }}>{p.title}</h3>
                <p style={{ fontSize:'0.875rem', color:'var(--muted-foreground)', lineHeight:1.65, marginBottom:'1.5rem' }}>{p.desc}</p>
                <ul style={{ listStyle:'none', display:'flex', flexDirection:'column' as const, gap:'0.5rem' }}>
                  {p.items.map(item => (
                    <li key={item} style={{ fontSize:'0.8125rem', color:'var(--muted-foreground)', display:'flex', alignItems:'center', gap:8 }}>
                      <Check size={14} style={{ color:'var(--primary)', flexShrink:0 }} />{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="chat" style={S.section}>
        <div style={{ textAlign:'center', marginBottom:'3rem', ...S.z1 }}>
          <div style={S.sectionLabel}>Try It Now</div>
          <h2 style={S.sectionTitle}>Ask anything about our platform</h2>
          <p style={{ ...S.sectionSubtitle, margin:'0 auto' }}>This is the public chatbot — general questions only. Sign in for product-specific support.</p>
        </div>
        <div style={S.chatContainer}>
          <div style={S.chatHeader}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={S.chatAvatar}><Bot size={18} color="white" /></div>
              <div>
                <div style={{ fontWeight:600, fontSize:'0.9rem' }}>SupportAI Assistant</div>
                <div style={{ fontSize:'0.75rem', color:'#22c55e', display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block' }} />Online
                </div>
              </div>
            </div>
            <div style={{ fontSize:'0.75rem', color:'var(--muted-foreground)' }}>Public Chat</div>
          </div>

          <div ref={chatBoxRef} style={S.chatMessages}>
            {messages.map((m, i) => (
              <div key={i} style={{ ...( m.role === 'ai' ? S.msgAi : S.msgUser ), animation: 'fadeIn 0.3s ease' }}>
                <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: m.role === 'ai' ? 'linear-gradient(135deg,var(--primary),var(--chart-2))' : 'color-mix(in srgb, var(--foreground) 10%, transparent)' }}>{m.role === 'ai' ? <Bot size={14} color="white" /> : <User size={14} style={{ color:'var(--muted-foreground)' }} />}</div>
                <div>
                  <div style={m.role === 'ai' ? S.bubbleAi : S.bubbleUser} className="chat-message">{m.role === 'ai' ? <ReactMarkdown>{m.text}</ReactMarkdown> : m.text}</div>
                  <div suppressHydrationWarning style={S.msgTime}>{m.time}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div style={S.msgAi}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,var(--primary),var(--chart-2))', display:'flex', alignItems:'center', justifyContent:'center' }}><Bot size={14} color="white" /></div>
                <div style={{ ...S.bubbleAi, display:'flex', gap:4 }}>
                  {[0,1,2].map(i => <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--muted-foreground)', display:'inline-block', animation:`typing 1.2s infinite ${i*0.2}s` }} />)}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding:'1rem 1.5rem 1.5rem', display:'flex', gap:12, alignItems:'flex-end' }}>
            <textarea
              style={S.chatInput}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Ask a general question about our platform..."
              rows={1}
            />
            <button style={S.sendBtn} onClick={() => sendMessage()}>
              <Send size={18} color="white" />
            </button>
          </div>
        </div>
      </section>

      <section style={{ ...S.section, textAlign: 'center' }}>
        <div style={S.ctaCard}>
          <h2 style={{ fontFamily:'Inter,sans-serif', fontSize:'2rem', fontWeight:700, marginBottom:'1rem' }}>Ready to get started?</h2>
          <p style={{ color:'var(--muted-foreground)', marginBottom:'2rem' }}>Sign in to the client portal or head to the admin dashboard to configure your products.</p>
          <div style={{ display:'flex', gap:'1rem', justifyContent:'center', flexWrap:'wrap' as const }}>
            <Link href="/login" style={{ ...S.btnPrimary, ...S.btnLg }}>Client Portal</Link>
            <Link href="/admin"  style={{ ...S.btnGhost,  ...S.btnLg }}>Admin Dashboard</Link>
          </div>
        </div>
      </section>

      <footer style={{ position:'relative', zIndex:1, borderTop:'1px solid var(--border)', padding:'2rem 1.5rem', textAlign:'center', color:'var(--muted-foreground)', fontSize:'0.8125rem' }}>
        SupportAI — Internal AI Support Platform &nbsp;·&nbsp; Built with n8n + Supabase + pgvector &nbsp;·&nbsp;
        <Link href="/admin" style={{ color:'var(--primary)', textDecoration:'none' }}>Admin</Link>
      </footer>
    </div>
  )
}
