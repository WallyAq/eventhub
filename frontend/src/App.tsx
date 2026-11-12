import { EnvironmentPage } from './pages/EnvironmentPage';
import { HomePage } from './pages/HomePage';
import { AccessPage } from './pages/AccessPage';
import { OrganizerDashboardPage, EventDashboardPage } from './pages/organization/DashboardPage';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAccount } from './auth/RequireAccount';
import { ParticipantLoginPage } from './pages/participant/LoginPage';
import { ParticipantRegisterPage } from './pages/participant/RegisterPage';
import { OrganizationLoginPage } from './pages/organization/LoginPage';
import { OrganizationRegisterPage } from './pages/organization/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { OrganizationProfilePage } from './pages/organization/ProfilePage';
import { RecoveryPage } from './pages/RecoveryPage';
import { CatalogPage } from './pages/events/CatalogPage';
import { ManageEventsPage } from './pages/events/ManagePage';
import { EventEditorPage } from './pages/events/EditorPage';
import { OrganizerEventPage } from './pages/events/OrganizerEventPage';
import { EventDetailsPage } from './pages/events/DetailsPage';
import { CheckoutPage } from './pages/registrations/CheckoutPage';
import { MyRegistrationsPage } from './pages/registrations/MyRegistrationsPage';
import { MotionEnhancements } from './motion/MotionEnhancements';
import { ErrorPage } from './pages/ErrorPage';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';

export default function App() {
  return <BrowserRouter><MotionEnhancements /><AuthProvider><RouteErrorBoundary><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/acesso" element={<AccessPage />} />
    <Route path="/participante/login" element={<ParticipantLoginPage />} />
    <Route path="/participante/cadastro" element={<ParticipantRegisterPage />} />
    <Route path="/organizacao/login" element={<OrganizationLoginPage />} />
    <Route path="/organizacao/cadastro" element={<OrganizationRegisterPage />} />
    <Route path="/login" element={<Navigate to="/acesso" replace />} />
    <Route path="/cadastro" element={<AccessPage mode="register" />} />
    <Route path="/perfil" element={<RequireAccount area="participant"><ProfilePage /></RequireAccount>} />
    <Route path="/organizacoes" element={<RequireAccount area="organization"><OrganizationsPage /></RequireAccount>} />
    <Route path="/organizacao/perfil" element={<RequireAccount area="organization"><OrganizationProfilePage /></RequireAccount>} />
    <Route path="/organizacao/perfil/:id" element={<RequireAccount area="organization"><OrganizationProfilePage /></RequireAccount>} />
    <Route path="/diagnostico" element={<EnvironmentPage />} />
    <Route path="/recuperar-senha" element={<RecoveryPage />} />
    <Route path="/redefinir-senha" element={<RecoveryPage reset />} />
    <Route path="/eventos" element={<RequireAccount area="participant"><CatalogPage /></RequireAccount>} />
    <Route path="/eventos/:id" element={<RequireAccount area="participant"><EventDetailsPage /></RequireAccount>} />
    <Route path="/eventos/:eventId/inscricao" element={<RequireAccount area="participant"><CheckoutPage /></RequireAccount>} />
    <Route path="/organizacao/eventos" element={<RequireAccount area="organization"><ManageEventsPage /></RequireAccount>} />
    <Route path="/organizacao/painel" element={<RequireAccount area="organization"><OrganizerDashboardPage /></RequireAccount>} />
    <Route path="/organizacao/eventos/:id/painel" element={<RequireAccount area="organization"><EventDashboardPage /></RequireAccount>} />
    <Route path="/organizacao/eventos/novo" element={<RequireAccount area="organization"><EventEditorPage key="new" /></RequireAccount>} />
    <Route path="/organizacao/eventos/:id" element={<RequireAccount area="organization"><EventEditorPage /></RequireAccount>} />
    <Route path="/organizacao/eventos/:id/visualizar" element={<RequireAccount area="organization"><EventDetailsPage preview /></RequireAccount>} />
    <Route path="/organizacao/eventos/:id/gestao" element={<RequireAccount area="organization"><OrganizerEventPage /></RequireAccount>} />
    <Route path="/atividades/:eventId/:activityId/inscricao" element={<RequireAccount area="participant"><CheckoutPage /></RequireAccount>} />
    <Route path="/pagamento/:id" element={<RequireAccount area="participant"><CheckoutPage /></RequireAccount>} />
    <Route path="/inscricoes/:id" element={<RequireAccount area="participant"><CheckoutPage /></RequireAccount>} />
    <Route path="/minhas-inscricoes" element={<RequireAccount area="participant"><MyRegistrationsPage /></RequireAccount>} />
    <Route path="/erro/:code" element={<ErrorPage />} />
    <Route path="*" element={<ErrorPage error={{ status: 404 }} />} />
  </Routes></RouteErrorBoundary></AuthProvider></BrowserRouter>;
}

