import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { api, session } from './api.js';
import Home from './pages/Home.jsx';
import Marketplace from './pages/Marketplace.jsx';
import FarmerProfile from './pages/FarmerProfile.jsx';
import Invest from './pages/Invest.jsx';
import Equipment from './pages/Equipment.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyFarm from './pages/MyFarm.jsx';
import Assistance from './pages/Assistance.jsx';
import History from './pages/History.jsx';
import Kyc from './pages/Kyc.jsx';
import Wallet from './pages/Wallet.jsx';
import Profile from './pages/Profile.jsx';
import Contact from './pages/Contact.jsx';
import Avatar from './components/Avatar.jsx';
import Admin from './pages/Admin.jsx';
import Assistant from './pages/Assistant.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';

const kycOk = (u) => u.role === 'admin' || ['submitted', 'verified'].includes(u.kyc);

// Signed-in pages: send visitors to log in, and people without a KYC profile to complete it first
function Gate({ user, children }) {
  if (!user) return <Navigate to="/login" />;
  return kycOk(user) ? children : <Navigate to="/dashboard" />;
}

export default function App() {
  const [user, setUserState] = useState(session.user);
  const [easy, setEasy] = useState(localStorage.getItem('easy') === '1');
  const [menu, setMenu] = useState(false);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const setUser = (u) => { if (u) localStorage.setItem('user', JSON.stringify(u)); setUserState(u); };
  const toggleEasy = () => { localStorage.setItem('easy', easy ? '0' : '1'); setEasy(!easy); };
  const logout = () => { session.clear(); setUserState(null); nav('/'); };
  const go = () => setMenu(false);

  // keep the KYC status fresh (an admin may have reviewed it since last login)
  useEffect(() => {
    if (!user) return;
    api('/profile').then((p) => {
      const patch = {};
      if ((p.avatar_id ?? null) !== (user.avatar ?? null)) patch.avatar = p.avatar_id;
      if (user.role !== 'admin' && p.kyc.status !== user.kyc) patch.kyc = p.kyc.status;
      if (Object.keys(patch).length) setUser({ ...user, ...patch });
    }).catch(() => {});
  }, []);

  const links = !user
    ? [['/marketplace', 'Buy produce'], ['/investment', 'Invest'], ['/equipment', 'Hire equipment'], ['/assistant', 'Ask the AI']]
    : [
        ['/dashboard', 'Dashboard'],
        ...(user.role === 'farmer' ? [['/my-farm', 'My farm'], ['/assistance', 'Assistance/Funding']] : []),
        ...(user.role === 'admin' ? [['/admin', 'Admin portal']] : []),
        ['/marketplace', 'Marketplace'], ['/investment', 'Invest'], ['/equipment', 'Equipment'],
        ...(['investor', 'buyer'].includes(user.role) ? [['/wallet', 'Wallet']] : []),
        ...(user.role !== 'admin' ? [['/history', 'History']] : []),
        ['/profile', 'My profile'],
        ...(user.role !== 'admin' ? [['/kyc', 'KYC verification']] : []),
        ['/assistant', 'Ask the AI']
      ];

  return (
    <div className={easy ? 'easy' : ''}>
      <header className="top">
        <Link to="/" className="brand" onClick={go}>🌱 AgriConnect Africa</Link>
        <button className="burger ghost" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu(!menu)}>☰</button>
        <nav className={menu ? 'open' : ''} aria-label="Main">
          {links.map(([to, label]) => <NavLink key={to} to={to} onClick={go}>{label}</NavLink>)}
        </nav>
        <div className={'actions' + (menu ? ' open' : '')}>
          <button className="ghost" onClick={toggleEasy} aria-pressed={easy}>{easy ? 'Smart mode' : 'Easy mode'}</button>
          {user && <Link to="/profile" className="me" onClick={go} title="My profile"><Avatar id={user.avatar} name={user.name} size={36} /></Link>}
          {user ? <button className="ghost" onClick={logout}>Log out ({user.name.split(' ')[0]})</button>
                : <NavLink className="btn" to="/login">Log in</NavLink>}
        </div>
      </header>
      {user && !kycOk(user) && pathname !== '/kyc' && (
        <Link to="/kyc" className="banner">Proceed to complete your KYC to have full access →</Link>
      )}
      <main>
        <Routes>
          <Route path="/" element={<Home user={user} easy={easy} />} />
          <Route path="/marketplace" element={<Marketplace user={user} />} />
          <Route path="/farmers/:id" element={<FarmerProfile user={user} />} />
          <Route path="/investment" element={<Invest user={user} />} />
          <Route path="/equipment" element={<Equipment user={user} />} />
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/my-farm" element={<Gate user={user}><MyFarm user={user} /></Gate>} />
          <Route path="/assistance" element={<Gate user={user}><Assistance user={user} /></Gate>} />
          <Route path="/history" element={<Gate user={user}><History user={user} /></Gate>} />
          <Route path="/wallet" element={<Gate user={user}><Wallet user={user} /></Gate>} />
          <Route path="/contact" element={<Contact user={user} />} />
          <Route path="/profile" element={<Profile user={user} onChange={setUser} />} />
          <Route path="/kyc" element={<Kyc user={user} onDone={(status) => setUser({ ...user, kyc: status })} />} />
          <Route path="/admin" element={<Admin user={user} />} />
          <Route path="/assistant" element={<Assistant user={user} />} />
          <Route path="/login" element={<Login onAuth={setUser} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </main>
      <footer className="foot">
        <strong>AgriConnect Africa</strong> · Connecting farmers to capital, technology and markets.
        <br /><span className="muted"><Link to="/contact">Contact us</Link> · <a href="mailto:contact@agriconnect.com">contact@agriconnect.com</a> · Nigeria</span>
      </footer>
    </div>
  );
}
