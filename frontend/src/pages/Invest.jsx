import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Plans from '../components/Plans.jsx';

export default function Invest({ user }) {
  const [plans, setPlans] = useState([]);
  useEffect(() => { api('/plans').then(setPlans).catch(() => {}); }, []);
  return (
    <>
      <h2>Grow your money with farming</h2>
      <p className="muted">Pick a fixed-term plan from 12 months to 5 years. The rate you see is locked in when you invest, and you can follow a live countdown to your maturity date on your dashboard.</p>
      <Plans user={user} plans={plans} />
      {!plans.length && <p className="muted">Plans will appear here soon.</p>}
    </>
  );
}
