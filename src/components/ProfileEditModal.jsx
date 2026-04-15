import { useState } from 'react';
import { supabase } from '../supabase';
import { updateProfileName } from '../db';

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const GREEN = '#1A7F4E';

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 6,
  border: '1px solid #D1D5DB', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: NAVY, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
      {children}
    </div>
  );
}

function StatusLine({ status, msg }) {
  if (!status) return null;
  return (
    <p style={{ fontSize: 12, color: status === 'ok' ? GREEN : '#DC2626', margin: '6px 0 0' }}>{msg}</p>
  );
}

function SaveBtn({ label, onClick, disabled, saving }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || saving}
      style={{
        fontSize: 13, padding: '7px 16px', borderRadius: 6,
        background: ORANGE, color: '#fff', border: 'none',
        cursor: (disabled || saving) ? 'not-allowed' : 'pointer',
        opacity: (disabled || saving) ? 0.5 : 1, marginTop: 8,
      }}
    >
      {saving ? 'Saving…' : label}
    </button>
  );
}

export default function ProfileEditModal({ user, profile, onClose, onProfileUpdated }) {
  // Name
  const [name, setName] = useState(profile?.full_name || user?.user_metadata?.full_name || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameStatus, setNameStatus] = useState(null);
  const [nameMsg, setNameMsg] = useState('');

  // Email
  const [email, setEmail] = useState(user?.email || '');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailMsg, setEmailMsg] = useState('');

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwStatus, setPwStatus] = useState(null);
  const [pwMsg, setPwMsg] = useState('');

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setNameSaving(true); setNameStatus(null);
    const updated = await updateProfileName(user.id, name.trim());
    if (updated) {
      // Also update auth metadata so the workspace header (which reads user_metadata) stays consistent
      try { await supabase.auth.updateUser({ data: { full_name: name.trim() } }); } catch {}
      setNameStatus('ok');
      setNameMsg('Display name updated');
      onProfileUpdated?.(updated);
    } else {
      setNameStatus('fail');
      setNameMsg('Could not update name');
    }
    setNameSaving(false);
  };

  const handleSaveEmail = async () => {
    if (!email.trim() || email.trim() === user.email) return;
    setEmailSaving(true); setEmailStatus(null);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) {
      setEmailStatus('fail');
      setEmailMsg(error.message);
    } else {
      setEmailStatus('ok');
      setEmailMsg('Check your email to confirm the change.');
    }
    setEmailSaving(false);
  };

  const handleSavePassword = async () => {
    if (newPassword.length < 8) {
      setPwStatus('fail');
      setPwMsg('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwStatus('fail');
      setPwMsg('Passwords do not match');
      return;
    }
    setPwSaving(true); setPwStatus(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwStatus('fail');
      setPwMsg(error.message);
    } else {
      setPwStatus('ok');
      setPwMsg('Password updated');
      setNewPassword(''); setConfirmPassword('');
    }
    setPwSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', width: '100%', maxWidth: 480, padding: '24px 28px', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Edit profile</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Name */}
        <Section title="Display name">
          <input
            style={inputStyle}
            value={name}
            onChange={e => { setName(e.target.value); setNameStatus(null); }}
            placeholder="Your name"
          />
          <StatusLine status={nameStatus} msg={nameMsg} />
          <SaveBtn label="Save name" onClick={handleSaveName} disabled={!name.trim() || name.trim() === (profile?.full_name || '')} saving={nameSaving} />
        </Section>

        {/* Email */}
        <Section title="Email">
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailStatus(null); }}
            placeholder="you@example.com"
          />
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '4px 0 0' }}>
            Changing email triggers a confirmation message to the new address.
          </p>
          <StatusLine status={emailStatus} msg={emailMsg} />
          <SaveBtn label="Save email" onClick={handleSaveEmail} disabled={!email.trim() || email.trim() === user.email} saving={emailSaving} />
        </Section>

        {/* Password */}
        <Section title="Password">
          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>New password</label>
          <input
            style={{ ...inputStyle, marginBottom: 10 }}
            type="password"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); setPwStatus(null); }}
            placeholder="At least 8 characters"
          />
          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Confirm new password</label>
          <input
            style={inputStyle}
            type="password"
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); setPwStatus(null); }}
            placeholder="Re-enter password"
          />
          <StatusLine status={pwStatus} msg={pwMsg} />
          <SaveBtn label="Update password" onClick={handleSavePassword} disabled={!newPassword || !confirmPassword} saving={pwSaving} />
        </Section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{ background: '#fff', color: '#6B7280', border: '1px solid #D1D5DB', borderRadius: 6, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}
