export default function BgOrbs() {
  const orb: React.CSSProperties = {
    position: 'fixed', borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
  }
  return (
    <>
      <div style={{
        ...orb, width: 700, height: 700, top: -250, left: -150,
        filter: 'blur(150px)', background: 'radial-gradient(circle, var(--orb-primary) 0%, transparent 70%)',
      }} />
      <div style={{
        ...orb, width: 600, height: 600, bottom: -200, right: -150,
        filter: 'blur(150px)', background: 'radial-gradient(circle, var(--orb-secondary) 0%, transparent 70%)',
      }} />
      <div style={{
        ...orb, width: 400, height: 400, top: '40%', left: '60%',
        filter: 'blur(140px)', background: 'radial-gradient(circle, var(--orb-tertiary) 0%, transparent 70%)',
      }} />
      <div style={{
        ...orb, width: 350, height: 350, top: '10%', right: '15%',
        filter: 'blur(120px)', background: 'radial-gradient(circle, var(--orb-quaternary) 0%, transparent 70%)',
      }} />
    </>
  )
}
