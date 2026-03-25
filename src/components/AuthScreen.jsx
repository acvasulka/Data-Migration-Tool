import { useState } from 'react';
import { supabase } from '../supabase';

const NAVY = '#041662';
const ORANGE = '#CF4A12';

export default function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'

  // signin fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // signup fields
  const [fullName, setFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // forgot fields
  const [forgotEmail, setForgotEmail] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleSignIn = async e => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setLoading(false);
  };

  const handleSignUp = async e => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: { data: { full_name: fullName } },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setSuccess('Check your email to confirm your account, then sign in.');
    setMode('signin');
    setLoading(false);
  };

  const handleForgot = async e => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin,
    });
    if (err) setError(err.message);
    else setSuccess('Check your email for a reset link.');
    setLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 6,
    border: '1px solid #D1D5DB', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const btnStyle = {
    width: '100%', padding: '10px', fontSize: 14, fontWeight: 500,
    background: ORANGE, color: '#fff', border: 'none', borderRadius: 6,
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const labelStyle = { fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' };

  const fieldStyle = { marginBottom: 14 };

  return (
    <div style={{
      minHeight: '100vh', background: '#F5F5F5', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#fff', borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)', overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{
          height: 52, background: NAVY, display: 'flex',
          alignItems: 'center', paddingLeft: 20,
        }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>
            FMX Data Migration Tool
          </span>
        </div>

        <div style={{ padding: '0 28px 28px' }}>

          {/* FORGOT MODE */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 18, color: '#111' }}>
                Reset your password
              </h2>
              <div style={fieldStyle}>
                <label style={labelStyle}>Email</label>
                <input
                  style={inputStyle} type="email" required
                  value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {error && <p style={{ color: '#DC2626', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
              {success && <p style={{ color: '#16A34A', fontSize: 13, margin: '0 0 12px' }}>{success}</p>}
              <button type="submit" style={btnStyle} disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
                <button
                  type="button"
                  onClick={() => { clearMessages(); setMode('signin'); }}
                  style={{ background: 'none', border: 'none', color: ORANGE, cursor: 'pointer', fontSize: 13, padding: 0 }}
                >
                  ← Back to sign in
                </button>
              </p>
            </form>
          )}

          {/* SIGNIN / SIGNUP TABS */}
          {mode !== 'forgot' && (
            <>
              {/* Tab bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: 22 }}>
                {[['signin', 'Sign in'], ['signup', 'Create account']].map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { clearMessages(); setMode(m); }}
                    style={{
                      flex: 1, padding: '14px 0', fontSize: 14, background: 'none', border: 'none',
                      borderBottom: mode === m ? `2px solid ${ORANGE}` : '2px solid transparent',
                      fontWeight: mode === m ? 700 : 400,
                      color: mode === m ? ORANGE : '#6B7280',
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* SIGN IN FORM */}
              {mode === 'signin' && (
                <form onSubmit={handleSignIn}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Email</label>
                    <input
                      style={inputStyle} type="email" required
                      value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Password</label>
                    <input
                      style={inputStyle} type="password" required
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  {error && <p style={{ color: '#DC2626', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
                  {success && <p style={{ color: '#16A34A', fontSize: 13, margin: '0 0 12px' }}>{success}</p>}
                  <button type="submit" style={btnStyle} disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign in'}
                  </button>
                  <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
                    <button
                      type="button"
                      onClick={() => { clearMessages(); setMode('forgot'); }}
                      style={{ background: 'none', border: 'none', color: ORANGE, cursor: 'pointer', fontSize: 13, padding: 0 }}
                    >
                      Forgot password?
                    </button>
                  </p>
                </form>
              )}

              {/* SIGN UP FORM */}
              {mode === 'signup' && (
                <form onSubmit={handleSignUp}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Full name</label>
                    <input
                      style={inputStyle} type="text" required
                      value={fullName} onChange={e => setFullName(e.target.value)}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Email</label>
                    <input
                      style={inputStyle} type="email" required
                      value={signupEmail} onChange={e => setSignupEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Password</label>
                    <input
                      style={inputStyle} type="password" required minLength={8}
                      value={signupPassword} onChange={e => setSignupPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                  {error && <p style={{ color: '#DC2626', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
                  {success && <p style={{ color: '#16A34A', fontSize: 13, margin: '0 0 12px' }}>{success}</p>}
                  <button type="submit" style={btnStyle} disabled={loading}>
                    {loading ? 'Creating account…' : 'Create account'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
