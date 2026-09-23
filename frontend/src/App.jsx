import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/shared/Navbar";
import HomePage from "./pages/HomePage";
import RegisterPage from "./pages/RegisterPage";
import LoginPage from "./pages/LoginPage";
import LivenessVerificationPage from "./pages/LivenessVerificationPage";
import ElectionsPage from "./pages/ElectionsPage";
import ElectionDetailPage from "./pages/ElectionDetailPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import CandidateRegistration from "./components/candidate/CandidateRegistration";

const ProtectedRoute = ({
  children,
  allowedRoles = null,
  deniedRedirectTo = "/elections",
  deniedMessage = "Access Denied",
}) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const isAdmin = ["admin", "superadmin"].includes(user.role);
    const redirectPath = isAdmin ? "/admin" : deniedRedirectTo;
    return (
      <Navigate
        to={redirectPath}
        replace
        state={{ toast: { msg: deniedMessage, type: "error" } }}
      />
    );
  }

  return children;
};

function AppLayout() {
  const location = useLocation();
  const candidateRegistrationPage = (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <CandidateRegistration />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070d20]">
      {location.pathname !== "/admin-login" && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/liveness-verification" element={<LivenessVerificationPage />} />
          <Route path="/admin-login" element={<AdminLoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/elections" element={<ElectionsPage />} />
          <Route path="/elections/:id" element={<ElectionDetailPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/vote" element={<ProtectedRoute><ElectionsPage /></ProtectedRoute>} />
          <Route
            path="/candidate/register"
            element={
              <ProtectedRoute allowedRoles={["voter"]}>
                {candidateRegistrationPage}
              </ProtectedRoute>
            }
          />
          <Route
            path="/register-candidate"
            element={
              <ProtectedRoute allowedRoles={["voter"]}>
                {candidateRegistrationPage}
              </ProtectedRoute>
            }
          />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/admin/elections" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/admin/voters" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/admin/candidates" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  );
}
