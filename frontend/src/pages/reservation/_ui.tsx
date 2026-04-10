/**
 * Reservation 系ページの共通 UI パーツ。
 * (admin と public 両方で使い回す)
 */
import type { CSSProperties, ReactNode } from 'react';

export const inputStyle: CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};

export const labelStyle: CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  marginBottom: 4,
};

export const cardStyle: CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      {children}
    </label>
  );
}

export function ModalOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, padding: 24,
          width: '90%', maxWidth: 460, maxHeight: '90vh', overflow: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#64748b', padding: 20, textAlign: 'center',
    }}>
      {children}
    </div>
  );
}

export function TabBar({
  tabs, active, onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid #0ea5e9' : '2px solid transparent',
              color: isActive ? '#0ea5e9' : '#475569',
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function StoreHeader({ store }: { store: { name: string; address: string | null; phone: string | null } }) {
  return (
    <header style={{ marginBottom: 20, textAlign: 'center' }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{store.name}</h1>
      {store.address && <div style={{ fontSize: 12, color: '#64748b' }}>{store.address}</div>}
      {store.phone && <div style={{ fontSize: 12, color: '#64748b' }}>☎ {store.phone}</div>}
    </header>
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
