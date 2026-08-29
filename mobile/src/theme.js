import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
const key = 'legalmetrix-mobile-theme'; const ThemeContext = createContext(null);
export function ThemeProvider({ children }) { const system = useColorScheme() === 'dark' ? 'dark' : 'light'; const [themeName, setThemeName] = useState(system); const [ready, setReady] = useState(false); useEffect(() => { AsyncStorage.getItem(key).then(saved => { if (saved === 'light' || saved === 'dark') setThemeName(saved); }).finally(() => setReady(true)); }, []); const toggleTheme = () => setThemeName(current => { const next = current === 'dark' ? 'light' : 'dark'; AsyncStorage.setItem(key, next).catch(() => {}); return next; }); return <ThemeContext.Provider value={useMemo(() => ({ themeName, ready, toggleTheme }), [themeName, ready])}>{children}</ThemeContext.Provider>; }
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('ThemeProvider is required'); return value; }
