// Tests paying out a matured investment. Needs no server; uses a throwaway embedded database:
//   PGLITE_DIR=/tmp/settle-test JWT_SECRET=x node test-settle.mjs
import { initDb, query, one, tx } from './src/db.js';
import { settleInvestment } from './src/investments.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
await initDb();
const u = await one("INSERT INTO users (name,email,password_hash,role) VALUES ('I','i@t.com','x','investor') RETURNING id");
await query("INSERT INTO investment_plans (duration_months,rate_percent) VALUES (12,10)");
const mk = async (days) => (await one(`INSERT INTO plan_investments (investor_id,plan_id,amount,duration_months,rate_percent,expected_return,status,start_date,maturity_date)
  VALUES ($1,1,100000,12,10,10000,'active', now() - interval '1 year', now() + ($2::int * interval '1 day')) RETURNING id`, [u.id, days])).id;
const done = await mk(-1), future = await mk(30);
const bal = async () => (await one('SELECT balance FROM wallets WHERE user_id=$1', [u.id]))?.balance ?? 0;
await tx((q) => settleInvestment(q, done, 'wallet'));
ok(await bal() === 110000, 'matured investment pays principal + return into the wallet');
ok((await one('SELECT status FROM plan_investments WHERE id=$1', [done])).status === 'paid', 'investment is marked paid');
let e; try { await tx((q) => settleInvestment(q, done, 'wallet')); } catch (x) { e = x; }
ok(e?.status === 400 && await bal() === 110000, 'cannot be paid out twice');
try { await tx((q) => settleInvestment(q, future, 'wallet')); e = null; } catch (x) { e = x; }
ok(e?.status === 400 && await bal() === 110000, 'investment that has not matured cannot be paid out');
const outside = await mk(-2);
await tx((q) => settleInvestment(q, outside, 'paid'));
ok(await bal() === 110000, '"paid outside the app" does not touch the wallet');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
