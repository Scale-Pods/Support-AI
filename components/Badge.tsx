interface BadgeProps {
  children: React.ReactNode
  variant?: 'blue'|'purple'|'cyan'|'green'|'yellow'|'red'|'orange'|'gray'
  className?: string
}

const colors: Record<string, string> = {
  blue:   'background:color-mix(in srgb, var(--primary) 12%, transparent);color:var(--primary)',
  purple: 'background:color-mix(in srgb, var(--chart-2) 12%, transparent);color:var(--chart-2)',
  cyan:   'background:color-mix(in srgb, var(--ring) 12%, transparent);color:var(--ring)',
  green:  'background:color-mix(in srgb, #22c55e 12%, transparent);color:#22c55e',
  yellow: 'background:color-mix(in srgb, #eab308 12%, transparent);color:#eab308',
  red:    'background:color-mix(in srgb, var(--destructive) 12%, transparent);color:var(--destructive)',
  orange: 'background:color-mix(in srgb, #f97316 12%, transparent);color:#f97316',
  gray:   'background:color-mix(in srgb, var(--foreground) 6%, transparent);color:var(--muted-foreground)',
}

export default function Badge({ children, variant = 'gray', className = '' }: BadgeProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '0.125rem 0.5rem', borderRadius: 100,
        fontSize: '0.7rem', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.04em',
        ...(Object.fromEntries(colors[variant].split(';').map(s => {
          const [k,v] = s.split(':'); return [k.trim(), v?.trim()]
        })))
      }}
    >
      {children}
    </span>
  )
}

const statusMap: Record<string, BadgeProps['variant']> = { open:'blue', in_progress:'yellow', resolved:'green', closed:'gray' }
export function statusBadge(s: string): BadgeProps['variant'] {
  return statusMap[s] || 'gray'
}
const priorityMap: Record<string, BadgeProps['variant']> = { critical:'red', high:'orange', medium:'yellow', low:'gray' }
export function priorityBadge(p: string): BadgeProps['variant'] {
  return priorityMap[p] || 'gray'
}
const catMap: Record<string, BadgeProps['variant']> = { technical:'blue', account:'cyan', transaction:'orange', feature:'purple', escalation:'red', general:'gray' }
export function catBadge(c: string): BadgeProps['variant'] {
  return catMap[c] || 'gray'
}
export function confBadge(c: number): BadgeProps['variant'] {
  return c >= 0.7 ? 'green' : c >= 0.45 ? 'yellow' : 'red'
}
const severityMap: Record<string, BadgeProps['variant']> = { critical:'red', high:'orange', medium:'yellow', low:'gray', warning:'yellow', info:'blue' }
export function severityBadge(s: string): BadgeProps['variant'] {
  return severityMap[s?.toLowerCase() ?? ''] || 'gray'
}
