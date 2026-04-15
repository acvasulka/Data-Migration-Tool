import { useState, useRef, useEffect } from 'react';

const NAVY = '#041662';

function computeInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Shared header avatar + dropdown menu.
 * Used by both the landing page (ProjectScreen) and the workspace (App.js).
 */
export default function UserMenu({ user, profile, onOpenProfile, onOpenAdminPanel, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'User';
  const email = user?.email || profile?.email || '';
  const initials = computeInitials(displayName);
  const isAdmin = profile?.role === 'admin';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const menuItemStyle = (color = '#374151') => ({
    width: '100%', textAlign: 'left', padding: '10px 14px',
    fontSize: 13, background: 'none', border: 'none',
    cursor: 'pointer', color,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'block',
  });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={displayName}
        style={{
          width: 32, height: 32, borderRadius: '50%', background: NAVY,
          border: '2px solid rgba(255,255,255,0.4)', color: '#fff',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {initials}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, background: '#fff',
          border: '1px solid #E5E7EB', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 220,
          overflow: 'hidden',
        }}>
          {/* Identity header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
              {displayName}
              {isAdmin && (
                <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 8, background: '#EEF0F8', color: NAVY }}>
                  Admin
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{email}</div>
          </div>

          {/* Menu items */}
          <button
            onClick={() => { setOpen(false); onOpenProfile?.(); }}
            style={menuItemStyle()}
            onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            Edit profile
          </button>

          {isAdmin && (
            <button
              onClick={() => { setOpen(false); onOpenAdminPanel?.(); }}
              style={menuItemStyle()}
              onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              Admin settings
            </button>
          )}

          <div style={{ borderTop: '1px solid #F3F4F6' }} />

          <button
            onClick={() => { setOpen(false); onSignOut?.(); }}
            style={menuItemStyle('#DC2626')}
            onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
