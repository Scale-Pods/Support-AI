'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient, N8N_BASE } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon, CheckCircle2, XCircle } from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  webhook_path: string | null;
  is_active: boolean;
  status: string;
}

const S: Record<string, React.CSSProperties> = {
  page:      { minHeight:'100vh', background:'var(--background)', color:'var(--foreground)', fontFamily:'Inter,sans-serif' },
  topbar:    { height:60, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.75rem', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.008)' },
  btnGhost:  { padding:'0.4375rem 0.875rem', borderRadius:8, fontSize:'0.8rem', fontWeight:600, cursor:'pointer', border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'var(--muted-foreground)', fontFamily:'Inter,sans-serif' },
  btnPrimary:{ padding:'0.5rem 1rem', borderRadius:8, fontSize:'0.8rem', fontWeight:600, cursor:'pointer', border:'none', background:'linear-gradient(135deg,var(--chart-2),var(--primary))', color:'#fff', fontFamily:'Inter,sans-serif', boxShadow:'0 4px 14px rgba(139,92,246,0.25)' },
  scroll:    { padding:'1.75rem' },
  th:        { textAlign:'left', padding:'0.75rem 0.875rem', color:'var(--muted-foreground)', fontWeight:600, fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid rgba(255,255,255,0.06)' },
  td:        { padding:'0.75rem 0.875rem', borderBottom:'1px solid rgba(255,255,255,0.03)', color:'var(--muted-foreground)', verticalAlign:'middle', fontSize:'0.8125rem' },
  tdLabel:   { padding:'0.75rem 0.875rem', borderBottom:'1px solid rgba(255,255,255,0.03)', color:'var(--foreground)', verticalAlign:'middle', fontSize:'0.8125rem' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem', minWidth:500 },
}

export default function WorkflowsPage() {
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncInfo, setSyncInfo] = useState('');

  useEffect(() => {
    supabase.from('workflows').select('*').order('name')
      .then(({ data }) => setWorkflows((data || []) as Workflow[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    setSyncError('');
    setSyncInfo('');
    try {
      const res = await fetch(`${N8N_BASE}/sync-workflows`, { method: 'POST' });
      const body = await res.text();
      if (!res.ok) throw new Error(`n8n responded ${res.status}: ${body.slice(0,200)}`);
      setSyncInfo(`n8n synced — ${body.length > 0 ? 'got response' : 'empty response'}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to sync workflows';
      setSyncError(msg);
      setSyncing(false);
      return;
    }
    const { data, error } = await supabase.from('workflows').select('*').order('name');
    if (error) setSyncError(`Supabase error: ${error.message}`);
    setWorkflows((data || []) as Workflow[]);
    setSyncInfo(prev => `${prev} | ${(data || []).length} workflows in DB`);
    setSyncing(false);
  };

  const togglePublish = async (id: string, current: string) => {
    await supabase.from('workflows').update({ status: current === 'published' ? 'draft' : 'published' }).eq('id', id);
    const { data } = await supabase.from('workflows').select('*').order('name');
    setWorkflows((data || []) as Workflow[]);
  };

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href="/admin" style={{ fontSize:'0.8375rem', color:'var(--muted-foreground)', textDecoration:'none' }}>&larr; Dashboard</Link>
        </div>
        <button onClick={toggleTheme} style={{ cursor:'pointer', background:'none', border:'none', color:'var(--muted-foreground)', display:'flex', alignItems:'center' }}>
          {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
        </button>
      </div>
      <div style={S.scroll}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.75rem' }}>
          <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.1rem', fontWeight:600, color:'var(--foreground)' }}>Workflows</h1>
          <button onClick={syncNow} disabled={syncing} style={{ ...S.btnPrimary, opacity:syncing?0.6:1, cursor:syncing?'not-allowed':'pointer' }}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        {syncError && <div style={{ padding:'0.75rem 1rem', borderRadius:8, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'var(--destructive)', fontSize:'0.8rem', marginBottom:'1rem' }}>{syncError}</div>}
        {syncInfo && <div style={{ padding:'0.75rem 1rem', borderRadius:8, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', color:'var(--chart-1)', fontSize:'0.8rem', marginBottom:'1rem' }}>{syncInfo}</div>}
        <div style={{ overflowX:'auto' }}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Name</th><th style={S.th}>Path</th><th style={S.th}>Active in n8n</th><th style={S.th}>Status</th><th style={S.th}>Action</th>
            </tr></thead>
            <tbody>
              {workflows.map(w => (
                <tr key={w.id}>
                  <td style={S.tdLabel}>{w.name}</td>
                  <td style={{ ...S.td, fontFamily:'monospace', fontSize:'0.75rem' }}>{w.webhook_path || '\u2014'}</td>
                  <td style={S.td}>{w.is_active ? <CheckCircle2 size={16} color="var(--chart-1)"/> : <XCircle size={16} color="var(--muted-foreground)"/>}</td>
                  <td style={S.td}>{w.status}</td>
                  <td style={S.td}>
                    <button onClick={() => togglePublish(w.id, w.status)}
                      style={{ background:'none', border:'none', color:'var(--muted-foreground)', cursor:'pointer', fontSize:'0.75rem', textDecoration:'underline', fontFamily:'Inter,sans-serif' }}>
                      {w.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
