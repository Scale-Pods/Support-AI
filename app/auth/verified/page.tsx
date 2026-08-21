'use client'
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import BgOrbs from '@/components/BgOrbs'
import { CheckCircle2, AlertTriangle, Mail } from 'lucide-react'

export default function AuthVerifiedPage() {
  return (
    <Suspense fallback={
      <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--background)', color:'var(--muted-foreground)' }}>
        Loading…
      </div>
    }>
      <VerifiedContent />
    </Suspense>
  )
}

function VerifiedContent() {
  const searchParams = useSearchParams()
  const expired = searchParams.get('error_code') === 'otp_expired' || searchParams.get('error') === 'access_denied'

  const S: Record<string, React.CSSProperties> = {
    wrapper: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', background:'var(--background)', padding:'1rem' },
    card: { width:'100%', maxWidth:440, position:'relative', zIndex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:20, padding:'2.5rem', textAlign:'center' as const },
    logo: { fontFamily:'Inter,sans-serif', fontSize:'1.25rem', fontWeight:700, background:'linear-gradient(135deg,var(--primary),var(--ring))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', display:'inline-flex', alignItems:'center', gap:8, marginBottom:'2rem' },
    dot: { width:7, height:7, borderRadius:'50%', background:'var(--primary)', boxShadow:'0 0 8px var(--primary)', flexShrink:0 },
    iconWrap: { width:64, height:64, borderRadius:'50%', margin:'0 auto 1.25rem', display:'flex', alignItems:'center', justifyContent:'center' },
    okIcon: { background:'color-mix(in srgb, var(--primary) 12%, transparent)', border:'1px solid color-mix(in srgb, var(--primary) 30%, transparent)', color:'var(--primary)' },
    warnIcon: { background:'color-mix(in srgb, var(--destructive) 10%, transparent)', border:'1px solid color-mix(in srgb, var(--destructive) 30%, transparent)', color:'var(--destructive)' },
    h1: { fontFamily:'Inter,sans-serif', fontSize:'1.5rem', fontWeight:700, marginBottom:'0.5rem' },
    sub: { color:'var(--muted-foreground)', fontSize:'0.875rem', lineHeight:1.6, marginBottom:'2rem' },
    btn: { display:'block', width:'100%', padding:'0.875rem', border:'none', borderRadius:8, color:'#fff', fontFamily:'Inter,sans-serif', fontSize:'0.9375rem', fontWeight:600, cursor:'pointer', textDecoration:'none', boxSizing:'border-box' as const, boxShadow:'0 0 20px color-mix(in srgb, var(--primary) 30%, transparent)', background:'linear-gradient(135deg,var(--primary),var(--chart-2))' },
    ghostLink: { display:'inline-block', marginTop:'1rem', fontSize:'0.8125rem', color:'var(--muted-foreground)', textDecoration:'none' },
  }

  return (
    <div style={S.wrapper}>
      <BgOrbs />
      <div style={S.card}>
        <div style={S.logo}><div style={S.dot} /><span>SupportAI</span></div>
        {expired ? (
          <>
            <div style={{ ...S.iconWrap, ...S.warnIcon }}><AlertTriangle size={28} /></div>
            <h1 style={S.h1}>Link expired</h1>
            <p style={S.sub}>This confirmation link is invalid or has already been used. If you already confirmed, just sign in below — otherwise request a new email from the sign-up page.</p>
            <Link href="/login" style={S.btn}>Go to Login →</Link>
          </>
        ) : (
          <>
            <div style={{ ...S.iconWrap, ...S.okIcon }}><CheckCircle2 size={30} /></div>
            <h1 style={S.h1}>Email verified!</h1>
            <p style={S.sub}><Mail size={13} style={{ verticalAlign:'-2px', marginRight:4 }} />Your email address has been confirmed successfully. Your account is now active — sign in to get started with AI support for your product.</p>
            <Link href="/login" style={S.btn}>Go to Login →</Link>
          </>
        )}
        <Link href="/" style={S.ghostLink}>← Back to Home</Link>
      </div>
    </div>
  )
}
