import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { InspectionsPage } from './pages/InspectionsPage';
import { InspectionDetailPage } from './pages/InspectionDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';
import { AuthProvider, useAuth } from './lib/auth';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ThemeProvider } from './lib/theme';
function Protected() { const { token, user, logout } = useAuth(); if (!token) return <Navigate to="/login" replace />; if (!['MASTER_ADMIN', 'ADMIN'].includes(user?.role)) { logout(); return <Navigate to="/login" replace />; } return <AppShell />; }
function App() { return <Routes><Route path="/login" element={<LoginPage/>}/><Route element={<Protected/>}><Route path="/" element={<DashboardPage/>}/><Route path="/inspections" element={<InspectionsPage/>}/><Route path="/inspections/:id" element={<InspectionDetailPage/>}/><Route path="/reports" element={<ReportsPage/>}/><Route path="/users" element={<UsersPage/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>; }

createRoot(document.getElementById('root')).render(<AppErrorBoundary><ThemeProvider><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></ThemeProvider></AppErrorBoundary>);
