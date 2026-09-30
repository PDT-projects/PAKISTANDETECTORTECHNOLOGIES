import { useState } from 'react';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../api/firebase/firebase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

// Company branding for the login screen. Reads from Vite env vars so a
// per-company clone can show its own name/logo without touching this file -
// see .env.example. Falls back to Bullion Electronics when unset, so THIS
// deployment is unaffected.
const COMPANY_NAME_LINE1 = import.meta.env.VITE_COMPANY_NAME_LINE1 || 'BULLION';
const COMPANY_NAME_LINE2 = import.meta.env.VITE_COMPANY_NAME_LINE2 || 'ELECTRONICS';
const COMPANY_TAGLINE = import.meta.env.VITE_COMPANY_TAGLINE || 'Enterprise Finance System';
const COMPANY_DESCRIPTION = import.meta.env.VITE_COMPANY_DESCRIPTION || 'Secure financial management platform built for enterprise operations, reporting, branch monitoring and office workflow management across Abu Dhabi.';
const COMPANY_LOGO = import.meta.env.VITE_COMPANY_LOGO ?? '/BullionLogo.jpeg';
const COMPANY_LOGO_ALT = import.meta.env.VITE_COMPANY_LOGO_ALT || 'Bullion Electronics logo';

import {
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  BarChart2,
  ShieldCheck,
  GitBranch,
  Activity,
  X,
  Mail,
  UserPlus,
} from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (
    user: any,
    role: 'super_admin' | 'user',
    permissions?: string[],
    branch?: string
  ) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !/\S+@\S+\.\S+/.test(forgotEmail)) {
      setForgotError('Please enter a valid email address');
      toast.error('Please enter a valid email address');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      await sendPasswordResetEmail(auth, forgotEmail);
      setForgotSent(true);
      toast.success('Password reset email sent successfully!');
    } catch (err: any) {
      console.error("Forgot password error:", err);
      if (err.code === 'auth/user-not-found') {
        setForgotError('No account found with this email.');
        toast.error('No account found with this email.');
      } else {
        const errorMsg = err.message || 'Failed to send reset email. Try again.';
        setForgotError(errorMsg);
        toast.error(errorMsg);
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotEmail('');
    setForgotSent(false);
    setForgotError('');
  };

  const validateForm = () => {
    const newErrors: {
      email?: string;
      password?: string;
    } = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, 'users', user.uid));

      if (!userDoc.exists()) {
        await signOut(auth);

        setErrors({
          general:
            'Access denied. You are not authorized to use this system.',
        });

        setIsLoading(false);
        return;
      }

      const userData = userDoc.data();

      // Check if user is pending or rejected
      if (userData.status === 'pending') {
        await signOut(auth);
        setErrors({
          general: 'Your account is pending admin approval. Please wait for the admin to approve your request.',
        });
        setIsLoading(false);
        return;
      }

      if (userData.status === 'rejected') {
        await signOut(auth);
        setErrors({
          general: 'Your registration request has been rejected by the admin.',
        });
        setIsLoading(false);
        return;
      }

      const isAdminEmail = user.email?.toLowerCase() === 'bullion@gmail.com';
      const rawRole = userData.role as string;

      const role: 'super_admin' | 'user' =
        isAdminEmail || rawRole === 'super_admin' || rawRole === 'superAdmin'
          ? 'super_admin'
          : 'user';

      const permissions: string[] = userData.permissions || [];
      const branch: string = userData.branch || '';

      localStorage.setItem(
        'userInfo',
        JSON.stringify({
          uid: user.uid,
          email: user.email,
          role,
          permissions,
          branch,
        })
      );

      toast.success('Login successful');

      onLoginSuccess(user, role, permissions, branch);

      navigate('/dashboard');
    } catch (error: any) {
      // Auto-bootstrap bullion@gmail.com on first login if it doesn't exist in Firebase Auth
      if (
        formData.email.trim().toLowerCase() === 'bullion@gmail.com' &&
        formData.password === '123456' &&
        (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')
      ) {
        try {
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          const { setDoc } = await import('firebase/firestore');
          const cred = await createUserWithEmailAndPassword(auth, 'bullion@gmail.com', '123456');
          await setDoc(doc(db, 'users', cred.user.uid), {
            uid: cred.user.uid,
            fullName: 'Bullion Admin',
            email: 'bullion@gmail.com',
            role: 'super_admin',
            status: 'approved',
            permissions: [],
            branch: '',
            createdAt: new Date().toISOString(),
          });
          localStorage.setItem(
            'userInfo',
            JSON.stringify({
              uid: cred.user.uid,
              email: 'bullion@gmail.com',
              role: 'super_admin',
              permissions: [],
              branch: '',
            })
          );
          toast.success('Admin account initialized & logged in!');
          onLoginSuccess(cred.user, 'super_admin', [], '');
          navigate('/dashboard');
          return;
        } catch (createErr) {
          console.error('Auto admin bootstrap failed:', createErr);
        }
      }

      let errorMessage = 'Login failed';

      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          errorMessage = 'Incorrect email or password';
          break;

        case 'auth/invalid-email':
          errorMessage = 'Invalid email address';
          break;

        case 'auth/user-disabled':
          errorMessage = 'Account disabled';
          break;

        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts';
          break;

        case 'auth/network-request-failed':
          errorMessage = 'Network error';
          break;
      }

      setErrors({ general: errorMessage });
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [field]: undefined,
      general: undefined,
    }));
  };

  const features = [
    {
      icon: <BarChart2 size={16} />,
      label: 'Financial monitoring',
    },
    {
      icon: <GitBranch size={16} />,
      label: 'Multi-branch management',
    },
    {
      icon: <ShieldCheck size={16} />,
      label: 'Secure access control',
    },
    {
      icon: <Activity size={16} />,
      label: 'Audit & reporting',
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        *{
          margin:0;
          padding:0;
          box-sizing:border-box;
        }

        body{
          font-family:'Plus Jakarta Sans',sans-serif;
          overflow:hidden;
          background:#000;
        }

        .be-login{
          width:100%;
          height:100vh;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:18px;
          background:
            radial-gradient(circle at top left, rgba(31,138,61,0.10), transparent 25%),
            radial-gradient(circle at bottom right, rgba(31,138,61,0.06), transparent 25%),
            #050505;
          position:relative;
        }

        .be-login::before{
          content:'';
          position:absolute;
          inset:0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size:55px 55px;
          opacity:0.35;
        }

        .be-container{
          width:100%;
          max-width:1450px;
          height:calc(100vh - 36px);
          max-height:920px;
          border-radius:32px;
          overflow:hidden;
          display:flex;
          position:relative;
          background:#0a0a0a;
          border:1px solid rgba(31,138,61,0.18);
          box-shadow:
            0 30px 80px rgba(0,0,0,0.7),
            0 0 0 1px rgba(255,255,255,0.02);
          animation:beFadeIn 0.6s ease-out;
        }

        @keyframes beFadeIn{
          from{
            opacity:0;
            transform:translateY(16px);
          }
          to{
            opacity:1;
            transform:translateY(0);
          }
        }

        /* LEFT PANEL */

        .be-left{
          flex:1;
          position:relative;
          padding:52px 58px;
          display:flex;
          flex-direction:column;
          justify-content:flex-start;
          overflow:hidden;
          background:
            linear-gradient(
              135deg,
              rgba(12,12,12,0.98) 0%,
              rgba(0,0,0,0.96) 100%
            );
        }

        .be-left::after{
          content:'';
          position:absolute;
          inset:0;
          background:
            radial-gradient(circle at top center, rgba(31,138,61,0.07), transparent 35%);
          pointer-events:none;
        }

        /* SKYLINE */

        .be-skyline{
          position:absolute;
          left:0;
          right:0;
          bottom:0;
          height:100%;
          pointer-events:none;
          opacity:0.5;
          display:flex;
          align-items:flex-end;
          justify-content:flex-start;
          z-index:1;
        }

        .be-skyline svg {
          width:100%;
          height:100%;
          object-fit:cover;
        }

        /* BRAND */

        .be-brand{
          position:relative;
          z-index:2;
          display:flex;
          align-items:flex-start;
          gap:18px;
          margin-bottom:34px;
          margin-top:10px;
        }

        .be-brand-logo{
          width:96px;
          height:96px;
          border-radius:20px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          flex-shrink:0;
          background:#fff;
          border:2.5px solid #000;
          box-shadow:
            0 4px 20px rgba(0,0,0,0.6),
            0 1px 4px rgba(0,0,0,0.4);
        }

        .be-brand-logo img{
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .be-logo-wrap{
          position:relative;
          width:96px;
          height:96px;
          flex-shrink:0;
          margin-top:6px;
        }

        .be-radar-ring{
          position:absolute;
          inset:0;
          border-radius:20px;
          border:1.5px solid rgba(31,138,61,0.55);
          animation:radarPing 3s ease-out infinite;
          pointer-events:none;
        }

        .be-radar-ring:nth-child(2){
          animation-delay:1s;
        }

        .be-radar-ring:nth-child(3){
          animation-delay:2s;
        }

        @keyframes radarPing{
          0%{
            transform:scale(1);
            opacity:0.65;
          }
          100%{
            transform:scale(1.85);
            opacity:0;
          }
        }

        .be-brand-name{
          color:#ffffff;
          font-size:56px;
          line-height:0.92;
          font-weight:800;
          letter-spacing:-0.06em;
        }

        .be-brand-name span{
          background:linear-gradient(
            135deg,
            #8fd19e 0%,
            #1f8a3d 45%,
            #146c2e 100%
          );
          -webkit-background-clip:text;
          -webkit-text-fill-color:transparent;
        }

        .be-brand-sub{
          margin-top:12px;
          color:rgba(255,255,255,0.45);
          font-size:12px;
          letter-spacing:0.32em;
          text-transform:uppercase;
        }

        .be-text{
          position:relative;
          z-index:2;
          max-width:620px;
          color:rgba(255,255,255,0.70);
          font-size:20px;
          line-height:1.9;
          margin-top:8px;
          border-left:3px solid rgba(31,138,61,0.35);
          padding-left:18px;
        }

        /* FEATURES */

        .be-features{
          position:relative;
          z-index:2;
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:18px;
          margin-top:42px;
          max-width:700px;
        }

        .be-feature{
          display:flex;
          align-items:center;
          gap:16px;
          padding:18px;
          border-radius:22px;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.05);
          backdrop-filter:blur(10px);
          transition:0.25s ease;
        }

        .be-feature:hover{
          transform:translateY(-3px);
          border-color:rgba(31,138,61,0.25);
          background:rgba(255,255,255,0.05);
          box-shadow:0 10px 30px rgba(0,0,0,0.25);
        }

        .be-feature-icon{
          width:48px;
          height:48px;
          border-radius:15px;
          background:rgba(31,138,61,0.12);
          color:#1f8a3d;
          display:flex;
          align-items:center;
          justify-content:center;
          flex-shrink:0;
          border:1px solid rgba(31,138,61,0.18);
        }

        .be-feature span{
          color:rgba(255,255,255,0.9);
          font-size:15px;
          line-height:1.4;
          font-weight:600;
        }

        /* RIGHT PANEL */

        .be-right{
          width:500px;
          min-width:500px;
          background:#ffffff;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:42px;
          position:relative;
          z-index:2;
        }

        .be-right::before{
          content:'';
          position:absolute;
          top:0;
          left:0;
          right:0;
          height:5px;
          background:linear-gradient(
            90deg,
            #8fd19e 0%,
            #1f8a3d 45%,
            #146c2e 100%
          );
        }

        .be-card{
          width:100%;
          max-width:360px;
        }

        .be-heading h1{
          font-size:64px;
          color:#000;
          font-weight:800;
          letter-spacing:-0.06em;
          margin-bottom:10px;
        }

        .be-heading p{
          color:#6b7280;
          font-size:17px;
          line-height:1.7;
          margin-bottom:34px;
        }

        /* ERROR */

        .be-error{
          padding:14px 16px;
          border-radius:14px;
          background:#fff4f4;
          border:1px solid #fecaca;
          color:#dc2626;
          font-size:13px;
          margin-bottom:18px;
        }

        /* FORM */

        .be-field{
          margin-bottom:22px;
        }

        .be-label{
          display:block;
          margin-bottom:10px;
          font-size:14px;
          font-weight:700;
          color:#111827;
        }

        .be-wrap{
          position:relative;
        }

        .be-input{
          width:100%;
          height:58px;
          border-radius:18px;
          border:1.5px solid #e5e7eb;
          background:#fafafa;
          padding:0 18px;
          font-size:15px;
          color:#111827;
          outline:none;
          transition:0.25s;
          font-family:'Plus Jakarta Sans',sans-serif;
        }

        .be-input:focus{
          border-color:#1f8a3d;
          background:#fff;
          box-shadow:0 0 0 5px rgba(31,138,61,0.12);
        }

        .be-input.err{
          border-color:#ef4444;
        }

        .be-input.pr{
          padding-right:50px;
        }

        .be-eye{
          position:absolute;
          top:50%;
          right:16px;
          transform:translateY(-50%);
          background:none;
          border:none;
          color:#9ca3af;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .be-field-err{
          margin-top:8px;
          font-size:12px;
          color:#ef4444;
        }

        /* BUTTON */

        .be-btn{
          width:100%;
          height:60px;
          border:none;
          border-radius:18px;
          margin-top:10px;
          background:linear-gradient(
            135deg,
            #8fd19e 0%,
            #1f8a3d 45%,
            #146c2e 100%
          );
          color:#000;
          font-size:17px;
          font-weight:800;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:10px;
          transition:0.25s;
          font-family:'Plus Jakarta Sans',sans-serif;
          box-shadow:0 15px 35px rgba(31,138,61,0.28);
        }

        .be-btn:hover:not(:disabled){
          transform:translateY(-2px);
          box-shadow:0 20px 40px rgba(31,138,61,0.35);
        }

        .be-btn:disabled{
          opacity:0.7;
          cursor:not-allowed;
        }

        .be-spin{
          animation:spin 1s linear infinite;
        }

        @keyframes spin{
          to{
            transform:rotate(360deg);
          }
        }

        .be-secure{
          margin-top:24px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:10px;
          color:#9ca3af;
          font-size:13px;
        }

        .be-dot{
          width:9px;
          height:9px;
          border-radius:50%;
          background:#1f8a3d;
          box-shadow:0 0 14px rgba(31,138,61,0.8);
        }

        /* RESPONSIVE */

        @media(max-width:1000px){

          body{
            overflow:auto;
          }

          .be-login{
            height:auto;
            padding:12px;
          }

          .be-container{
            flex-direction:column;
            height:auto;
          }

          .be-left{
            padding:34px 24px;
            min-height:520px;
          }

          .be-right{
            width:100%;
            min-width:100%;
            padding:36px 24px;
          }

          .be-skyline{
            display:none;
          }

          .be-brand-name{
            font-size:42px;
          }

          .be-heading h1{
            font-size:52px;
          }

          .be-features{
            grid-template-columns:1fr;
          }

          .be-text{
            font-size:16px;
            line-height:1.8;
          }
        }

      `}</style>

      <div className="be-login">
        <div className="be-container">

          {/* LEFT SIDE */}

          <div className="be-left">

            <div className="be-skyline">
              <svg
                viewBox="0 0 750 600"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMax slice"
              >
                <line
                  x1="0"
                  y1="590"
                  x2="750"
                  y2="590"
                  stroke="#1f8a3d"
                  strokeWidth="2"
                  strokeOpacity="0.5"
                />

                                {/* MINAR-E-PAKISTAN */}

                <g transform="translate(180, 20)">
                  <path
                    d="M30 560 Q55 522 80 560 Q105 522 130 560"
                    stroke="#1f8a3d"
                    strokeWidth="2"
                    strokeOpacity="0.55"
                    fill="none"
                  />
                  <path
                    d="M62 555 L66 380 L72 220 L77 80 L83 80 L88 220 L94 380 L98 555 Z"
                    stroke="#1f8a3d"
                    strokeWidth="2"
                    strokeOpacity="0.9"
                    fill="rgba(31,138,61,0.04)"
                  />
                  <line x1="63" y1="500" x2="97" y2="500" stroke="#1f8a3d" strokeWidth="1" strokeOpacity="0.4" />
                  <line x1="65" y1="420" x2="95" y2="420" stroke="#1f8a3d" strokeWidth="1" strokeOpacity="0.4" />
                  <line x1="68" y1="340" x2="92" y2="340" stroke="#1f8a3d" strokeWidth="1" strokeOpacity="0.4" />
                  <line x1="71" y1="260" x2="89" y2="260" stroke="#1f8a3d" strokeWidth="1" strokeOpacity="0.4" />
                  <line x1="74" y1="180" x2="86" y2="180" stroke="#1f8a3d" strokeWidth="1" strokeOpacity="0.4" />
                  <line
                    x1="68"
                    y1="115"
                    x2="92"
                    y2="115"
                    stroke="#1f8a3d"
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
                  />
                  <line
                    x1="80"
                    y1="80"
                    x2="80"
                    y2="15"
                    stroke="#8fd19e"
                    strokeWidth="2.5"
                  />
                  <circle cx="80" cy="12" r="4" fill="#8fd19e" opacity="0.9" />
                </g>

                {/* FAISAL MOSQUE */}

                <g transform="translate(420, 300)">
                  <path
                    d="M20 290 L20 190 L110 110 L200 190 L200 290 Z"
                    stroke="#1f8a3d"
                    strokeWidth="2.5"
                    fill="rgba(31,138,61,0.03)"
                    strokeOpacity="0.9"
                  />
                  <path
                    d="M20 290 H200"
                    stroke="#1f8a3d"
                    strokeWidth="2"
                    strokeOpacity="0.7"
                  />
                  <line
                    x1="0"
                    y1="290"
                    x2="0"
                    y2="120"
                    stroke="#1f8a3d"
                    strokeWidth="2"
                    strokeOpacity="0.85"
                  />
                  <line
                    x1="0"
                    y1="120"
                    x2="0"
                    y2="95"
                    stroke="#8fd19e"
                    strokeWidth="2.5"
                  />
                  <line
                    x1="220"
                    y1="290"
                    x2="220"
                    y2="120"
                    stroke="#1f8a3d"
                    strokeWidth="2"
                    strokeOpacity="0.85"
                  />
                  <line
                    x1="220"
                    y1="120"
                    x2="220"
                    y2="95"
                    stroke="#8fd19e"
                    strokeWidth="2.5"
                  />
                  <line x1="-6" y1="200" x2="6" y2="200" stroke="#1f8a3d" strokeOpacity="0.4" />
                  <line x1="214" y1="200" x2="226" y2="200" stroke="#1f8a3d" strokeOpacity="0.4" />
                </g>

                {/* RIGHT TOWER */}

                <path
                  d="M620 590 L650 310 L700 350 L680 590"
                  stroke="#1f8a3d"
                  strokeWidth="1.5"
                  strokeOpacity="0.5"
                />
              </svg>
            </div>

            <div className="be-brand">
              <div className="be-logo-wrap">
                <div className="be-radar-ring"></div>
                <div className="be-radar-ring"></div>
                <div className="be-radar-ring"></div>
                <div className="be-brand-logo">
                  <img
                    src={COMPANY_LOGO}
                    alt={COMPANY_LOGO_ALT}
                  />
                </div>
              </div>

              <div>
                <div className="be-brand-name">
                  {COMPANY_NAME_LINE1} <br />
                  <span>{COMPANY_NAME_LINE2}</span>
                </div>

                <div className="be-brand-sub">
                  {COMPANY_TAGLINE}
                </div>
              </div>
            </div>

            <div className="be-text">
              {COMPANY_DESCRIPTION}
            </div>

            <div className="be-features">
              {features.map((f) => (
                <div className="be-feature" key={f.label}>
                  <div className="be-feature-icon">
                    {f.icon}
                  </div>

                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT SIDE */}

          <div className="be-right">
            <div className="be-card">

              <div className="be-heading">
                <h1>Welcome</h1>
                <p>Sign in securely to continue</p>
              </div>

              {errors.general && (
                <div className="be-error">
                  {errors.general}
                </div>
              )}

              <form onSubmit={handleSubmit}>

                <div className="be-field">
                  <label className="be-label">
                    Email Address
                  </label>

                  <div className="be-wrap">
                    <input
                      type="email"
                      className={`be-input ${
                        errors.email ? 'err' : ''
                      }`}
                      value={formData.email}
                      onChange={(e) =>
                        handleInputChange('email', e.target.value)
                      }
                      placeholder="Enter your email"
                      disabled={isLoading}
                    />
                  </div>

                  {errors.email && (
                    <div className="be-field-err">
                      {errors.email}
                    </div>
                  )}
                </div>

                <div className="be-field">
                  <label className="be-label">
                    Password
                  </label>

                  <div className="be-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={`be-input pr ${
                        errors.password ? 'err' : ''
                      }`}
                      value={formData.password}
                      onChange={(e) =>
                        handleInputChange('password', e.target.value)
                      }
                      placeholder="Enter password"
                      disabled={isLoading}
                    />

                    <button
                      type="button"
                      className="be-eye"
                      onClick={() =>
                        setShowPassword((p) => !p)
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>

                  {errors.password && (
                    <div className="be-field-err">
                      {errors.password}
                    </div>
                  )}
                </div>

                {/* FORGOT PASSWORD LINK */}
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'-10px', marginBottom:'18px' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    style={{
                      background:'none', border:'none', color:'#1f8a3d',
                      fontSize:'13px', fontWeight:600, cursor:'pointer',
                      fontFamily:"'Plus Jakarta Sans',sans-serif",
                      textDecoration:'underline', textUnderlineOffset:'3px'
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>

                <button
                  type="submit"
                  className="be-btn"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={18} className="be-spin" />
                      Signing In...
                    </>
                  ) : (
                    <>
                      Secure Sign In
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

              </form>

              {/* REGISTER LINK */}
              <div style={{ marginTop:'24px', paddingTop:'20px', borderTop:'1px solid #f3f4f6', textAlign:'center' }}>
                <p style={{ color:'#6b7280', fontSize:'14px' }}>
                  New to the system?{' '}
                  <button
                    onClick={() => navigate('/register')}
                    style={{
                      background:'none', border:'none', color:'#1f8a3d',
                      fontSize:'14px', fontWeight:700, cursor:'pointer',
                      fontFamily:"'Plus Jakarta Sans',sans-serif",
                      textDecoration:'underline', textUnderlineOffset:'3px',
                      display:'inline-flex', alignItems:'center', gap:'5px'
                    }}
                  >
                    <UserPlus size={14} /> Create Account
                  </button>
                </p>
              </div>

              <div className="be-secure" style={{ marginTop:'20px' }}>
                <div className="be-dot"></div>
                Secure enterprise connection
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div
          onClick={closeForgotModal}
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
            backdropFilter:'blur(6px)', zIndex:9999,
            display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:'#fff', borderRadius:'28px', padding:'40px',
              width:'100%', maxWidth:'400px', position:'relative',
              boxShadow:'0 40px 80px rgba(0,0,0,0.25)'
            }}
          >
            <button
              onClick={closeForgotModal}
              style={{
                position:'absolute', top:'18px', right:'18px',
                background:'#f3f4f6', border:'none', width:'36px', height:'36px',
                borderRadius:'10px', cursor:'pointer', display:'flex',
                alignItems:'center', justifyContent:'center', color:'#6b7280'
              }}
            >
              <X size={16} />
            </button>

            {forgotSent ? (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:'48px', marginBottom:'16px' }}>âœ‰ï¸</div>
                <h2 style={{ fontSize:'22px', fontWeight:800, color:'#111827', marginBottom:'8px' }}>Check Your Email</h2>
                <p style={{ color:'#6b7280', fontSize:'14px', lineHeight:1.6 }}>
                  Password reset link sent to <strong>{forgotEmail}</strong>. Check your inbox.
                </p>
                <button className="be-btn" style={{ marginTop:'24px' }} onClick={closeForgotModal}>
                  Back to Login
                </button>
              </div>
            ) : (
              <>
                <div style={{
                  width:'56px', height:'56px', borderRadius:'16px',
                  background:'rgba(31,138,61,0.1)', border:'1px solid rgba(31,138,61,0.2)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#1f8a3d', marginBottom:'18px'
                }}>
                  <Mail size={24} />
                </div>
                <h2 style={{ fontSize:'22px', fontWeight:800, color:'#111827', marginBottom:'8px', letterSpacing:'-0.03em' }}>Forgot Password?</h2>
                <p style={{ color:'#6b7280', fontSize:'14px', lineHeight:1.6, marginBottom:'24px' }}>
                  Enter your registered email and we will send a password reset link.
                </p>
                <form onSubmit={handleForgotPassword}>
                  <div className="be-field">
                    <label className="be-label">Email Address</label>
                    <input
                      type="email"
                      className="be-input"
                      placeholder="Enter your email"
                      value={forgotEmail}
                      onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                      disabled={forgotLoading}
                      autoFocus
                    />
                    {forgotError && (
                      <p style={{ color:'#dc2626', fontSize:'13px', marginTop:'8px' }}>{forgotError}</p>
                    )}
                  </div>
                  <button type="submit" className="be-btn" disabled={forgotLoading}>
                    {forgotLoading ? (
                      <><Loader2 size={18} className="be-spin" /> Sending...</>
                    ) : (
                      <><Mail size={18} /> Send Reset Link</>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}