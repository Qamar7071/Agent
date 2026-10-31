// Group split: who paid what, who owes whom, settled with the fewest payments.
// Whole rupees only. Every expense is split so that its shares add up to exactly its amount, so
// all balances always add up to exactly zero.

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Shares of one expense: equal, in whole rupees. The leftover rupees (amount mod people) go one
 * each to people chosen by rotating from a point fixed by the expense id, so the same person
 * doesn't always pay the extra rupee, and the result is the same on every phone.
 */
export function shares(expense, memberIds) {
  const known = new Set(memberIds);
  let among = (expense.splitAmong || []).filter((id) => known.has(id));
  if (!among.length) among = [...memberIds];
  among = memberIds.filter((id) => among.includes(id));      // stable member order
  const k = among.length;
  if (!k) return {};
  const amount = Math.round(expense.amountPkr);
  const base = Math.floor(amount / k);
  let extra = amount - base * k;
  const start = hash(String(expense.id || '')) % k;
  const out = {};
  for (let i = 0; i < k; i += 1) out[among[i]] = base;
  for (let i = 0; extra > 0; i += 1, extra -= 1) out[among[(start + i) % k]] += 1;
  return out;
}

/**
 * Net balance per member: positive = others owe them, negative = they owe.
 * members: [{id, name, active}] (members who left stay here until they are settled up).
 */
export function balances(expenses, members) {
  const ids = members.map((m) => m.id);
  const out = Object.fromEntries(ids.map((id) => [id, { id, paid: 0, share: 0, net: 0 }]));
  for (const e of expenses) {
    if (e.deleted || !(e.amountPkr > 0) || !out[e.paidBy]) continue;
    out[e.paidBy].paid += Math.round(e.amountPkr);
    for (const [id, part] of Object.entries(shares(e, ids))) out[id].share += part;
  }
  for (const b of Object.values(out)) b.net = b.paid - b.share;
  return ids.map((id) => out[id]);
}

function greedy(list) {
  // list: [{id, net}] with nets summing to zero. Largest debtor pays largest creditor.
  const cred = list.filter((x) => x.net > 0).map((x) => ({ ...x })).sort((a, b) => b.net - a.net);
  const debt = list.filter((x) => x.net < 0).map((x) => ({ ...x, net: -x.net })).sort((a, b) => b.net - a.net);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const amount = Math.min(debt[i].net, cred[j].net);
    if (amount > 0) out.push({ from: debt[i].id, to: cred[j].id, amount });
    debt[i].net -= amount;
    cred[j].net -= amount;
    if (debt[i].net === 0) i += 1;
    if (cred[j].net === 0) j += 1;
  }
  return out;
}

export const EXACT_LIMIT = 12;

/**
 * The fewest payments that settle everyone. The minimum is (people with a balance) minus (the
 * largest number of groups whose balances cancel out among themselves); for up to 12 such
 * people that is found exactly, above that the greedy method (at most n − 1 payments) is used.
 */
export function settle(bals) {
  const list = bals.filter((b) => b.net !== 0).map((b) => ({ id: b.id, net: b.net }));
  const n = list.length;
  if (n === 0) return [];
  if (n > EXACT_LIMIT) return greedy(list);
  const full = (1 << n) - 1;
  const total = new Array(full + 1).fill(0);
  for (let m = 1; m <= full; m += 1) {
    const low = m & -m;
    total[m] = total[m ^ low] + list[31 - Math.clz32(low)].net;
  }
  // best[m]: most zero-sum groups the set m can be split into (adding people one at a time).
  const best = new Array(full + 1).fill(0);
  const via = new Array(full + 1).fill(-1);
  for (let m = 1; m <= full; m += 1) {
    let top = -1;
    for (let i = 0; i < n; i += 1) {
      if (!(m & (1 << i))) continue;
      const v = best[m ^ (1 << i)];
      if (v > top) { top = v; via[m] = i; }
    }
    best[m] = top + (total[m] === 0 ? 1 : 0);
  }
  // Walk back to recover the order people were added; cut a group wherever the running total is 0.
  const order = [];
  for (let m = full; m; m ^= 1 << via[m]) order.unshift({ i: via[m], mask: m });
  const groups = [];
  let current = [];
  for (const step of order) {
    current.push(list[step.i]);
    if (total[step.mask] === 0) { groups.push(current); current = []; }
  }
  return groups.flatMap(greedy);
}

/** Totals for the summary card. */
export function summary(expenses, members) {
  const bals = balances(expenses, members);
  const payments = settle(bals);
  return { balances: bals, payments, totalNet: bals.reduce((s, b) => s + b.net, 0) };
}
