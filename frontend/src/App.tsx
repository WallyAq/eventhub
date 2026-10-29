import { EnvironmentPage } from './pages/EnvironmentPage';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ParticipantLoginPage } from './pages/participant/LoginPage';
import { ParticipantRegisterPage } from './pages/participant/RegisterPage';
import { OrganizationLoginPage } from './pages/organization/LoginPage';
import { OrganizationRegisterPage } from './pages/organization/RegisterPage';
import { AccessPage } from './pages/AccessPage';
import { ProfilePage } from './pages/ProfilePage';
import { OrganizationsPage } from './pages/OrganizationsPage';

export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/" element={<AccessPage />} />
    <Route path="/acesso" element={<AccessPage />} />
    <Route path="/participante/login" element={<ParticipantLoginPage />} />
    <Route path="/participante/cadastro" element={<ParticipantRegisterPage />} />
    <Route path="/organizacao/login" element={<OrganizationLoginPage />} />
    <Route path="/organizacao/cadastro" element={<OrganizationRegisterPage />} />
    <Route path="/login" element={<Navigate to="/acesso" replace />} />
    <Route path="/cadastro" element={<Navigate to="/participante/cadastro" replace />} />
    <Route path="/perfil" element={<ProfilePage />} />
    <Route path="/organizacoes" element={<OrganizationsPage />} />
    <Route path="/diagnostico" element={<EnvironmentPage />} />
    <Route path="*" element={<Navigate to="/acesso" replace />} />
  </Routes></AuthProvider></BrowserRouter>;
}

