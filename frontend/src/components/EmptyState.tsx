import { Icon } from './Icon';

export function EmptyState({ icon = 'check', title, body }: { icon?: string; title: string; body: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--sev-good-soft)', color: 'var(--sev-good)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} />
      </span>
      <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
      <div style={{ color: 'var(--text-2)', fontSize: 14, maxWidth: 420, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
