import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Icon = ({ name, className = "" }) => {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    chart: <><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19H2" /></>,
    identity: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M5.5 17c.7-2 2-3 3.5-3s2.8 1 3.5 3M15 9h3M15 13h3M15 17h2" /></>,
    shield: <path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3Z" />,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    link: <><path d="M10 13.5a4 4 0 0 0 5.7.1l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5" /><path d="M14 10.5a4 4 0 0 0-5.7-.1l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.5-1.5" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
};

function FloatingBadge({ className, icon, title, detail }) {
  return (
    <div className={`feature-float ${className}`}>
      <div className="feature-float__icon">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div>
        <p>{title}</p>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function VotingIllustration() {
  return (
    <div className="hero-visual" aria-label="A secure digital ballot box illustration" role="img">
      <div className="hero-orbit hero-orbit--one" />
      <div className="hero-orbit hero-orbit--two" />
      <div className="hero-orbit hero-orbit--three" />
      <div className="hero-visual__glow" />
      <div className="ballot-box">
        <div className="ballot-box__back" />
        <div className="ballot-box__side" />
        <div className="ballot-box__front">
          <div className="eth-mark" aria-hidden="true">
            <span className="eth-mark__top" />
            <span className="eth-mark__bottom" />
          </div>
        </div>
        <div className="ballot-box__lid"><div className="ballot-box__slot" /></div>
        <div className="ballot-card">
          <div className="ballot-card__fold" />
          <Icon name="check" className="ballot-card__check" />
        </div>
      </div>
      <div className="visual-base" />
      <FloatingBadge className="feature-float--aadhaar" icon="identity" title="Aadhaar Verified" detail="One Person, One Vote" />
      <FloatingBadge className="feature-float--encrypted" icon="lock" title="Encrypted Voting" detail="Your vote stays private" />
      <FloatingBadge className="feature-float--chain" icon="link" title="On-Chain Security" detail="Immutable & Transparent" />
      <FloatingBadge className="feature-float--nft" icon="identity" title="Soulbound NFT" detail="Unique Voter Identity" />
    </div>
  );
}

const features = [
  { icon: "identity", accent: "identity", title: "Aadhaar Identity", desc: "Two-path registration with OTP verification and EPIC cross-check for genuine voters." },
  { icon: "shield", accent: "soulbound", title: "Soulbound NFT", desc: "Non-transferable identity token permanently linked to your wallet — 1 voter, 1 token." },
  { icon: "lock", accent: "encrypted", title: "Encrypted Voting", desc: "Commitment-based ballot casting prevents vote tampering and protects voter privacy." },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="homepage overflow-hidden">
      <section className="hero-shell">
        <div className="page-grid" aria-hidden="true" />
        <div className="hero-ambient hero-ambient--left" aria-hidden="true" />
        <div className="hero-ambient hero-ambient--right" aria-hidden="true" />
        <div className="hero-dots" aria-hidden="true" />

        <div className="hero-content">
          <div className="hero-copy">
            <div className="polygon-badge">
              <span className="polygon-badge__glyph"><span /><span /><span /></span>
              Secured by Polygon Blockchain
            </div>
            <h1>A Fairer Tomorrow<br />Starts with <span>Your Vote</span></h1>
            <p className="hero-description">EthVote brings transparency, security, and trust to the electoral process with Aadhaar identity verification, Soulbound NFT credentials, and encrypted on-chain voting.</p>
            <div className="hero-actions">
              <Link to={user ? "/elections" : "/register"} className="button-primary">
                {user ? "Explore Elections" : "Register to Vote"} <Icon name="arrow" className="h-4 w-4" />
              </Link>
              <Link to="/elections" className="button-secondary"><Icon name="chart" className="h-4 w-4" /> View Elections</Link>
            </div>
            <div className="trust-metrics" aria-label="EthVote platform principles">
              <div><strong>100%</strong><span>Transparent</span></div>
              <div><strong>Secure</strong><span>Blockchain Powered</span></div>
              <div><strong>Trusted</strong><span>Verified Voters</span></div>
            </div>
          </div>
          <VotingIllustration />
        </div>
      </section>

      <section className="benefits-section" id="how-it-works">
        <div className="benefits-ambient" aria-hidden="true" />
        <div className="section-heading">
          <p className="eyebrow">Verified from identity to ballot</p>
          <h2>Built for a <span>Stronger Democracy</span></h2>
          <p>Modern technology for a more transparent, accessible, and trustworthy voting experience.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon, accent, title, desc }) => (
            <article key={title} className={`group benefit-card benefit-card--${accent}`}>
              <div className="benefit-card__icon"><Icon name={icon} className="h-6 w-6" /></div>
              <div><h3>{title}</h3><p>{desc}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="civic-close" id="about">
        <div className="civic-close__parliament" aria-hidden="true">
          <span className="parliament-flag"><i /><b /><em /></span>
          <div className="parliament-dome" />
          <div className="parliament-columns" />
        </div>
        <p><span /> Decentralized <b>•</b> Transparent <b>•</b> People Powered <span /></p>
      </section>
    </div>
  );
}
