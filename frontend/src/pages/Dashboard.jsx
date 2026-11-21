import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, naira, when } from '../api.js';
import Countdown from '../components/Countdown.jsx';
import Plans, { monthsLabel } from '../components/Plans.jsx';
import { WalletCard, TX_LABEL } from '../components/WalletCard.jsx';
import { OrderTrack, orderLabel, PAY } from '../components/orders.jsx';

const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const Stat = ({ label, value, to, hint }) => {
  const body = <><b>{value}</b><span>{label}</span>{hint && <small className="muted">{hint}</small>}</>;
  return to ? <Link to={to} className="card stat link">{body}</Link> : <div className="card stat">{body}</div>;
};
const Activity = ({ items = [] }) => (
  <div className="card"><h3>Recent activity</h3>
    {!items.length && <p className="muted">Nothing yet.</p>}
    <ul className="timeline">{items.slice(0, 6).map((a) => <li key={a.id}><span>{when(a.created_at)}</span> {a.detail}</li>)}</ul>
    <Link to="/history">See everything →</Link>
  </div>
);
const Shortcuts = ({ items }) => <div className="card"><h3>Quick actions</h3><div className="shortcuts">{items.map(([l, to]) => <Link key={to} to={to} className="path">{l}</Link>)}</div></div>;

function OrderRow({ o, actions }) {
  return (
    <article className="card order">
      <div className="order-top"><b>{o.title}</b><span className="muted">× {o.quantity} {o.unit}</span><span className="grow" /><b>{naira(o.total)}</b></div>
      <p className="muted small">{o.side === 'buying' ? `From ${o.farmer}` : `For ${o.buyer}`} · {when(o.created_at)}{o.delivery_fee > 0 ? ` · incl. ${naira(o.delivery_fee)} delivery` : o.fulfilment === 'pickup' ? ' · pickup' : ''}</p>
      <OrderTrack o={o} />
      <p className="small"><b>{orderLabel(o)}</b> · <span className="muted">{PAY[o.payment_status]}</span></p>
      {actions}
    </article>
  );
}

/* ---------------- Buyer ---------------- */
function BuyerDash() {
  const [h, setH] = useState(null);
  const [w, setW] = useState(null);
  const loadW = () => api('/wallet').then(setW).catch(() => {});
  useEffect(() => { api('/me/history').then(setH).catch(() => {}); loadW(); }, []);
  const mine = (h?.orders || []).filter((o) => o.side === 'buying');
  return (
    <>
      <div className="grid stats">
        <Stat label="Wallet balance" value={naira(w?.balance ?? 0)} to="/wallet" />
        <Stat label="Orders in progress" value={mine.filter((o) => ['pending', 'confirmed'].includes(o.status)).length} to="/history" />
        <Stat label="Delivered" value={mine.filter((o) => o.status === 'completed').length} to="/history" />
        <Stat label="Spent on produce" value={naira(sum(mine.filter((o) => o.status !== 'cancelled'), (o) => o.total))} hint="paid orders leave your wallet" />
      </div>
      <div className="dash">
        <section>
          <h3>My orders</h3>
          {h && !mine.length && <p className="muted">You have not bought anything yet. <Link to="/marketplace">Find produce near you →</Link></p>}
          <div className="stack">{mine.slice(0, 6).map((o) => <OrderRow key={o.id} o={o} />)}</div>
          {mine.length > 0 && <p><Link to="/history">See all {mine.length} orders →</Link></p>}
        </section>
        <aside className="stack">
          {w && <WalletCard w={w} reload={loadW} compact />}
          <Shortcuts items={[['🛒 Find produce near me', '/marketplace'], ['🚜 Hire equipment', '/equipment'], ['📜 All orders', '/history']]} />
          <Activity items={h?.activity} />
        </aside>
      </div>
    </>
  );
}

/* ---------------- Investor ---------------- */
const LABEL = { active: 'Active', matured: 'Matured', paid: 'Paid out', cancelled: 'Cancelled' };
function InvestmentCard({ i }) {
  const start = Date.parse(i.start_date), end = Date.parse(i.maturity_date);
  const pct = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  return (
    <article className="card inv">
      <div className="inv-top"><b>{monthsLabel(i.duration_months)}</b><span className={'badge ' + i.display_status}>{LABEL[i.display_status]}</span></div>
      <div className="inv-amt">{naira(i.amount)}</div>
      <p className="muted">{i.rate_percent}% per year · expected payout <b>{naira(i.amount + i.expected_return)}</b></p>
      {i.display_status === 'active' && <>
        <p className="muted small">Time left until maturity</p><Countdown to={i.maturity_date} />
        <div className="bar" aria-hidden><i style={{ width: pct + '%' }} /></div>
        <p className="muted small">Started {when(i.start_date)} · matures {when(i.maturity_date)}</p>
      </>}
      {i.display_status === 'matured' && <p className="ok">Matured on {when(i.maturity_date)}. Your payout is being processed.</p>}
      {i.display_status === 'paid' && <p className="ok">Paid out to your wallet. Thank you for investing.</p>}
    </article>
  );
}

function InvestorDash({ user }) {
  const [h, setH] = useState(null);
  const [w, setW] = useState(null);
  const [plans, setPlans] = useState([]);
  const load = () => { api('/me/history').then(setH).catch(() => {}); api('/wallet').then(setW).catch(() => {}); };
  useEffect(() => { load(); api('/plans').then(setPlans).catch(() => {}); }, []);
  const inv = (h?.investments || []).filter((i) => i.display_status !== 'cancelled');
  const live = inv.filter((i) => ['active', 'matured'].includes(i.display_status));
  return (
    <>
      <div className="grid stats">
        <Stat label="Wallet balance" value={naira(w?.balance ?? 0)} to="/wallet" hint="free to invest or withdraw" />
        <Stat label="In your plans" value={naira(sum(live, (i) => i.amount))} hint="locked until maturity, not in your wallet" />
        <Stat label="Expected returns" value={naira(sum(live, (i) => i.expected_return))} />
        <Stat label="Active plans" value={live.length} />
      </div>
      <div className="dash">
        <div>
          <section>
            <h3>My investments</h3>
            {h && !inv.length && <p className="muted">You have not started an investment yet. Add money to your wallet, then pick a plan below.</p>}
            <div className="grid cards">{inv.map((i) => <InvestmentCard key={i.id} i={i} />)}</div>
          </section>
          <section>
            <h3>Start a new investment</h3>
            <Plans user={user} plans={plans} onInvested={load} />
          </section>
        </div>
        <aside className="stack">
          {w && <WalletCard w={w} reload={load} compact />}
          <div className="card"><h3>Recent wallet activity</h3>
            {!w?.transactions.length && <p className="muted">No transactions yet.</p>}
            <ul className="timeline">{(w?.transactions || []).slice(0, 5).map((t) => <li key={t.id}><span>{when(t.created_at)}</span> {TX_LABEL[t.type] || t.type}: <b className={t.amount < 0 ? 'neg' : 'pos'}>{t.amount < 0 ? '−' : '+'}{naira(Math.abs(t.amount))}</b></li>)}</ul>
            <Link to="/wallet">Open wallet →</Link>
          </div>
          <Activity items={h?.activity} />
        </aside>
      </div>
    </>
  );
}

/* ---------------- Farmer ---------------- */
function FarmerDash({ user }) {
  const [h, setH] = useState(null);
  const [prof, setProf] = useState(null);
  const [items, setItems] = useState([]);
  const load = () => { api('/me/history').then(setH).catch(() => {}); api('/profile').then(setProf).catch(() => {}); api(`/listings?farmer=${user.id}`).then(setItems).catch(() => {}); };
  useEffect(() => { load(); }, []);
  const sells = (h?.orders || []).filter((o) => o.side === 'selling');
  const todo = sells.filter((o) => ['pending', 'confirmed'].includes(o.status));
  const fresh = todo.filter((o) => o.status === 'pending').length;
  const money = (list) => naira(sum(list, (o) => o.items_total ?? o.total));
  const act = (id, status) => api(`/orders/${id}/status`, { method: 'PATCH', body: { status } }).then(load).catch((e) => window.alert(e.message));
  return (
    <>
      {prof && !prof.payout && <Link className="alert" to="/profile">⚠ Add your bank account so we can pay you for prepaid orders →</Link>}
      {fresh > 0 && <Link className="alert good" to="/my-farm">🔔 {fresh} new order{fresh > 1 ? 's are' : ' is'} waiting for you. Confirm below →</Link>}
      <div className="grid stats">
        <Stat label="New orders" value={fresh} />
        <Stat label="In progress" value={todo.length - fresh} />
        <Stat label="Delivered" value={sells.filter((o) => o.status === 'completed').length} />
        <Stat label="Awaiting payout" value={money(sells.filter((o) => o.payout_status === 'pending'))} hint="prepaid orders delivered" />
        <Stat label="Paid out to you" value={money(sells.filter((o) => o.payout_status === 'paid'))} />
        <Stat label="Produce on sale" value={items.length} to="/my-farm" />
        <Stat label="Farms" value={prof?.farms.length ?? 0} to="/kyc" />
      </div>
      <div className="dash">
        <section>
          <h3>Orders to handle</h3>
          {h && !todo.length && <p className="muted">No open orders right now. Upload more produce in <Link to="/my-farm">My farm</Link> to get orders.</p>}
          <div className="stack">{todo.map((o) => (
            <OrderRow key={o.id} o={o} actions={<div className="row">
              {o.status === 'pending' && <button className="btn" onClick={() => act(o.id, 'confirmed')}>Confirm order</button>}
              {o.status === 'confirmed' && <button className="btn" onClick={() => act(o.id, 'completed')}>{o.fulfilment === 'pickup' ? 'Mark collected' : 'Mark delivered'}</button>}
              <button className="ghost danger" onClick={() => window.confirm('Cancel this order?') && act(o.id, 'cancelled')}>{o.status === 'pending' ? 'Decline' : 'Cancel'}</button>
            </div>} />
          ))}</div>
        </section>
        <aside className="stack">
          <div className="card"><h3>Assistance requests</h3>
            {!h?.assistance.length && <p className="muted">No requests yet.</p>}
            <ul className="timeline">{(h?.assistance || []).slice(0, 4).map((a) => <li key={a.id}>{a.item}: <span className={'badge ' + a.status}>{a.status}</span>{a.admin_note && <><br /><span className="muted small">{a.admin_note}</span></>}</li>)}</ul>
            <Link to="/assistance">Request assistance →</Link>
          </div>
          <Shortcuts items={[['🌾 Upload produce or photos', '/my-farm'], ['🤝 Request assistance', '/assistance'], ['🚜 Hire equipment', '/equipment']]} />
          <Activity items={h?.activity} />
        </aside>
      </div>
    </>
  );
}

/* ---------------- Admin ---------------- */
function AdminDash() {
  const [o, setO] = useState(null);
  useEffect(() => { api('/admin/overview').then(setO).catch(() => {}); }, []);
  if (!o) return <p className="muted">Loading…</p>;
  const n = (arr, k, v) => arr.find((x) => x[k] === v)?.n || 0;
  const todo = [['KYC to review', o.pending_kyc, 'KYC'], ['Assistance requests', o.pending_assistance, 'Assistance'], ['Withdrawals to pay', o.pending_withdrawals, 'Withdrawals'],
    ['Farmer payouts due', o.pending_payouts, 'Payouts'], ['Equipment bookings', o.pending_bookings, 'Bookings'], ['New orders', n(o.orders, 'status', 'pending'), 'Orders']];
  return (
    <>
      <h3>Needs your attention</h3>
      <div className="grid stats">{todo.map(([l, v, tab]) => <Stat key={l} label={l} value={v} to={`/admin?tab=${encodeURIComponent(tab)}`} />)}</div>
      <h3>The platform</h3>
      <div className="grid stats">
        <Stat label="Farmers" value={n(o.users, 'role', 'farmer')} /><Stat label="Investors" value={n(o.users, 'role', 'investor')} /><Stat label="Buyers" value={n(o.users, 'role', 'buyer')} />
        <Stat label="Produce listings" value={o.listings} /><Stat label="Equipment for hire" value={o.equipment} />
        <Stat label="Invested in plans" value={naira(o.invested)} /><Stat label="Completed trade value" value={naira(o.traded)} />
      </div>
      <Link className="btn" to="/admin">Open the admin portal</Link>
    </>
  );
}

/* ---------------- Locked until KYC ---------------- */
const UNLOCKS = {
  farmer: ['Upload produce and farm photos', 'Receive and confirm orders', 'Request assistance and funding', 'Hire equipment'],
  buyer: ['Buy produce with your wallet or on delivery', 'Your own account number', 'Track every order', 'Withdraw unspent money'],
  investor: ['Your own account number', 'Invest in 12-month to 5-year plans', 'Live countdown to maturity', 'Withdraw unspent money']
};
function Locked({ user }) {
  return (
    <div className="dash">
      <section className="card">
        <h3>Finish setting up in a few minutes</h3>
        <ol className="checklist">
          <li className="done">Create your account</li>
          <li>Upload a photo of your ID card</li>
          <li>Enter your BVN and house address</li>
          {user.role === 'farmer' && <li>Add your farms and their GPS location</li>}
        </ol>
        <Link className="btn" to="/kyc">Complete my KYC</Link>
      </section>
      <section><h3>What you unlock</h3><div className="stack">{UNLOCKS[user.role].map((l) => <span key={l} className="path off" aria-disabled="true">🔒 {l}</span>)}</div></section>
    </div>
  );
}

export default function Dashboard({ user }) {
  if (!user) return <Navigate to="/login" />;
  const unlocked = user.role === 'admin' || ['submitted', 'verified'].includes(user.kyc);
  const Body = { farmer: FarmerDash, buyer: BuyerDash, investor: InvestorDash, admin: AdminDash }[user.role];
  return (
    <>
      <div className="dash-head"><h2>Hello, {user.name.split(' ')[0]}</h2><p className="muted">{user.role === 'admin' ? 'Admin' : user.role[0].toUpperCase() + user.role.slice(1)}{user.state ? ` · ${user.state}` : ''}{!unlocked && ' · dashboard locked until your KYC is complete'}</p></div>
      {unlocked ? <Body user={user} /> : <Locked user={user} />}
    </>
  );
}
