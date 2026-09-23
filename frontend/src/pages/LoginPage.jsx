import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";

const VoterIcon = ({ name, className = "" }) => {
  const props = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const icons = {
    shield: <path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3Z" />,
    lock: <><rect x="4.5" y="10" width="15" height="10.5" rx="2" /><path d="M8 10V7.2a4 4 0 0 1 8 0V10M12 14.2v2.3" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    back: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    privacy: <><path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3Z" /><path d="m9.5 12 1.6 1.6 3.8-3.8" /></>,
    chain: <><path d="M10 13.5a4 4 0 0 0 5.7.1l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5" /><path d="M14 10.5a4 4 0 0 0-5.7-.1l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.5-1.5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" /></>,
    spinner: <path d="M20 12a8 8 0 1 1-2.34-5.66" />,
  };
  return <svg {...props}>{icons[name]}</svg>;
};

const securityCards = [
  { icon: "privacy", title: "Privacy First", text: "Your Aadhaar data stays protected", position: "voter-security-card--left" },
  { icon: "shield", title: "Verified Identity", text: "Secure voter authentication", position: "voter-security-card--right-top" },
  { icon: "chain", title: "Blockchain Ready", text: "Verified voters can securely participate", position: "voter-security-card--right-bottom" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("idle");
  const [message, setMessage] = useState("");
  const [aadhaarZip, setAadhaarZip] = useState(null);
  const [shareCode, setShareCode] = useState("");
  const [aadhaarData, setAadhaarData] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!aadhaarZip) { setMessage("ZIP file select karo"); return; }
    if (shareCode.length < 4) { setMessage("Share Code 4 digit ka hona chahiye"); return; }

    setStep("verifying"); setMessage("");
    try {
      const fd = new FormData();
      fd.append("aadhaarZip", aadhaarZip);
      fd.append("shareCode", shareCode);

      const res = await api.post("/auth/aadhaar-offline/verify", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.alreadyRegistered) {
        setAadhaarData({
          aadhaarHash: res.data.aadhaarHash,
          name: res.data.voter?.name,
          constituency: res.data.voter?.constituency,
          photo: res.data.voter?.photo || null,
        });
        setStep("confirm");
        return;
      }

      setAadhaarData(res.data.voter);
      setStep("confirm");
    } catch (e) {
      setStep("error");
      setMessage(e.response?.data?.error || "Verification fail ho gayi.");
    }
  };

  const handleLogin = async () => {
    if (!aadhaarData?.photo) {
      setStep("error");
      setMessage("Aadhaar ZIP me photo nahi mila. UIDAI se naya Offline XML download karke dobara verify karein.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/aadhaar-offline/login", {
        aadhaarHash: aadhaarData.aadhaarHash,
      });

      if (res.data.requiresLiveness && res.data.livenessToken) {
        navigate("/liveness-verification", {
          replace: true,
          state: {
            livenessToken: res.data.livenessToken,
            aadhaarPhoto: aadhaarData.photo,
          },
        });
        return;
      }
      if (res.data.token) {
        login(res.data.token, res.data.user);
        setStep("done");
        setTimeout(() => navigate("/elections"), 1500);
      }
    } catch (e) {
      const errMsg = e.response?.data?.error || "Login fail ho gayi.";
      const notRegistered = e.response?.data?.notRegistered;
      if (notRegistered) {
        setMessage("Ye Aadhaar registered nahi hai. Pehle register karein.");
        setStep("not_registered");
      } else {
        setStep("error");
        setMessage(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep("idle"); setMessage("");
    setAadhaarZip(null); setShareCode("");
    setAadhaarData(null);
  };

  return (
    <div className="voter-login-page">
      <div className="voter-login-page__grid" aria-hidden="true" />
      <div className="voter-login-page__glow voter-login-page__glow--left" aria-hidden="true" />
      <div className="voter-login-page__glow voter-login-page__glow--center" aria-hidden="true" />
      <div className="voter-login-page__dots" aria-hidden="true" />
      <div className="voter-login-page__curves" aria-hidden="true" />

      <section className="voter-login-intro">
        <div className="voter-login-badge"><VoterIcon name="chain" className="h-4 w-4" /> Secured Voter Verification</div>
        <h1>Welcome <span>Back</span></h1>
        <p>Securely verify your identity to access EthVote.</p>
        <a href="/admin-login" className="voter-admin-link"><VoterIcon name="shield" className="h-4 w-4" /> Admin Login</a>
      </section>

      <main className="voter-login-layout">
        <aside className="voter-security-stack" aria-label="Identity verification benefits">
          {securityCards.map(({ icon, title, text, position }) => (
            <div className={`voter-security-card ${position}`} key={title}>
              <span><VoterIcon name={icon} className="h-6 w-6" /></span><div><strong>{title}</strong><small>{text}</small></div>
            </div>
          ))}
        </aside>

        <section className="voter-verification-card" aria-labelledby="voter-verification-title">
          <div className="voter-card-progress" aria-label="Verification progress">
            <div className="voter-card-progress__title"><b>Step 1</b><span>Identity Verification</span></div>
            <div className="voter-progress-steps"><i className="is-active">1</i><span>Identity</span><i>2</i><span>Verification</span><i>3</i><span>Access</span></div>
          </div>

          {message && <div className="voter-login-message" role="alert">{message}</div>}

          {step === "idle" && (
            <>
              <div className="aadhaar-info-panel">
                <div className="aadhaar-info-panel__heading"><span><VoterIcon name="file" className="h-5 w-5" /></span><div><h2 id="voter-verification-title">How to get your Aadhaar Offline ZIP?</h2><p>Use the secure offline e-KYC process from myAadhaar.</p></div></div>
                <ol>
                  <li><b>01</b><span>Visit myAadhaar and download your Aadhaar Offline e-KYC ZIP.</span></li>
                  <li><b>02</b><span>Choose <strong>Offline KYC → Download XML</strong>.</span></li>
                  <li><b>03</b><span>Enter the 4-digit Share Code used to protect the ZIP.</span></li>
                  <li><b>04</b><span>Upload the ZIP file and verify your identity.</span></li>
                </ol>
                <a href="https://myaadhaar.uidai.gov.in" target="_blank" rel="noreferrer" className="aadhaar-site-link">Visit myAadhaar <VoterIcon name="external" className="h-3.5 w-3.5" /></a>
              </div>

              <div className="voter-form-fields">
                <div className="voter-field">
                  <label>Aadhaar Offline ZIP <b>*</b></label>
                  <label className={`voter-upload-zone ${aadhaarZip ? "voter-upload-zone--selected" : ""}`}>
                    <input type="file" accept=".zip" onChange={(e) => setAadhaarZip(e.target.files[0])} />
                    <span className="voter-upload-zone__icon"><VoterIcon name={aadhaarZip ? "check" : "upload"} className="h-5 w-5" /></span>
                    <span className="voter-upload-zone__copy"><strong>{aadhaarZip ? aadhaarZip.name : "Upload Aadhaar Offline ZIP"}</strong><small>{aadhaarZip ? "File selected" : "ZIP file only"}</small></span>
                    <span className="voter-upload-zone__button">Choose File</span>
                  </label>
                </div>

                <div className="voter-field">
                  <label htmlFor="share-code"><VoterIcon name="lock" className="h-4 w-4" /> Share Code <span>(4 digits)</span> <b>*</b></label>
                  <input id="share-code" type="password" maxLength={4} placeholder="• • • •" value={shareCode} onChange={(e) => setShareCode(e.target.value.replace(/\D/g, ""))} className="share-code-input" aria-describedby="share-code-help" />
                  <p id="share-code-help">Enter the 4-digit code used when downloading the ZIP.</p>
                </div>
              </div>

              <button onClick={handleVerify} disabled={!aadhaarZip || shareCode.length < 4} className="voter-verify-button"><VoterIcon name="shield" className="h-5 w-5" /> Verify Aadhaar <VoterIcon name="arrow" className="h-5 w-5" /></button>
              <p className="voter-privacy-note"><VoterIcon name="privacy" className="h-4 w-4" /> Your Aadhaar number is never stored or displayed in plaintext.</p>
            </>
          )}

          {step === "verifying" && <div className="voter-state-panel"><VoterIcon name="spinner" className="voter-state-panel__spinner h-10 w-10" /><h2>Verifying your identity</h2><p>Your Aadhaar Offline ZIP is being securely checked.</p></div>}

          {step === "confirm" && (
            <div className="voter-state-panel voter-state-panel--success">
              <span className="voter-state-panel__success-icon"><VoterIcon name="check" className="h-8 w-8" /></span><h2>Identity verified</h2>
              {aadhaarData?.name && <p className="voter-state-panel__person">{aadhaarData.name} · Age: {aadhaarData.age}</p>}
              <button onClick={handleLogin} disabled={loading} className="voter-verify-button voter-verify-button--login">{loading ? "Logging in..." : <>Login <VoterIcon name="arrow" className="h-5 w-5" /></>}</button>
              <button onClick={handleReset} className="voter-reset-button"><VoterIcon name="back" className="h-4 w-4" /> Wapas jaao</button>
            </div>
          )}

          {step === "not_registered" && (
            <div className="voter-state-panel voter-state-panel--warning">
              <span className="voter-state-panel__warning-icon"><VoterIcon name="info" className="h-8 w-8" /></span><h2>Registration needed</h2><p>Pehle register karein — phir login karein.</p>
              <a href="/register" className="voter-verify-button">Register karein <VoterIcon name="arrow" className="h-5 w-5" /></a>
              <button onClick={handleReset} className="voter-reset-button"><VoterIcon name="back" className="h-4 w-4" /> Wapas jaao</button>
            </div>
          )}

          {step === "done" && <div className="voter-state-panel voter-state-panel--success"><span className="voter-state-panel__success-icon"><VoterIcon name="check" className="h-8 w-8" /></span><h2>Login successful</h2><p>Elections page par redirect ho raha hai...</p></div>}

          {step === "error" && <div className="voter-state-panel voter-state-panel--error"><span className="voter-state-panel__warning-icon"><VoterIcon name="info" className="h-8 w-8" /></span><h2>Verification could not continue</h2><button onClick={handleReset} className="voter-verify-button">Dobara Try Karein <VoterIcon name="arrow" className="h-5 w-5" /></button></div>}
        </section>
      </main>

      <div className="voter-parliament" aria-hidden="true"><span className="voter-parliament__flag" /><div className="voter-parliament__dome" /><div className="voter-parliament__columns" /></div>
      <footer className="voter-login-footer"><span /> EthVote <b>•</b> Secure <b>•</b> Transparent <b>•</b> People Powered <span /></footer>
    </div>
  );
}
