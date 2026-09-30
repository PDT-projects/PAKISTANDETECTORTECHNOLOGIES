import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../api/firebase/firebase';
import { TransactionFirebaseService } from '../modules/transactions/models/transactionFirebaseService';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Eye, EyeOff, ArrowLeft, Loader2,
  User, Mail, Lock, ShieldCheck, CheckCircle2, Clock,
} from 'lucide-react';
import { sanitizeNameInput, validateName, validateEmail } from '../utils/validators';

export function RegisterPage() {
  const navigate = useNavigate();

  // Step 1: form, Step 2: success
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const e: Record<string, string> = {};
    const nameVal = validateName(form.fullName, 'Full name', true);
    if (!nameVal.isValid) e.fullName = nameVal.error!;
    const emailVal = validateEmail(form.email, true);
    if (!emailVal.isValid) e.email = emailVal.error!;
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 6) e.password = 'Minimum 6 characters';
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError('');
    if (!validateForm()) return;
    setLoading(true);
    try {
      console.log('🔄 Starting registration for:', form.email.trim());

      // 1. Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      const uid = cred.user.uid;
      console.log('✅ Auth account created, UID:', uid);

      const now = new Date().toISOString();
      const fullName = form.fullName.trim();
      const email = form.email.trim().toLowerCase();

      // 2 & 3. Save user doc + notification IN PARALLEL (fast!)
      const saveUserDoc = setDoc(doc(db, 'users', uid), {
        uid,
        fullName,
        email,
        role: 'user',
        status: 'pending',
        permissions: [],
        branch: '',
        createdAt: now,
      }).then(() => console.log('✅ Firestore user doc saved'))
        .catch(e => console.error('⚠️ User doc save error:', e));

      const sendNotification = TransactionFirebaseService.createNotification({
        type: 'user_registration_pending',
        title: 'New User Registration',
        message: `${fullName} (${email}) has requested access. Approve or reject from User Management.`,
        userId: uid,
        userEmail: email,
        userName: fullName,
        isRead: false,
        createdAt: now,
      }).then(() => console.log('✅ Admin notification generated'))
        .catch(e => console.error('⚠️ Notification error:', e));

      // Wait max 3s — if Firestore is slow, Firebase SDK retries in background
      await Promise.race([
        Promise.allSettled([saveUserDoc, sendNotification]),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);

      // 4. Sign out
      try { await auth.signOut(); } catch (_) {}

      // 5. Show success
      setStep(2);
    } catch (err: any) {
      console.error('❌ Registration failed:', err);
      const code = err?.code || '';
      let msg = err?.message || 'Registration failed. Please try again.';
      if (code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please login.';
      } else if (code === 'auth/weak-password') {
        msg = 'Password is too weak. Use at least 6 characters.';
      } else if (code === 'auth/invalid-email') {
        msg = 'Invalid email address.';
      } else if (code === 'auth/network-request-failed') {
        msg = 'Network error. Check your internet connection.';
      }
      setGeneralError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputStyle = (err?: string): React.CSSProperties => ({
    width: '100%', height: '56px', borderRadius: '16px',
    border: `1.5px solid ${err ? '#ef4444' : '#e5e7eb'}`,
    background: '#fafafa', padding: '0 16px 0 48px',
    fontSize: '15px', color: '#111827', outline: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.2s',
  });

  const iconWrap: React.CSSProperties = {
    position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
    color: '#9ca3af', pointerEvents: 'none', display: 'flex',
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        *{ margin:0; padding:0; box-sizing:border-box; }
        body{ font-family:'Plus Jakarta Sans',sans-serif; overflow:auto; background:#050505; }
        .rp-input:focus{ border-color:#d4af37 !important; background:#fff !important; box-shadow: 0 0 0 4px rgba(212,175,55,0.12) !important; }
        .rp-btn{
          width:100%; height:58px; border:none; border-radius:16px;
          background:linear-gradient(135deg, #f8e08e 0%, #d4af37 45%, #b8860b 100%);
          color:#000; font-size:16px; font-weight:800; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:10px;
          transition:0.25s; font-family:'Plus Jakarta Sans',sans-serif;
          box-shadow:0 12px 30px rgba(212,175,55,0.28);
        }
        .rp-btn:hover:not(:disabled){ transform:translateY(-2px); box-shadow:0 18px 35px rgba(212,175,55,0.38); }
        .rp-btn:disabled{ opacity:0.65; cursor:not-allowed; }
        .rp-btn-outline{
          width:100%; height:58px; border:2px solid #d4af37; border-radius:16px;
          background:transparent; color:#111827; font-size:15px; font-weight:700; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:10px;
          transition:0.25s; font-family:'Plus Jakarta Sans',sans-serif;
        }
        .rp-btn-outline:hover{ background:rgba(212,175,55,0.07); }
        .rp-back{ background:none; border:none; color:#6b7280; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; margin-bottom:24px; font-family:'Plus Jakarta Sans',sans-serif; transition:0.2s; }
        .rp-back:hover{ color:#111827; }
        .rp-spin{ animation:spin2 1s linear infinite; }
        @keyframes spin2{ to{ transform:rotate(360deg); } }
      `}</style>

      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(circle at top left, rgba(212,175,55,0.08), transparent 30%), radial-gradient(circle at bottom right, rgba(212,175,55,0.05), transparent 25%), #050505',
        position: 'relative',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '55px 55px', opacity: 0.4,
        }} />

        <div style={{ width: '100%', maxWidth: '480px', position: 'relative', zIndex: 1 }}>
          <div style={{
            background: '#fff', borderRadius: '32px', padding: '44px 40px',
            boxShadow: '0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
            border: '1px solid rgba(212,175,55,0.1)',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Top gold bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '5px',
              background: 'linear-gradient(90deg, #f8e08e 0%, #d4af37 50%, #b8860b 100%)',
            }} />

            {/* ── STEP 1: Registration Form ── */}
            {step === 1 && (
              <>
                <button className="rp-back" onClick={() => navigate('/login')}>
                  <ArrowLeft size={16} /> Back to Login
                </button>

                {/* Logo + Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '14px', overflow: 'hidden', border: '2px solid #000', flexShrink: 0 }}>
                    <img src="/BullionLogo.jpeg" alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
                      BULLION <span style={{ background: 'linear-gradient(135deg,#f8e08e,#d4af37,#b8860b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ELECTRONICS</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: '2px' }}>Enterprise Finance System</div>
                  </div>
                </div>

                <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', letterSpacing: '-0.05em', marginBottom: '6px' }}>Create Account</h1>
                <p style={{ color: '#6b7280', fontSize: '15px', lineHeight: 1.6, marginBottom: '28px' }}>
                  Register to request access. Admin will review and approve your account.
                </p>

                <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {generalError && (
                    <div style={{
                      backgroundColor: '#fef2f2',
                      border: '1.5px solid #fca5a5',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      color: '#b91c1c',
                      fontSize: '13px',
                      fontWeight: '600',
                      lineHeight: '1.4',
                    }}>
                      ⚠️ {generalError}
                    </div>
                  )}

                  {/* Full Name */}
                  <div>
                    <label htmlFor="register-fullname" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>Full Name</label>
                    <div style={{ position: 'relative' }}>
                      <span style={iconWrap}><User size={17} /></span>
                      <input
                        id="register-fullname"
                        name="fullName"
                        type="text"
                        className="rp-input"
                        style={inputStyle(formErrors.fullName)}
                        placeholder="Enter your full name"
                        value={form.fullName}
                        onChange={e => setForm(p => ({ ...p, fullName: sanitizeNameInput(e.target.value) }))}
                        disabled={loading}
                      />
                    </div>
                    {formErrors.fullName && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{formErrors.fullName}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="register-email" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>Email Address</label>
                    <div style={{ position: 'relative' }}>
                      <span style={iconWrap}><Mail size={17} /></span>
                      <input
                        id="register-email"
                        name="email"
                        type="email"
                        className="rp-input"
                        style={inputStyle(formErrors.email)}
                        placeholder="Enter your email"
                        value={form.email}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        disabled={loading}
                      />
                    </div>
                    {formErrors.email && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{formErrors.email}</p>}
                  </div>

                  {/* Password */}
                  <div>
                    <label htmlFor="register-password" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <span style={iconWrap}><Lock size={17} /></span>
                      <input
                        id="register-password"
                        name="password"
                        type={showPwd ? 'text' : 'password'}
                        className="rp-input"
                        style={{ ...inputStyle(formErrors.password), paddingRight: '48px' }}
                        placeholder="Minimum 6 characters"
                        value={form.password}
                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                        disabled={loading}
                      />
                      <button type="button" onClick={() => setShowPwd(p => !p)}
                        style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex' }}>
                        {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {formErrors.password && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{formErrors.password}</p>}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label htmlFor="register-confirmpassword" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>Confirm Password</label>
                    <div style={{ position: 'relative' }}>
                      <span style={iconWrap}><Lock size={17} /></span>
                      <input
                        id="register-confirmpassword"
                        name="confirmPassword"
                        type={showConfirm ? 'text' : 'password'}
                        className="rp-input"
                        style={{ ...inputStyle(formErrors.confirmPassword), paddingRight: '48px' }}
                        placeholder="Re-enter your password"
                        value={form.confirmPassword}
                        onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                        disabled={loading}
                      />
                      <button type="button" onClick={() => setShowConfirm(p => !p)}
                        style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex' }}>
                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {formErrors.confirmPassword && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{formErrors.confirmPassword}</p>}
                  </div>

                  {/* Info note */}
                  <div style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '14px', padding: '14px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <ShieldCheck size={18} style={{ color: '#d4af37', flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ color: '#6b7280', fontSize: '13px', lineHeight: 1.5 }}>
                      Your registration request will be sent to the admin for approval. You will be able to login once approved.
                    </p>
                  </div>

                  <button id="register-submit-btn" type="submit" className="rp-btn" disabled={loading} style={{ marginTop: '4px' }}>
                    {loading ? <><Loader2 size={18} className="rp-spin" /> Creating Account...</> : 'Request Access'}
                  </button>
                </form>
              </>
            )}

            {/* ── STEP 2: Success / Pending ── */}
            {step === 2 && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  background: 'rgba(212,175,55,0.1)', border: '2px solid rgba(212,175,55,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
                }}>
                  <Clock size={36} style={{ color: '#d4af37' }} />
                </div>
                <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#111827', letterSpacing: '-0.04em', marginBottom: '10px' }}>Request Submitted!</h1>
                <p style={{ color: '#6b7280', fontSize: '15px', lineHeight: 1.7, marginBottom: '8px' }}>
                  Your account has been created and is <strong>pending admin approval</strong>.
                </p>
                <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.6, marginBottom: '32px' }}>
                  The admin will review your request. Once approved, you can login with your credentials.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button className="rp-btn" onClick={() => navigate('/login')}>
                    <CheckCircle2 size={18} /> Go to Login
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', marginTop: '20px' }}>
            © 2024 Bullion Electronics. All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
}
