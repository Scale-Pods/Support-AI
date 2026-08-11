'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  webhook_path: string | null;
}

const S: Record<string, React.CSSProperties> = {
  page:   { minHeight:'100vh', background:'var(--background)', color:'var(--foreground)', fontFamily:'Inter,sans-serif' },
  topbar: { height:60, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.75rem', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.008)' },
  scroll: { padding:'1.75rem' },
  item:   { display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem', borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'0.875rem 0' },
}

export default function AssignWorkflows() {
  const { id } = useParams();
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();
  const [published, setPublished] = useState<Workflow[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('workflows').select('*').eq('status', 'published'),
      supabase.from('product_workflows').select('workflow_id').eq('product_id', id),
    ]).then(([pubRes, assignRes]) => {
      setPublished((pubRes.data || []) as Workflow[]);
      setAssigned((assignRes.data || []).map(a => a.workflow_id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleAssign = async (workflowId: string, isAssigned: boolean) => {
    if (isAssigned) {
      await supabase.from('product_workflows').delete().eq('product_id', id).eq('workflow_id', workflowId);
    } else {
      await supabase.from('product_workflows').insert({ product_id: id, workflow_id: workflowId });
    }
    const [pubRes, assignRes] = await Promise.all([
      supabase.from('workflows').select('*').eq('status', 'published'),
      supabase.from('product_workflows').select('workflow_id').eq('product_id', id),
    ]);
    setPublished((pubRes.data || []) as Workflow[]);
    setAssigned((assignRes.data || []).map(a => a.workflow_id));
  };

  return (
    <div style={S.page}>
      <style>{`
        @media (max-width: 768px) {
          .pw-scroll { padding: 1rem !important; }
          .pw-topbar { padding: 0 1rem !important; }
        }
      `}</style>
      <div className="pw-topbar" style={S.topbar}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href="/admin/products" style={{ fontSize:'0.8375rem', color:'var(--muted-foreground)', textDecoration:'none' }}>&larr; Products</Link>
        </div>
        <button onClick={toggleTheme} style={{ cursor:'pointer', background:'none', border:'none', color:'var(--muted-foreground)', display:'flex', alignItems:'center' }}>
          {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
        </button>
      </div>
      <div className="pw-scroll" style={S.scroll}>
        <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.1rem', fontWeight:600, marginBottom:'1.5rem', color:'var(--foreground)' }}>Assign Workflows</h1>
        {published.length === 0 && <p style={{ color:'var(--muted-foreground)', fontSize:'0.875rem' }}>No published workflows. Publish one first.</p>}
        {published.map(w => {
          const isAssigned = assigned.includes(w.id);
          return (
            <div key={w.id} style={S.item}>
              <div>
                <span style={{ fontSize:'0.875rem' }}>{w.name}</span>
                <span style={{ color:'var(--muted-foreground)', fontSize:'0.75rem', marginLeft:'0.5rem' }}>({w.webhook_path})</span>
              </div>
              <button onClick={() => toggleAssign(w.id, isAssigned)}
                style={{
                  fontSize:'0.75rem', padding:'0.3125rem 0.75rem', borderRadius:6, cursor:'pointer',
                  border:'1px solid', fontFamily:'Inter,sans-serif', fontWeight:600,
                  background: isAssigned ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                  borderColor: isAssigned ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                  color: isAssigned ? 'var(--destructive)' : 'var(--chart-1)',
                }}>
                {isAssigned ? 'Remove' : 'Assign'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
