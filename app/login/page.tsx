'use client'
import { Suspense, useState, useEffect, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { createClient } from '@/lib/supabase'
import BgOrbs from '@/components/BgOrbs'
import { Sun, Moon, Eye, EyeOff } from 'lucide-react'

const noopSubscribe = () => () => {}

export default function LoginPage() {
  return (
    <AuthProvider>
      <Suspense fallback={
        <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--background)', color:'var(--muted-foreground)' }}>
          Loading…
        </div>
      }>
        <LoginForm />
      </Suspense>
    </AuthProvider>
  )
}

function LoginForm() {
  const { user, profile, loading: authLoading, signIn } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [okNotice, setOkNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(() => (searchParams.get('mode') === 'forgot' ? 'forgot' : 'login'))
  const [sentReset, setSentReset] = useState(false)
  const [hideUrlNotice, setHideUrlNotice] = useState(false)
  const [resendEmail, setResendEmail] = useState('')
  const [resendMsg, setResendMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [urlAuthError] = useState<{ type: 'expired' } | { type: 'invalid'; message: string } | null>(() => {
    if (typeof window === 'undefined') return null
    const p = new URLSearchParams(window.location.search)
    if (!p.get('error') && !p.get('error_code')) return null
    return p.get('error_code') === 'otp_expired'
      ? { type: 'expired' }
      : { type: 'invalid', message: p.get('error_description') || 'Authentication link is invalid. Please try again.' }
  })
  const [fullName, setFullName] = useState('')
  const router = useRouter()

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (!p.get('error') && !p.get('error_code')) return
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    url.searchParams.delete('error_code')
    url.searchParams.delete('error_description')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [])

  useEffect(() => {
    if (submitting) {
      const t = setTimeout(() => setSubmitting(false), 15000)
      return () => clearTimeout(t)
    }
  }, [submitting])

  useEffect(() => {
    if (authLoading) return
    if (!user) return
    if (!profile) return
    router.replace(profile.is_admin ? '/admin' : '/client')
  }, [user, profile, authLoading, router])

  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const busy = submitting && !user

  if (authLoading && mounted) {
    return (
      <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--background)', color:'var(--muted-foreground)' }}>
        Loading…
      </div>
    )
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setOkNotice('')
    setSubmitting(true)

    const err = await signIn(email, password)
    if (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const sb = createClient()
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSentReset(true)
  }

  async function handleResend(e: React.FormEvent) {
    e.preventDefault()
    setResendMsg('')
    const sb = createClient()
    const { error } = await sb.auth.resend({ type: 'signup', email: resendEmail })
    if (error) {
      setResendMsg(error.message)
      return
    }
    setResendMsg('Confirmation link sent! Check your inbox.')
    setHideUrlNotice(true)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setOkNotice('')
    if (!fullName.trim()) { setError('Full name is required.'); return }
    setSubmitting(true)

    const sb = createClient()
    const { data, error: signUpError } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/verified` }
    })

    if (signUpError) {
      const msg =
        signUpError.message === 'User already registered'
          ? 'An account with this email already exists. Please sign in.'
          : signUpError.message
      setError(msg)
      setSubmitting(false)
      return
    }

    if (data.user) {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.user.id, email: data.user.email, fullName }),
      })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        setError('Account created but profile setup failed. Please contact support.')
      } else if (json?.existing) {
        setMode('login')
        setError('')
        setSentReset(false)
        setOkNotice('An account with this email already exists. Please sign in.')
      } else {
        setMode('login')
        setError('')
        setSentReset(false)
        setOkNotice('Account created! Please check your inbox and confirm your email address, then sign in.')
      }
    }
    setSubmitting(false)
  }

  const S: Record<string, React.CSSProperties> = {
    wrapper: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', background:'var(--background)' },
    card: { width:'100%', maxWidth:420, position:'relative', zIndex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'2.5rem' },
    logo: { fontFamily:'Inter,sans-serif', fontSize:'1.25rem', fontWeight:700, background:'linear-gradient(135deg,var(--primary),var(--ring))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', display:'flex', alignItems:'center', gap:8, marginBottom:'2rem' },
    dot: { width:7, height:7, borderRadius:'50%', background:'var(--primary)', boxShadow:'0 0 8px var(--primary)', flexShrink:0, WebkitTextFillColor:'initial' },
    label: { display:'block', fontSize:'0.8125rem', fontWeight:500, marginBottom:'0.5rem', color:'var(--muted-foreground)' },
    input: { width:'100%', padding:'0.75rem 1rem', background:'var(--input)', border:'1px solid var(--border)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.9rem', outline:'none', marginBottom:'1.25rem', boxSizing:'border-box' as const },
    btn: { width:'100%', padding:'0.875rem', border:'none', borderRadius:8, color:'#fff', fontFamily:'Inter,sans-serif', fontSize:'0.9375rem', fontWeight:600, cursor:'pointer', boxShadow:'0 0 20px color-mix(in srgb, var(--primary) 30%, transparent)' },
    errorBox: { color:'var(--destructive)', fontSize:'0.8125rem', textAlign:'center', marginTop:'1rem', padding:'0.75rem', background:'color-mix(in srgb, var(--destructive) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--destructive) 20%, transparent)', borderRadius:8 },
    tabRow: { display:'flex', gap:'0.5rem', marginBottom:'1.5rem' },
    tab: { flex:1, padding:'0.5rem', borderRadius:8, fontSize:'0.8125rem', fontWeight:600, textAlign:'center' as const, cursor:'pointer', border:'1px solid var(--border)', background:'transparent', color:'var(--muted-foreground)' },
    tabActive: { background:'color-mix(in srgb, var(--primary) 12%, transparent)', border:'1px solid color-mix(in srgb, var(--primary) 25%, transparent)', color:'var(--primary)' },
    subtitle: { color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'2rem' },
    link: { color:'var(--primary)', textDecoration:'none', cursor:'pointer' },
    footer: { textAlign:'center' as const, marginTop:'1.5rem', fontSize:'0.8125rem', color:'var(--muted-foreground)' },
    switchLink: { color:'var(--primary)', cursor:'pointer', background:'none', border:'none', fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', textDecoration:'underline' },
    resendRow: { display:'flex', gap:8, marginTop:'0.75rem' },
    resendInput: { flex:1, padding:'0.6rem 0.75rem', background:'var(--input)', border:'1px solid var(--border)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.85rem', outline:'none', minWidth:0, boxSizing:'border-box' as const },
    miniBtn: { padding:'0.6rem 0.9rem', border:'none', borderRadius:8, background:'linear-gradient(135deg,var(--primary),var(--ring))', color:'#fff', fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' as const },
    miniLink: { color:'var(--primary)', cursor:'pointer', background:'none', border:'none', padding:0, fontFamily:'Inter,sans-serif', fontSize:'0.8125rem', textDecoration:'underline' },
    forgotRow: { textAlign:'right' as const, marginTop:'-0.5rem', marginBottom:'1rem' },
    okBox: { color:'var(--primary)', fontSize:'0.8125rem', textAlign:'center' as const, marginTop:'1rem', padding:'0.75rem', background:'color-mix(in srgb, var(--primary) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--primary) 20%, transparent)', borderRadius:8 },
    pwWrap: { position:'relative', marginBottom:'1.25rem' },
    eyeBtn: { position:'absolute', right:'0.625rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--muted-foreground)', padding:4, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:0 },
  }

  return (
    <div className="login-page" style={S.wrapper}>
      <BgOrbs />
      <style>{`
        .login-page { padding: 1rem; }
        @media (max-width: 480px) {
          .login-page { padding: 0.75rem; }
          .login-card { padding: 1.75rem 1.25rem !important; }
        }
      `}</style>
      <div className="login-card" style={S.card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={S.logo}><div style={S.dot} /><span>SupportAI</span></div>
          <button onClick={toggleTheme} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:8, width:36, height:36, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }} title="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {mounted && urlAuthError?.type === 'invalid' && !hideUrlNotice && (
          <div style={{ ...S.errorBox, textAlign:'left', marginBottom:'1.25rem' }}>{urlAuthError.message}</div>
        )}

        {mounted && urlAuthError?.type === 'expired' && !hideUrlNotice && (
          <div style={{ ...S.errorBox, textAlign:'left', marginBottom:'1.25rem' }}>
            <div>This link has expired or was already used. Enter your email below to get a new one.</div>
            <form onSubmit={handleResend} style={S.resendRow}>
              <input type="email" value={resendEmail} onChange={e => setResendEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" style={S.resendInput} />
              <button type="submit" style={S.miniBtn}>Resend</button>
            </form>
            {resendMsg && <div style={{ marginTop:'0.5rem', fontSize:'0.8125rem' }}>{resendMsg}</div>}
            <div style={{ marginTop:'0.75rem', fontSize:'0.8125rem', color:'var(--muted-foreground)' }}>
              Need a password reset instead?{' '}
              <button style={S.miniLink} onClick={() => { setHideUrlNotice(true); setResendMsg(''); setMode('forgot') }}>Reset password</button>
            </div>
          </div>
        )}

        {mode !== 'forgot' && (
        <div style={S.tabRow}>
          <div style={{ ...S.tab, ...(mode==='login' ? S.tabActive : {}) }} onClick={() => setMode('login')}>Sign In</div>
          <div style={{ ...S.tab, ...(mode==='signup' ? S.tabActive : {}) }} onClick={() => setMode('signup')}>Create Account</div>
        </div>
        )}

        {mode === 'forgot' ? (
          <>
            <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.5rem' }}>Reset password</h1>
            <p style={S.subtitle}>Enter your email and we&apos;ll send you a link to set a new password.</p>
            {sentReset ? (
              <div style={S.okBox}>Reset link sent! Check your inbox — the link opens a page where you can set a new password.</div>
            ) : (
              <form onSubmit={handleForgot}>
                <label style={S.label}>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" style={S.input} />
                <button type="submit" disabled={busy} style={{ ...S.btn, background: busy ? 'color-mix(in srgb, var(--primary) 50%, transparent)' : 'linear-gradient(135deg,var(--primary),var(--chart-2))', cursor: busy ? 'not-allowed' : 'pointer' }}>
                  {busy ? 'Sending…' : 'Send Reset Link →'}
                </button>
              </form>
            )}
            <div style={{ marginTop:'1rem', textAlign:'center' as const }}>
              <button style={S.miniLink} onClick={() => { setMode('login'); setError(''); setSentReset(false) }}>← Back to sign in</button>
            </div>
          </>
        ) : mode === 'login' ? (
          <>
            <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.5rem' }}>Welcome back</h1>
            <p style={S.subtitle}>Sign in to access AI support for your product.</p>
            <form onSubmit={handleLogin}>
              <label style={S.label}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" style={S.input} />
              <label style={S.label}>Password</label>
              <div style={S.pwWrap}>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" style={{ ...S.input, marginBottom:0, paddingRight:'2.75rem' }} />
                <button type="button" onClick={() => setShowPassword(v => !v)} style={S.eyeBtn} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button type="submit" disabled={busy} style={{ ...S.btn, background: busy ? 'color-mix(in srgb, var(--primary) 50%, transparent)' : 'linear-gradient(135deg,var(--primary),var(--chart-2))', cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Signing in…' : 'Sign In →'}
              </button>
            </form>
            <div style={S.forgotRow}>
              <button style={S.miniLink} onClick={() => { setMode('forgot'); setError('') }}>Forgot password?</button>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.5rem' }}>Create Account</h1>
            <p style={S.subtitle}>Sign up to get AI support for your product.</p>
            <form onSubmit={handleSignUp}>
              <label style={S.label}>Full name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Doe" required style={S.input} />
              <label style={S.label}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" style={S.input} />
              <label style={S.label}>Password</label>
              <div style={S.pwWrap}>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6} autoComplete="new-password" style={{ ...S.input, marginBottom:0, paddingRight:'2.75rem' }} />
                <button type="button" onClick={() => setShowPassword(v => !v)} style={S.eyeBtn} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button type="submit" disabled={busy} style={{ ...S.btn, background: busy ? 'color-mix(in srgb, var(--ring) 50%, transparent)' : 'linear-gradient(135deg,var(--ring),var(--primary))', cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Creating account…' : 'Create Account →'}
              </button>
            </form>
          </>
        )}

        {error && <div style={S.errorBox}>{error}</div>}
        {okNotice && <div style={S.okBox}>{okNotice}</div>}

        <div style={S.footer}>
          <Link href="/" style={S.link}>← Back to Home</Link>
          {mode === 'login' && (
            <span style={{ marginLeft:'1rem' }}>
              No account?{' '}
              <button style={S.switchLink} onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
