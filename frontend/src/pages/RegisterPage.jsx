import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import RegistrationFlow from "../components/auth/RegistrationFlow";

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-white text-3xl font-black mb-2">Voter Registration</h1>
          <p className="text-slate-400 text-sm">Secure Aadhaar-based identity verification</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
          <RegistrationFlow onSuccess={(token, user) => { login(token, user); navigate("/elections"); }} />
        </div>
      </div>
    </div>
  );
}
