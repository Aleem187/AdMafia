import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import type { ReactNode } from 'react';
import LandingPage from '@/pages/LandingPage';
import SignUpPage from '@/pages/SignUpPage';
import SignInPage from '@/pages/SignInPage';
import OnboardingPage from '@/pages/OnboardingPage';
import DashboardPage from '@/pages/DashboardPage';
import ConnectionsPage from '@/pages/ConnectionsPage';
import ProductsPage from '@/pages/ProductsPage';
import NewRunPage from '@/pages/NewRunPage';
import ReviewPage from '@/pages/ReviewPage';
import PublishPage from '@/pages/PublishPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import BillingPage from '@/pages/BillingPage';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
      </div>
    );
  }
  if (!session) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/app" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/app/connections" element={<ProtectedRoute><ConnectionsPage /></ProtectedRoute>} />
      <Route path="/app/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      <Route path="/app/new-run" element={<ProtectedRoute><NewRunPage /></ProtectedRoute>} />
      <Route path="/app/review/:id" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
      <Route path="/app/publish" element={<ProtectedRoute><PublishPage /></ProtectedRoute>} />
      <Route path="/app/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/app/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
