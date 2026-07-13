'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';

interface WorkflowError {
  id: string;
  workflow_name: string;
  node_name: string;
  error_message: string;
  ai_diagnosis: string;
  ai_fix: string;
}

const S: Record<string, React.CSSProperties> = {
  page:   { minHeight:'100vh', background:'var(--background)', color:'var(--foreground)', fontFamily:'Inter,sans-serif' },
  topbar: { height:60, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.75rem', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.008)' },
  scroll: { padding:'1.75rem' },
}

export default function ErrorsPage() {
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();
  const [errors, setErrors] = useState<WorkflowError[]>([]);

  useEffect(() => {
    supabase.from('workflow_errors').select('*').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setErrors((data || []) as WorkflowError[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href="/admin" style={{ fontSize:'0.8375rem', color:'var(--muted-foreground)', textDecoration:'none' }}>&larr; Dashboard</Link>
        </div>
        <button onClick={toggleTheme} style={{ fontSize:'1rem', cursor:'pointer', background:'none', border:'none', color:'var(--muted-foreground)' }}>
          {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
        </button>
      </div>
      <div style={S.scroll}>
        <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.1rem', fontWeight:600, marginBottom:'0.25rem', color:'var(--foreground)' }}>Workflow Errors</h1>
        <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>AI-diagnosed errors from n8n workflow executions.</p>
        {errors.map(e => (
          <div key={e.id} style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.25rem', marginBottom:'0.75rem' }}>
            <p style={{ fontWeight:600, fontSize:'0.875rem', marginBottom:'0.25rem' }}>{e.workflow_name} &mdash; {e.node_name}</p>
            <p style={{ fontSize:'0.8125rem', color:'var(--destructive)', marginBottom:'0.5rem' }}>{e.error_message}</p>
            <p style={{ fontSize:'0.8125rem', color:'var(--muted-foreground)', marginBottom:'0.25rem' }}><b style={{ color:'var(--foreground)' }}>AI Diagnosis:</b> {e.ai_diagnosis}</p>
            <p style={{ fontSize:'0.8125rem', color:'var(--muted-foreground)' }}><b style={{ color:'var(--foreground)' }}>Fix:</b> {e.ai_fix}</p>
          </div>
        ))}
        {errors.length === 0 && (
          <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem' }}>No errors recorded yet.</p>
        )}
      </div>
    </div>
  );
}
