import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem('legalmetrix-session'));
    return session?.token && session?.user ? session : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);
  const login = (data) => {
    const next = { token: data.token, user: data.user };
    localStorage.setItem('legalmetrix-session', JSON.stringify(next));
    setSession(next);
  };
  const logout = () => {
    localStorage.removeItem('legalmetrix-session');
    setSession({ token: null, user: null });
  };
  return <AuthContext.Provider value={{ ...session, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
