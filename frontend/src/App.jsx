import { useState } from 'react';
import { Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom';
import { session } from './api.js';
import Home from './pages/Home.jsx';
import Marketplace from './pages/Marketplace.jsx';
import FarmerProfile from './pages/FarmerProfile.jsx';
import Investment from './pages/Investment.jsx';
import Equipment from './pages/Equipment.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyFarm from './pages/MyFarm.jsx';
import History from './pages/History.jsx';
import Admin from './pages/Admin.jsx';
import Assistant from './pages/Assistant.jsx';
import Login from './pages/Login.jsx';

export default function App() {
  const [user, setUser] = useState(session.user);
  const [easy, setEasy] = useState(localStorage.getItem('easy') === '1');
  const [menu, setMenu] = useState(false);
  const nav = useNavigate();
  const toggleEasy = () => { localStorage.setItem('easy', easy ? '0' : '1'); setEasy(!easy); };
  const logout = () => { session.clear(); setUser(null); nav('/'); };
  const go = () => setMenu(false);

  // Signed-in people get a role-specific menu bar; visitors get the public one
  const links = !user
    ? [['/marketplace', 'Buy produce'], ['/investment', 'Invest'], ['/equipment', 'Hire equipment'], ['/assistant', 'Ask the AI']]
    : [
        ['/dashboard', 'Dashboard'],
        ...(user.role === 'farmer' ? [['/my-farm', 'My farm']] : []),
        ...(user.role === 'admin' ? [['/admin', 'Admin portal']] : []),
        ['/marketplace', 'Marketplace'], ['/investment', user.role === 'investor' ? 'Farms to fund' : 'Funding'],
        ['/equipment', 'Equipment'], ['/history', 'History'], ['/assistant', 'Ask the AI']
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
          {user ? <button className="ghost" onClick={logout}>Log out ({user.name.split(' ')[0]})</button>
                : <NavLink className="btn" to="/login">Log in</NavLink>}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home user={user} easy={easy} />} />
          <Route path="/marketplace" element={<Marketplace user={user} />} />
          <Route path="/farmers/:id" element={<FarmerProfile user={user} />} />
          <Route path="/investment" element={<Investment user={user} />} />
          <Route path="/equipment" element={<Equipment user={user} />} />
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/my-farm" element={<MyFarm user={user} />} />
          <Route path="/history" element={<History user={user} />} />
          <Route path="/admin" element={<Admin user={user} />} />
          <Route path="/assistant" element={<Assistant user={user} />} />
          <Route path="/login" element={<Login onAuth={setUser} />} />
        </Routes>
      </main>
      <footer className="foot">
        <strong>AgriConnect Africa</strong> · Connecting farmers to capital, technology and markets.
        <br /><span className="muted">Contact: hello@your-domain.com · Lagos, Nigeria (replace with your details)</span>
      </footer>
    </div>
  );
}
