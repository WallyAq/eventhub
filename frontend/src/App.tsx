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
import { OrganizationProfilePage } from './pages/organization/ProfilePage';
import { RecoveryPage } from './pages/RecoveryPage';
import { CatalogPage } from './pages/events/CatalogPage';
import { ManageEventsPage } from './pages/events/ManagePage';
import { EventEditorPage } from './pages/events/EditorPage';
import { EventDetailsPage } from './pages/events/DetailsPage';
import { CheckoutPage } from './pages/registrations/CheckoutPage';
import { MyRegistrationsPage } from './pages/registrations/MyRegistrationsPage';

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
    <Route path="/organizacao/perfil" element={<OrganizationProfilePage />} />
    <Route path="/organizacao/perfil/:id" element={<OrganizationProfilePage />} />
    <Route path="/diagnostico" element={<EnvironmentPage />} />
    <Route path="/recuperar-senha" element={<RecoveryPage />} />
    <Route path="/redefinir-senha" element={<RecoveryPage reset />} />
    <Route path="/eventos" element={<CatalogPage />} />
    <Route path="/eventos/:id" element={<EventDetailsPage />} />
    <Route path="/eventos/:eventId/inscricao" element={<CheckoutPage />} />
    <Route path="/organizacao/eventos" element={<ManageEventsPage />} />
    <Route path="/organizacao/eventos/novo" element={<EventEditorPage key="new" />} />
    <Route path="/organizacao/eventos/:id" element={<EventEditorPage />} />
    <Route path="/atividades/:eventId/:activityId/inscricao" element={<CheckoutPage />} />
    <Route path="/pagamento/:id" element={<CheckoutPage />} />
    <Route path="/inscricoes/:id" element={<CheckoutPage />} />
    <Route path="/minhas-inscricoes" element={<MyRegistrationsPage />} />
    <Route path="*" element={<Navigate to="/acesso" replace />} />
  </Routes></AuthProvider></BrowserRouter>;
}

