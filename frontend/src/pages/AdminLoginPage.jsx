import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";

const AdminIcon = ({ name, className = "" }) => {
  const props = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const icons = {
    shield: <path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3Z" />,
    user: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.75-3.35 3-5 6.5-5s5.75 1.65 6.5 5" /></>,
    lock: <><rect x="4.5" y="10" width="15" height="10.5" rx="2" /><path d="M8 10V7.2a4 4 0 0 1 8 0V10M12 14.2v2.3" /></>,
    eye: <><path d="M2.8 12s3.2-5.2 9.2-5.2S21.2 12 21.2 12 18 17.2 12 17.2 2.8 12 2.8 12Z" /><circle cx="12" cy="12" r="2.2" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 6.9A9.8 9.8 0 0 1 12 6.8c6 0 9.2 5.2 9.2 5.2a16.4 16.4 0 0 1-2.3 2.9M6.4 6.4A16.2 16.2 0 0 0 2.8 12s3.2 5.2 9.2 5.2c1.25 0 2.35-.23 3.3-.6" /><circle cx="12" cy="12" r="2.2" /></>,
    chart: <><path d="M4 20V11" /><path d="M10 20V5" /><path d="M16 20v-8" /><path d="M22 20H2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.02 2.02-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56v.08h-2.86v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.02-2.02.06-.06A1.7 1.7 0 0 0 7.34 15a1.7 1.7 0 0 0-1.56-1.04H5.7v-2.86h.08a1.7 1.7 0 0 0 1.56-1.04A1.7 1.7 0 0 0 7 8.18l-.06-.06L8.96 6.1l.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.56V4.86h2.86v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.02 2.02-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04h.08v2.86H21a1.7 1.7 0 0 0-1.6 1.04Z" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    back: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  };
  return <svg {...props}>{icons[name]}</svg>;
};

const securityFeatures = [
  { icon: "shield", title: "Secure Access", text: "Authorized Admins Only" },
  { icon: "chart", title: "Manage Elections", text: "Create, Monitor, Results" },
  { icon: "settings", title: "System Control", text: "Maintain & Administer" },
];

export default function AdminLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!name || !password) { setError("Name aur password dono bharein"); return; }
    setLoading(true); setError("");
    try {
      const res = await api.post("/admin/login", { name, password });
      login(res.data.token, res.data.user);
      navigate("/admin");
    } catch (e) {
      setError(e.response?.data?.error || "Login fail ho gaya");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-page__grid" aria-hidden="true" />
      <div className="admin-login-page__glow admin-login-page__glow--left" aria-hidden="true" />
      <div className="admin-login-page__glow admin-login-page__glow--center" aria-hidden="true" />
      <div className="admin-login-page__curves" aria-hidden="true" />

      <div className="admin-brand" aria-label="EthVote Admin Portal">
        <span className="admin-brand__mark">E</span>
        <span><strong>EthVote</strong><small>Admin Portal</small></span>
      </div>
      <div className="admin-security-status"><span /> Secured by Polygon Blockchain</div>

      <aside className="admin-left-decoration" aria-hidden="true">
        <p>A<br />Fairer<br />Tomorrow</p>
        <i />
        <span>Transparent<br />Secure<br />People Powered</span>
      </aside>

      <main className="admin-login-layout">
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <div className="admin-login-card__shield"><AdminIcon name="shield" className="h-10 w-10" /></div>
          <div className="admin-login-card__heading">
            <p>Admin Access</p>
            <h1 id="admin-login-title">Admin <span>Login</span></h1>
            <h2>EthVote Administration Panel</h2>
          </div>

          {error && <div className="admin-login-error" role="alert">{error}</div>}

          <div className="admin-form-fields">
            <div className="admin-field">
              <label htmlFor="admin-name"><AdminIcon name="user" className="h-5 w-5" /> Admin Name</label>
              <div className="admin-input-wrap">
                <AdminIcon name="user" className="admin-input-wrap__icon h-5 w-5" />
                <input id="admin-name" type="text" placeholder="Enter admin name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" />
              </div>
            </div>

            <div className="admin-field">
              <label htmlFor="admin-password"><AdminIcon name="lock" className="h-5 w-5" /> Password</label>
              <div className="admin-input-wrap">
                <AdminIcon name="lock" className="admin-input-wrap__icon h-5 w-5" />
                <input id="admin-password" type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} autoComplete="current-password" />
                <button type="button" className="password-visibility" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                  <AdminIcon name={showPassword ? "eyeOff" : "eye"} className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <button onClick={handleLogin} disabled={loading} className="admin-login-submit">
            {loading ? "Logging in…" : <>Login <AdminIcon name="arrow" className="h-5 w-5" /></>}
          </button>

          <div className="admin-or"><span /> <b>OR</b> <span /></div>
          <a href="/login" className="admin-back-login"><AdminIcon name="back" className="h-5 w-5" /> Back to Voter Login</a>
        </section>

        <aside className="admin-feature-stack" aria-label="Administration portal capabilities">
          {securityFeatures.map(({ icon, title, text }) => (
            <div key={title} className="admin-feature-card">
              <span><AdminIcon name={icon} className="h-7 w-7" /></span>
              <div><strong>{title}</strong><small>{text}</small></div>
            </div>
          ))}
        </aside>
      </main>

      <div className="admin-parliament" aria-hidden="true">
        <span className="admin-parliament__flag" /><div className="admin-parliament__dome" /><div className="admin-parliament__columns" />
      </div>
      <footer className="admin-login-footer"><span /> EthVote <b>•</b> Decentralized Democracy <b>•</b> Powered by People <span /></footer>
    </div>
  );
}
