'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import BgOrbs from '@/components/BgOrbs'
import { Eye, EyeOff } from 'lucide-react'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.warn('Recovery link check failed:', error.message)
      setHasSession(!!session)
      setReady(true)
    })
  }, [])

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)

    const sb = createClient()
    const { error: updateError } = await sb.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setSubmitting(false)
      return
    }

    let isAdmin = false
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data: profile } = await sb.from('users').select('is_admin').eq('id', user.id).single()
      isAdmin = !!profile?.is_admin
    }
    setDone(true)
    setTimeout(() => router.replace(isAdmin ? '/admin' : '/client'), 1200)
  }

  const S: Record<string, React.CSSProperties> = {
    wrapper: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', background:'var(--background)', padding:'1rem' },
    card: { width:'100%', maxWidth:420, position:'relative', zIndex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'2.5rem' },
    logo: { fontFamily:'Inter,sans-serif', fontSize:'1.25rem', fontWeight:700, background:'linear-gradient(135deg,var(--primary),var(--ring))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', display:'flex', alignItems:'center', gap:8, marginBottom:'2rem' },
    dot: { width:7, height:7, borderRadius:'50%', background:'var(--primary)', boxShadow:'0 0 8px var(--primary)', flexShrink:0 },
    label: { display:'block', fontSize:'0.8125rem', fontWeight:500, marginBottom:'0.5rem', color:'var(--muted-foreground)' },
    input: { width:'100%', padding:'0.75rem 1rem', background:'var(--input)', border:'1px solid var(--border)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.9rem', outline:'none', marginBottom:'1.25rem', boxSizing:'border-box' as const },
    btn: { width:'100%', padding:'0.875rem', border:'none', borderRadius:8, color:'#fff', fontFamily:'Inter,sans-serif', fontSize:'0.9375rem', fontWeight:600, cursor:'pointer', boxShadow:'0 0 20px color-mix(in srgb, var(--primary) 30%, transparent)' },
    errorBox: { color:'var(--destructive)', fontSize:'0.8125rem', textAlign:'center', marginTop:'1rem', padding:'0.75rem', background:'color-mix(in srgb, var(--destructive) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--destructive) 20%, transparent)', borderRadius:8 },
    okBox: { color:'var(--primary)', fontSize:'0.8125rem', textAlign:'center', marginTop:'1rem', padding:'0.75rem', background:'color-mix(in srgb, var(--primary) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--primary) 20%, transparent)', borderRadius:8 },
    pwWrap: { position:'relative', marginBottom:'1.25rem' },
    eyeBtn: { position:'absolute', right:'0.625rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--muted-foreground)', padding:4, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:0 },
    subtitle: { color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'2rem' },
    center: { textAlign:'center' as const },
    loading: { height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--background)', color:'var(--muted-foreground)' },
  }

  return (
    <div style={S.wrapper}>
      <BgOrbs />
      {!ready ? (
        <div style={S.loading}>Loading…</div>
      ) : !hasSession ? (
        <div style={S.card}>
          <div style={S.logo}><div style={S.dot} /><span>SupportAI</span></div>
          <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.5rem' }}>Link invalid</h1>
          <p style={S.subtitle}>This password reset link is invalid, expired, or was already used.</p>
          <div style={S.center}>
            <Link href="/login?mode=forgot" style={{ color:'var(--primary)' }}>Request a new reset link</Link>
            {' · '}
            <Link href="/login" style={{ color:'var(--primary)' }}>Back to sign in</Link>
          </div>
        </div>
      ) : done ? (
        <div style={S.card}>
          <div style={S.logo}><div style={S.dot} /><span>SupportAI</span></div>
          <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.5rem' }}>Password updated</h1>
          <div style={S.okBox}>Success! Taking you to your workspace…</div>
        </div>
      ) : (
        <div style={S.card}>
          <div style={S.logo}><div style={S.dot} /><span>SupportAI</span></div>
          <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.5rem' }}>Set a new password</h1>
          <p style={S.subtitle}>Choose a strong password for your account.</p>
          <form onSubmit={handleUpdate}>
            <label style={S.label}>New password</label>
            <div style={S.pwWrap}>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" style={{ ...S.input, marginBottom:0, paddingRight:'2.75rem' }} />
              <button type="button" onClick={() => setShowPassword(v => !v)} style={S.eyeBtn} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} tabIndex={-1}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <label style={S.label}>Confirm new password</label>
            <div style={{ ...S.pwWrap }}>
              <input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" style={{ ...S.input, marginBottom:0, paddingRight:'2.75rem' }} />
              <button type="button" onClick={() => setShowPassword(v => !v)} style={S.eyeBtn} aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} title={showPassword ? 'Hide passwords' : 'Show passwords'} tabIndex={-1}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button type="submit" disabled={submitting} style={{ ...S.btn, background: submitting ? 'color-mix(in srgb, var(--primary) 50%, transparent)' : 'linear-gradient(135deg,var(--primary),var(--chart-2))', cursor: submitting ? 'not-allowed' : 'pointer' }}>
              {submitting ? 'Updating…' : 'Update Password →'}
            </button>
          </form>
          {error && <div style={S.errorBox}>{error}</div>}
        </div>
      )}
    </div>
  )
}
