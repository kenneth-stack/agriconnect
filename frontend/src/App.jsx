import { useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { session } from './api.js';
import Home from './pages/Home.jsx';
import Marketplace from './pages/Marketplace.jsx';
import Investment from './pages/Investment.jsx';
import Equipment from './pages/Equipment.jsx';
import Assistant from './pages/Assistant.jsx';
import Login from './pages/Login.jsx';

export default function App() {
  const [user, setUser] = useState(session.user);
  // Easy Mode: big icons, minimal reading (the proposal's low-literacy mode)
  const [easy, setEasy] = useState(localStorage.getItem('easy') === '1');
  const nav = useNavigate();
  const toggleEasy = () => { localStorage.setItem('easy', easy ? '0' : '1'); setEasy(!easy); };
  const logout = () => { session.clear(); setUser(null); nav('/'); };

  return (
    <div className={easy ? 'easy' : ''}>
      <header className="top">
        <NavLink to="/" className="brand">AgriConnect Africa</NavLink>
        <nav>
          <NavLink to="/marketplace">Buy produce</NavLink>
          <NavLink to="/investment">Invest</NavLink>
          <NavLink to="/equipment">Hire equipment</NavLink>
          <NavLink to="/assistant">Ask the AI</NavLink>
        </nav>
        <div className="actions">
          <button className="ghost" onClick={toggleEasy} aria-pressed={easy}>{easy ? 'Smart mode' : 'Easy mode'}</button>
          {user ? <button className="ghost" onClick={logout}>Log out ({user.name.split(' ')[0]})</button>
                : <NavLink className="btn" to="/login">Log in</NavLink>}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home easy={easy} />} />
          <Route path="/marketplace" element={<Marketplace user={user} />} />
          <Route path="/investment" element={<Investment user={user} />} />
          <Route path="/equipment" element={<Equipment user={user} />} />
          <Route path="/assistant" element={<Assistant user={user} />} />
          <Route path="/login" element={<Login onAuth={setUser} />} />
        </Routes>
      </main>
    </div>
  );
}
