import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, EMOJI } from '../api.js';
import { HeroArt } from '../components/art.jsx';
import ListingCard from '../components/ListingCard.jsx';

const LOGGED_OUT = [
  ['🌱 Register as a farmer', '/login?role=farmer'], ['💰 Become an investor', '/login?role=investor'],
  ['🚜 Hire equipment', '/equipment'], ['🛒 Buy produce', '/marketplace']
];
const BY_ROLE = {
  farmer: [['🌾 Go to my farm', '/my-farm'], ['🤝 Request assistance', '/assistance'], ['🛒 Browse the marketplace', '/marketplace']],
  investor: [['💰 Start investing', '/investment'], ['📊 My dashboard', '/dashboard']],
  buyer: [['🛒 Buy produce', '/marketplace'], ['📜 My orders', '/history']],
  admin: [['🛠️ Open admin portal', '/admin'], ['🛒 View marketplace', '/marketplace']]
};

export default function Home({ user, easy }) {
  const [cats, setCats] = useState([]);
  useEffect(() => { api('/listings/summary').then(setCats).catch(() => {}); }, []);
  const actions = user ? BY_ROLE[user.role] : LOGGED_OUT;
  const stocked = cats.filter((c) => c.count > 0);

  return (
    <>
      <section className="hero">
        <div>
          <h1>Connecting farmers to capital, technology and markets.</h1>
          {!easy && <p>AgriConnect Africa is a marketplace where farmers sell directly to buyers, get help with seeds, manure and other farm needs, and hire the machines they need, all in one place.</p>}
          {user && <p><strong>Welcome back, {user.name.split(' ')[0]}.</strong></p>}
          <div className="paths">{actions.map(([label, to]) => <Link key={to} to={to} className="path">{label}</Link>)}</div>
        </div>
        <HeroArt />
      </section>

      <section id="produce">
        <h2>Fresh from our farmers</h2>
        <div className="chips">
          {cats.map((c) => <Link key={c.category} className={'chip' + (c.count ? '' : ' dim')} to={`/marketplace?category=${encodeURIComponent(c.category)}`}>{EMOJI[c.category]} {c.category} <b>{c.count}</b></Link>)}
        </div>
        {stocked.length === 0 && <p className="muted"></p>}
        {stocked.map((c) => (
          <div key={c.category} className="cat-block">
            <div className="cat-head"><h3>{EMOJI[c.category]} {c.category}</h3><Link to={`/marketplace?category=${encodeURIComponent(c.category)}`}>See all {c.count} →</Link></div>
            <div className="grid">{c.items.map((l) => <ListingCard key={l.id} l={l} user={user} compact />)}</div>
          </div>
        ))}
      </section>

      <section className="split">
        <div>
          <h2>About AgriConnect Africa</h2>
          <p>Across Africa, farmers grow the food we all eat, yet many stay poor. They sell to middlemen at low prices, struggle to find funding, and cannot afford tractors or drones. Buyers, meanwhile, find it hard to trace good produce back to the farm.</p>
          <p>AgriConnect Africa exists to close that gap. We bring farmers, buyers, investors and equipment owners together in one trusted space, starting in Nigeria. Our mission is to help farmers earn fairly using digital tools, direct markets and shared investment.</p>
          <p>Our vision is to become a leading digital agricultural platform in Africa, one that makes it simple for anyone, from a village farmer to a city buyer, to take part.</p>
        </div>
        <div className="card values">
          <h3>What we stand for</h3>
          <p>🤝 <b>Fair trade.</b> Farmers set their own prices and deal directly with buyers.</p>
          <p>🔎 <b>Transparency.</b> Every order, investment and booking is recorded in your history.</p>
          <p>📱 <b>Simple for everyone.</b> Easy Mode uses big buttons and fewer words for low-literacy users.</p>
          <p>🌍 <b>Built for Africa.</b> Naira pricing, local states, and local languages as we grow.</p>
        </div>
      </section>

      <section>
        <h2>Why use AgriConnect?</h2>
        <div className="grid three">
          <div className="card"><h3>🌾 For farmers</h3><ul>
            <li>Sell directly and keep more of your income</li><li>Show your produce and farmland with photos</li>
            <li>Request seedlings, manure, land and other farm assistance</li><li>Hire tractors and drones instead of buying them</li><li>Keep a record of every sale you make</li></ul></div>
          <div className="card"><h3>💰 For investors</h3><ul>
            <li>Choose a fixed-term plan from 12 months to 5 years</li><li>Watch a live countdown to your maturity date</li>
            <li>See your amount, rate and expected payout at a glance</li><li>Track every investment in your history</li></ul></div>
          <div className="card"><h3>🛒 For buyers</h3><ul>
            <li>Buy fresh produce straight from the farm</li><li>Choose farmers in your own state</li>
            <li>See photos and prices before you order</li><li>Track every order from request to delivery</li></ul></div>
        </div>
      </section>

      <section>
        <h2>How it works</h2>
        <ol className="steps">
          <li><b>Register free</b> as a farmer, buyer or investor.</li>
          <li><b>List or browse.</b> Farmers upload produce by category; buyers search by location.</li>
          <li><b>Order, fund or book.</b> Place an order, back a farm, or hire equipment.</li>
          <li><b>Track everything.</b> Your history shows every trade and activity.</li>
        </ol>
      </section>

      {!user && (
        <section className="cta"><h2>Ready to grow with us?</h2>
          <div className="paths"><Link className="path" to="/login?role=farmer">🌱 I am a farmer</Link><Link className="path" to="/login?role=investor">💰 I want to invest</Link><Link className="path" to="/login?role=buyer">🛒 I want to buy</Link></div></section>
      )}
    </>
  );
}
