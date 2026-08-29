import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const storageKey = 'legalmetrix-web-theme';
const ThemeContext = createContext(null);
const preferredTheme = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(storageKey) || preferredTheme());
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; localStorage.setItem(storageKey, theme); }, [theme]);
  const value = useMemo(() => ({ theme, isDark: theme === 'dark', toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark') }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('ThemeProvider is required'); return value; }
