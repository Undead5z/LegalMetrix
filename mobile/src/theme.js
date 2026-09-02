import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

const key = 'legalmetrix-mobile-theme';
const ThemeContext = createContext(null);
const semantic = ({ background, surface, surfaceElevated, border, textPrimary, textSecondary, teal, gold, goldSoft, success, warning, danger, disabled }) => ({
  background, surface, surfaceElevated, border, textPrimary, textSecondary,
  teal, gold, goldSoft, accentTeal: teal, accentGold: gold, accentGoldSoft: goldSoft,
  success, warning, danger, disabled
});

export const themes = {
  light: semantic({ background: '#F3F5F7', surface: '#FFFFFF', surfaceElevated: '#E8F1F5', border: '#B6CCD8', textPrimary: '#0B1F30', textSecondary: '#34495A', teal: '#1FA38A', gold: '#B58E43', goldSoft: '#F2D98C', success: '#1FA38A', warning: '#B88918', danger: '#B94A48', disabled: '#AAB3BC' }),
  dark: semantic({ background: '#021627', surface: '#0B1F30', surfaceElevated: '#102C3A', border: '#315A78', textPrimary: '#F3F5F7', textSecondary: '#9EB1BC', teal: '#15C39A', gold: '#A5853A', goldSoft: '#F2D98C', success: '#1FA38A', warning: '#F2D98C', danger: '#E6A59D', disabled: '#56616C' })
};

export function ThemeProvider({ children }) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [themeName, setThemeName] = useState(system);
  const [ready, setReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem(key).then(saved => { if (saved === 'light' || saved === 'dark') setThemeName(saved); }).finally(() => setReady(true)); }, []);
  const toggleTheme = () => setThemeName(current => { const next = current === 'dark' ? 'light' : 'dark'; AsyncStorage.setItem(key, next).catch(() => {}); return next; });
  return <ThemeContext.Provider value={useMemo(() => ({ themeName, theme: themes[themeName], ready, toggleTheme }), [themeName, ready])}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('ThemeProvider is required'); return value; }
