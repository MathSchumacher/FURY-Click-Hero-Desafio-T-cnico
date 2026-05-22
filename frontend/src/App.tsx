import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import FuryCursor from './components/cursor/FuryCursor';
import OpeningSplash from './components/splash/OpeningSplash';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { Hero } from './components/sections/Hero';
import { TrustBar } from './components/sections/TrustBar';
import { PhoenixIntro } from './components/sections/PhoenixIntro';
import { Problem } from './components/sections/Problem';
import { Connections } from './components/sections/Connections';
import { HowItWorks } from './components/sections/HowItWorks';
import { Severity } from './components/sections/Severity';
import { Results } from './components/sections/Results';
import { PhoneAlert } from './components/sections/PhoneAlert';
import { Trustpilot } from './components/sections/Trustpilot';
import { Reliability } from './components/sections/Reliability';
import { FinalCTA } from './components/sections/FinalCTA';

import './components/cursor/FuryCursor.css';
import './components/splash/OpeningSplash.css';
import './components/shared/Button.css';
import './components/layout/Header.css';
import './components/layout/Footer.css';
import './components/sections/Hero.css';
import './components/sections/TrustBar.css';
import './components/sections/PhoenixIntro.css';
import './components/sections/Problem.css';
import './components/sections/Connections.css';
import './components/sections/HowItWorks.css';
import './components/sections/Severity.css';
import './components/sections/Results.css';
import './components/sections/LiveDashboard.css';
import './components/sections/PhoneAlert.css';
import './components/sections/Trustpilot.css';
import './components/sections/Reliability.css';
import './components/sections/FinalCTA.css';
import './components/auth/AuthLayout.css';
import './components/auth/AuthField.css';
import './components/auth/AuthForm.css';
import './components/dashboard/Sidebar.css';
import './components/dashboard/SimulateViolationPanel.css';
import './components/dashboard/RecentViolationsPanel.css';
import './components/dashboard/SeverityDonut.css';
import './components/dashboard/ConnectionsHealth.css';
import './pages/Dashboard.css';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

const LoginPage = lazy(() => import('./pages/Login'));
const RegisterPage = lazy(() => import('./pages/Register'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallback'));

function LandingPage(): JSX.Element {
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <TrustBar />
        <PhoenixIntro />
        <Problem />
        <Connections />
        <HowItWorks />
        <Severity />
        <Results />
        <PhoneAlert />
        <Trustpilot />
        <Reliability />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <OpeningSplash />
      <FuryCursor />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
