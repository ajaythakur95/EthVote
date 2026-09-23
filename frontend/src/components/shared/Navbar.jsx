import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWallet } from "../../hooks/useWallet";

const MenuIcon = ({ close = false }) => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true">
    {close ? <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
  </svg>
);

export default function Navbar() {
  const { user, logout } = useAuth();
  const { address, hasSBT, connect, connecting } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null;
  const isAdminUser = ["admin", "superadmin"].includes(user?.role);
  const isVoterUser = user?.role === "voter";
  const desktopLinks = isAdminUser
    ? [{ to: "/", label: "Home" }, { to: "/admin", label: "Overview" }, { to: "/admin/elections", label: "Elections" }, { to: "/admin/voters", label: "Voters" }, { to: "/admin/candidates", label: "Candidates" }]
    : isVoterUser
      ? [{ to: "/", label: "Home" }, { to: "/elections", label: "Elections" }, { to: "/candidate/register", label: "Run as Candidate" }, { to: "/profile", label: "My Profile" }]
      : [{ to: "/", label: "Home" }, { to: "/elections", label: "Elections" }, { to: "/#how-it-works", label: "How it Works" }, { to: "/#about", label: "About" }];

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const closeMenu = () => setMenuOpen(false);
  const isCurrent = (to) => {
    const [path, hash] = to.split("#");
    if (hash) return location.pathname === path && location.hash === `#${hash}`;
    if (to === "/") return location.pathname === "/" && !location.hash;
    return location.pathname.startsWith(path);
  };
  const navLinkClass = (to) => `nav-link ${isCurrent(to) ? "nav-link--active" : ""}`;

  return (
    <nav className="site-nav">
      <div className="site-nav__inner">
        <Link to="/" className="brand" onClick={closeMenu} aria-label="EthVote home">
          <span className="brand__mark">E</span><span className="brand__name">EthVote</span><span className="brand__badge">Blockchain</span>
        </Link>

        <div className="site-nav__links" aria-label="Primary navigation">
          {desktopLinks.map(({ to, label }) => <Link key={to} to={to} className={navLinkClass(to)}>{label}</Link>)}
        </div>

        <div className="site-nav__actions">
          {address ? (
            <div className="wallet-status" title={address}>
              <span className={`wallet-status__dot ${hasSBT ? "wallet-status__dot--verified" : ""}`} />
              <span className="wallet-status__label">Connected</span><span className="wallet-status__address">{shortAddr}</span>{hasSBT && <span className="wallet-status__sbt">SBT</span>}
            </div>
          ) : (
            <button onClick={connect} disabled={connecting} className="wallet-connect"><span />{connecting ? "Connecting..." : "Connect Wallet"}</button>
          )}

          {user ? (
            <div className="user-controls">
              <div className="user-avatar">{user.name?.[0]?.toUpperCase()}</div><span className="user-name">{user.name?.split(" ")[0]}</span><button onClick={handleLogout} className="logout-button">Logout</button>
            </div>
          ) : (
            <div className="auth-controls"><Link to="/login" className="nav-login">Login</Link><Link to="/register" className="nav-register">Register</Link></div>
          )}

          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen}><MenuIcon close={menuOpen} /></button>
        </div>
      </div>

      {menuOpen && (
        <div className="mobile-nav">
          {desktopLinks.map(({ to, label }) => <Link key={to} to={to} onClick={closeMenu} className={navLinkClass(to)}>{label}</Link>)}
          {!user && <div className="mobile-nav__auth"><Link to="/login" onClick={closeMenu}>Login</Link><Link to="/register" onClick={closeMenu}>Register to vote</Link></div>}
          {user && <button onClick={handleLogout} className="mobile-logout">Logout</button>}
        </div>
      )}
    </nav>
  );
}
