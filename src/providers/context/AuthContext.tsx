import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../api/firebase/firebase';

// ── Admin email (hardcoded — this user always gets super_admin role) ──────────
const ADMIN_EMAIL = 'bullion@gmail.com';

type AuthContextType = {
  user: any;
  role: 'super_admin' | 'user' | null;
  isAdmin: boolean;
  permissions: string[];
  branch: string;
  setUser: (user: any) => void;
  setRole: (role: 'super_admin' | 'user' | null) => void;
  setPermissions: (permissions: string[]) => void;
  setBranch: (branch: string) => void;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<'super_admin' | 'user' | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [branch, setBranch] = useState<string>('');

  const isAdmin = role === 'super_admin';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

          if (userDoc.exists()) {
            const userData = userDoc.data();

            // ── Block pending/rejected users ────────────────────────────────
            if (userData.status === 'pending') {
              await signOut(auth);
              localStorage.removeItem('userInfo');
              setUser(null);
              setRole(null);
              setPermissions([]);
              setBranch('');
              // Show a friendly message via localStorage flag
              localStorage.setItem('auth_error', 'Your account is pending admin approval. Please wait.');
              return;
            }

            if (userData.status === 'rejected') {
              await signOut(auth);
              localStorage.removeItem('userInfo');
              setUser(null);
              setRole(null);
              setPermissions([]);
              setBranch('');
              localStorage.setItem('auth_error', 'Your account registration was rejected by the admin.');
              return;
            }

            // ── Determine role ──────────────────────────────────────────────
            // Admin email always gets super_admin regardless of Firestore role
            const isByEmail = firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
            const isRoleAdmin = userData.role === 'superAdmin' || userData.role === 'super_admin';
            const userRole: 'super_admin' | 'user' = (isByEmail || isRoleAdmin) ? 'super_admin' : 'user';
            const userPermissions = userData.permissions || [];
            const userBranch = userData.branch || '';

            setUser(firebaseUser);
            setRole(userRole);
            setPermissions(userPermissions);
            setBranch(userBranch);

            localStorage.removeItem('auth_error');
            localStorage.setItem('userInfo', JSON.stringify({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              role: userRole,
              permissions: userPermissions,
              branch: userBranch,
            }));

          } else {
            // If on the register page, do not auto-signout; let RegisterPage finish writing the user document and notification
            if (window.location.pathname.includes('/register')) {
              return;
            }

            // No Firestore doc — if this is the admin email, create their doc automatically
            if (firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
              const { setDoc } = await import('firebase/firestore');
              await setDoc(doc(db, 'users', firebaseUser.uid), {
                uid: firebaseUser.uid,
                fullName: 'Admin',
                email: ADMIN_EMAIL,
                role: 'super_admin',
                status: 'approved',
                permissions: [],
                branch: '',
                createdAt: new Date().toISOString(),
              });
              setUser(firebaseUser);
              setRole('super_admin');
              setPermissions([]);
              setBranch('');
              localStorage.removeItem('auth_error');
              localStorage.setItem('userInfo', JSON.stringify({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                role: 'super_admin',
                permissions: [],
                branch: '',
              }));
            } else {
              // Unknown user — sign out
              await signOut(auth);
              localStorage.removeItem('userInfo');
              setUser(null);
              setRole(null);
              setPermissions([]);
              setBranch('');
            }
          }
        } catch (err) {
          console.error('Error loading user data:', err);
          setUser(null);
          setRole(null);
          localStorage.removeItem('userInfo');
        }
      } else {
        localStorage.removeItem('userInfo');
        setUser(null);
        setRole(null);
        setPermissions([]);
        setBranch('');
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, isAdmin, permissions, branch, setUser, setRole, setPermissions, setBranch }}>
      {children}
    </AuthContext.Provider>
  );
}