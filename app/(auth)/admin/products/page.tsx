'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Sun, Moon } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

const S: Record<string, React.CSSProperties> = {
  page:      { minHeight:'100vh', background:'var(--background)', color:'var(--foreground)', fontFamily:'Inter,sans-serif' },
  topbar:    { height:60, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.75rem', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.008)' },
  btnPrimary:{ padding:'0.5rem 1rem', borderRadius:8, fontSize:'0.8rem', fontWeight:600, cursor:'pointer', border:'none', background:'linear-gradient(135deg,var(--chart-2),var(--primary))', color:'#fff', fontFamily:'Inter,sans-serif', boxShadow:'0 4px 14px rgba(139,92,246,0.25)' },
  scroll:    { padding:'1.75rem' },
  th:        { textAlign:'left', padding:'0.75rem 0.875rem', color:'var(--muted-foreground)', fontWeight:600, fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid rgba(255,255,255,0.06)' },
  td:        { padding:'0.75rem 0.875rem', borderBottom:'1px solid rgba(255,255,255,0.03)', color:'var(--muted-foreground)', verticalAlign:'middle', fontSize:'0.8125rem' },
  tdLabel:   { padding:'0.75rem 0.875rem', borderBottom:'1px solid rgba(255,255,255,0.03)', color:'var(--foreground)', verticalAlign:'middle', fontSize:'0.8125rem' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem', minWidth:400 },
  fInput:    { padding:'0.6875rem 0.875rem', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, color:'var(--foreground)', fontFamily:'Inter,sans-serif', fontSize:'0.875rem', outline:'none' },
}

export default function ProductsPage() {
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/products/list').then(r => r.json()).then(d => setProducts((d.products || []) as Product[]));
  }, []);

  const createProduct = async () => {
    if (!name.trim()) return;
    setError('');
    setLoading(true);
    const slug = name.toLowerCase().trim().replace(/\s+/g, '-');
    console.log('Creating product:', { name: name.trim(), slug, created_by: user?.id });
    try {
      const res = await fetch('/api/products/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug, created_by: user?.id }),
      });
      const body = await res.json();
      console.log('Create response:', res.status, body);
      if (!res.ok) {
        setError(body.error || 'Failed to create product');
        setLoading(false);
        return;
      }
      setName('');
      const d = await fetch('/api/products/list').then(r => r.json());
      setProducts((d.products || []) as Product[]);
      setLoading(false);
    } catch (e) {
      console.error('Create product fetch error:', e);
      setError('Network error: ' + (e instanceof Error ? e.message : String(e)));
      setLoading(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('products').update({ is_active: !current }).eq('id', id);
    const d = await fetch('/api/products/list').then(r => r.json());
    setProducts((d.products || []) as Product[]);
  };

  return (
    <div style={S.page}>
      <style>{`
        @media (max-width: 768px) {
          .p-scroll { padding: 1rem !important; }
          .p-topbar { padding: 0 1rem !important; }
          .p-head { flex-wrap: wrap !important; }
          .p-create { flex-wrap: wrap !important; }
          .p-create input { max-width: 100% !important; flex: 1 1 100% !important; }
        }
      `}</style>
      <div className="p-topbar" style={S.topbar}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href="/admin" style={{ fontSize:'0.8375rem', color:'var(--muted-foreground)', textDecoration:'none' }}>&larr; Dashboard</Link>
        </div>
        <button onClick={toggleTheme} style={{ cursor:'pointer', background:'none', border:'none', color:'var(--muted-foreground)', display:'flex', alignItems:'center' }}>
          {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
        </button>
      </div>
      <div className="p-scroll" style={S.scroll}>
        <div className="p-head" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
          <h1 style={{ fontFamily:'Inter,sans-serif', fontSize:'1.1rem', fontWeight:600, color:'var(--foreground)' }}>Products</h1>
        </div>
        <div className="p-create" style={{ display:'flex', gap:'0.75rem', marginBottom:'1.75rem' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Product name" style={{ ...S.fInput, flex:1, maxWidth:320 }} />
          <button onClick={createProduct} disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Creating...' : 'Create Product'}</button>
        </div>
        {error && <p style={{ color:'#ef4444', fontSize:'0.8rem', marginBottom:'1rem' }}>{error}</p>}
        <div style={{ overflowX:'auto' }}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Name</th><th style={S.th}>Status</th><th style={S.th}>Manage</th>
            </tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td style={S.tdLabel}>{p.name}</td>
                  <td style={S.td}>
                    <span style={{
                      display:'inline-block', padding:'0.125rem 0.5rem', borderRadius:6, fontSize:'0.7rem', fontWeight:600,
                      background: p.is_active ? 'rgba(34,197,94,0.08)' : 'rgba(107,114,128,0.08)',
                      color: p.is_active ? 'var(--chart-1)' : 'var(--muted-foreground)',
                    }}>{p.is_active ? 'Active' : 'Inactive'}</span>
                    &nbsp;
                    <button onClick={() => toggleActive(p.id, p.is_active)}
                      style={{ background:'none', border:'none', color:'var(--muted-foreground)', cursor:'pointer', fontSize:'0.75rem', textDecoration:'underline', fontFamily:'Inter,sans-serif' }}>
                      {p.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                  <td style={S.td}>
                    <Link href={`/admin/products/${p.id}`}
                      style={{ color:'var(--muted-foreground)', fontSize:'0.75rem', textDecoration:'underline', fontFamily:'Inter,sans-serif' }}>
                      Assign Workflows
                    </Link>
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
