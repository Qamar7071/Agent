// The Group Room: who's in, what the group needs (anonymous), the agents' options with a Group
// match and what each gives up, votes, and the organizer's final choice.
import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Crown, Lock, MessagesSquare, RefreshCw, Share2, Sparkles, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { Link, useRouter } from '../../lib/router.jsx';
import { metres, pkr } from '../../lib/format.js';
import { forgetGroup, groupLink, myNeeds, prettyCode, saveMyNeeds } from '../../lib/group/store.js';
import ProfileForm from './ProfileForm.jsx';
import Notice from '../ui/Notice.jsx';
import Avatar from '../ui/Avatar.jsx';

export function ShareCard({ s, code, title }) {
  const [copied, setCopied] = useState(false);
  const link = groupLink(code);
  const text = s.shareText(title, link, prettyCode(code));
  return (
    <section className="panel p-4" aria-labelledby="share-h">
      <h2 id="share-h" className="flex items-center gap-2 font-bold"><Share2 size={18} aria-hidden="true" /> {s.shareTitle}</h2>
      <p className="mt-1 text-sm text-ink-600">{s.shareHow}</p>
      <p className="mt-3 text-sm text-ink-600">{s.code}</p>
      <p className="num text-3xl font-extrabold tracking-widest">{prettyCode(code)}</p>
      <p className="mt-1 break-all text-sm text-juniper-700">{link}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {typeof navigator !== 'undefined' && navigator.share && (
          <button type="button" className="btn-primary" onClick={() => navigator.share({ title, text, url: link }).catch(() => {})}>
            <Share2 size={16} aria-hidden="true" /> {s.share}
          </button>
        )}
        <button type="button" className="btn-outline" onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
        }}>
          {copied ? <Check size={16} aria-hidden="true" /> : null} {copied ? s.copied : s.copy}
        </button>
      </div>
    </section>
  );
}

function OptionCard({ o, s, view, me, onVote, onConfirm, busy, recommended }) {
  const [open, setOpen] = useState(false);
  const votes = view.votes?.[o.id];
  const mine = me.vote === o.id;
  const chosen = view.chosen === o.id;
  return (
    <article aria-labelledby={`opt-${o.id}`}
      className={`panel relative p-4 sm:p-5 ${chosen ? 'border-juniper-600 ring-2 ring-juniper-200' : recommended ? 'border-juniper-500' : ''}`}>
      {recommended && (
        <p className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-juniper px-2.5 py-0.5 text-xs font-semibold text-on-juniper">
          <Sparkles size={12} aria-hidden="true" /> {s.recommended}
        </p>
      )}
      <div className="flex items-start gap-3">
        <span className={`type-wide flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-xl font-extrabold ${recommended || chosen ? 'bg-juniper text-on-juniper' : 'bg-limestone-300 text-ink'}`}
          aria-hidden="true">{o.id}</span>
        <div className="min-w-0 flex-1">
          <h3 id={`opt-${o.id}`} className="type-semiwide text-lg font-bold leading-tight">
            <span className="sr-only">Option {o.id}{recommended ? `, ${s.recommended}` : ''}: </span>{o.label}
          </h3>
          <p className="text-sm text-ink-600">{o.title}, {s.days(o.days.length)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-2xl font-extrabold leading-none text-juniper-700">{o.match}<span className="text-sm font-semibold text-ink-500">/100</span></p>
          <p className="mt-1 text-xs text-ink-600">{s.match}</p>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-limestone-300" role="img" aria-label={`${s.match} ${o.match}/100`}>
        <div className="h-full rounded-full bg-juniper-600" style={{ width: `${o.match}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-600">{s.fits(o.fits)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div><dt className="text-ink-500">{s.perPerson}</dt><dd className="num font-semibold">{pkr(o.per_person)}</dd></div>
        <div><dt className="text-ink-500">{s.highest}</dt><dd className="num font-semibold">{o.max_alt ? metres(o.max_alt) : '—'}</dd></div>
        <div><dt className="text-ink-500">{s.longest}</dt><dd className="num font-semibold">{o.longest_drive_h ? `${o.longest_drive_h} h` : '—'}</dd></div>
        <div><dt className="text-ink-500">{s.risk}</dt><dd className="font-semibold">{o.risk?.category}</dd></div>
      </dl>
      {o.why?.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold">{s.why}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-700">{o.why.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      <div className="mt-3">
        <p className="text-sm font-semibold">{s.gives}</p>
        {o.sacrifices?.length ? (
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-700">{o.sacrifices.map((w) => <li key={w}>{w}</li>)}</ul>
        ) : <p className="text-sm text-ink-600">{s.givesNothing}</p>}
      </div>
      <button type="button" className="btn-quiet mt-2 -ml-2.5 min-h-[44px]" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown size={16} aria-hidden="true" className={open ? 'rotate-180' : ''} /> {open ? s.hideDays : s.showDays}
      </button>
      {open && <ol className="mt-1 list-decimal pl-6 text-sm text-ink-700">{o.days.map((d) => <li key={d.day}>{d.title}</li>)}</ol>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {view.status !== 'confirmed' && (
          <button type="button" disabled={busy} onClick={() => onVote(mine ? null : o.id)} aria-pressed={mine}
            className={mine ? 'btn-primary' : 'btn-outline'}>
            {mine ? <><Check size={16} aria-hidden="true" /> {s.yourVote}</> : s.vote}
          </button>
        )}
        {votes && (
          <span className="inline-flex items-center gap-2 text-sm text-ink-600">
            <span className="flex -space-x-1.5">{votes.names.slice(0, 5).map((n) => <Avatar key={n} name={n} size={26} ring />)}</span>
            {s.votes(votes.count)}: {votes.names.join(', ')}
          </span>
        )}
        {me.organizer && view.status !== 'confirmed' && (
          <button type="button" disabled={busy} className="btn-quiet ml-auto" onClick={() => onConfirm(o.id)}>
            <Crown size={16} aria-hidden="true" /> {s.confirm}
          </button>
        )}
      </div>
    </article>
  );
}

export default function Room({ code, entry, s, onLeft }) {
  const { navigate } = useRouter();
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  const load = useCallback(async () => {
    try {
      const v = await api.group(code, entry.token);
      setView(v);
      setError(null);
      if (!v.you.profile && !v.you.organizer) setEditing((e) => e || 'first');
    } catch (e) {
      setError(e);
    }
  }, [code, entry.token]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (error && !view) {
    return (
      <Notice level={error.status === 403 ? 'warning' : 'danger'} className="mt-6"
        action={<button type="button" className="btn-outline" onClick={load}>{s.refresh}</button>}>
        {error.status === 403 ? s.notFound : error.message}
      </Notice>
    );
  }
  if (!view) return <p className="mt-8 text-ink-600" role="status">…</p>;

  const me = view.you;
  const active = view.members.filter((m) => m.active);
  const answered = active.filter((m) => m.profile_done).length;
  const saveProfile = async (profile, needs) => {
    await api.groupProfile(code, entry.token, profile);
    await api.groupNeeds(code, entry.token, needs.codes, needs.showName);
    saveMyNeeds(code, needs);
    setEditing(false);
    await load();
  };
  const ask = async () => {
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    try {
      await api.groupOptions(code, entry.token, {
        onEvent: (e) => {
          const tasks = e.task ? e.task : null;
          if (tasks) setProgress((p) => ({ done: p.done + (['completed', 'waiting_for_approval'].includes(e.event?.type) ? 1 : 0), total: Math.max(p.total, 6) }));
        },
      });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const vote = async (option) => {
    setBusy(true);
    try { await api.groupVote(code, entry.token, option); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const confirmPlan = async (option) => {
    if (!window.confirm(s.confirmQ(option))) return;
    setBusy(true);
    try { await api.groupConfirm(code, entry.token, option); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const leave = async () => {
    if (!window.confirm(s.leaveQ)) return;
    try { await api.groupLeave(code, entry.token); } catch { /* already gone */ }
    forgetGroup(code);
    onLeft();
  };
  const remove = async (m) => {
    if (!window.confirm(s.removeQ(m.name))) return;
    try { await api.groupRemove(code, entry.token, m.id); await load(); } catch (e) { setError(e); }
  };

  if (editing) {
    return (
      <div className="mt-6">
        <ProfileForm s={s} initial={me.profile} initialNeeds={myNeeds(code)} onSave={saveProfile}
          onCancel={editing === 'first' ? null : () => setEditing(false)} />
      </div>
    );
  }

  const chosen = view.options?.options?.find((o) => o.id === view.chosen);
  return (
    <div className="mt-6 flex flex-col gap-5">
      {error && <Notice level="danger">{error.message}</Notice>}
      {chosen && (
        <section className="rounded-md border border-juniper-600 bg-juniper-50 p-4" aria-labelledby="final-h">
          <h2 id="final-h" className="font-bold text-juniper-700">{s.final(chosen.id, chosen.title)}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => navigate(`/trip/new?group=${code}`)}>{s.startTogether}</button>
            {entry.tripToken && <Link to={`/plan?trip=${view.trip_id}`} className="btn-outline">{s.openPlan}</Link>}
          </div>
        </section>
      )}

      {me.organizer && <ShareCard s={s} code={code} title={view.title} />}

      <section className="panel p-4" aria-labelledby="members-h">
        <h2 id="members-h" className="flex items-center gap-2 font-bold"><Users size={18} aria-hidden="true" /> {s.members} ({active.length})</h2>
        <ul className="mt-2 divide-y divide-limestone-300">
          {active.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <Avatar name={m.name} size={34} />
              <span className="min-w-0 flex-1 truncate font-medium">{m.name}{m.id === me.id ? ' (you)' : ''}</span>
              {m.organizer && <span className="text-xs font-semibold text-juniper-700">{s.organizer}</span>}
              <span className={`text-xs ${m.profile_done ? 'text-juniper-700' : 'text-ink-500'}`}>{m.profile_done ? `✓ ${s.ready}` : s.waiting}</span>
              {m.voted && <span className="text-xs text-juniper-700">✓ {s.voted}</span>}
              {me.organizer && !m.organizer && <button type="button" className="btn-quiet min-h-[36px] text-brick" onClick={() => remove(m)}>{s.remove}</button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-4" aria-labelledby="needs-h">
        <h2 id="needs-h" className="flex items-center gap-2 font-bold"><Lock size={18} aria-hidden="true" /> {s.groupNeeds}</h2>
        {view.needs.length ? (
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-700">
            {view.needs.map((n) => <li key={n.code}>{s.needLine(n.count, s.needText[n.code], n.names)}</li>)}
          </ul>
        ) : <p className="mt-2 text-sm text-ink-600">{s.noNeeds}</p>}
        <p className="mt-2 text-xs text-ink-500">{s.notMedical}</p>
        <button type="button" className="btn-outline mt-3" onClick={() => setEditing(true)}>{me.profile ? s.editAnswers : s.addAnswers}</button>
      </section>

      <section aria-labelledby="options-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="options-h" className="type-semiwide text-xl font-bold">{s.options}</h2>
          <button type="button" className="btn-quiet" onClick={load} aria-label={s.refresh}><RefreshCw size={16} aria-hidden="true" /></button>
        </div>
        {me.organizer && view.status !== 'confirmed' && (
          <div className="flex flex-col items-start gap-2">
            <button type="button" className={`${view.options ? 'btn-outline' : 'btn-primary'} min-h-[48px]`} disabled={busy || answered === 0} onClick={ask}>
              <Sparkles size={18} aria-hidden="true" /> {busy && progress ? s.asking : view.options ? s.askAgain : s.ask}
            </button>
            <p className="text-sm text-ink-600">{s.askHint(answered)}</p>
          </div>
        )}
        {!view.options && !me.organizer && <p className="text-sm text-ink-600">{s.waitOrganizer}</p>}
        {view.options?.options?.map((o) => (
          <OptionCard key={o.id} o={o} s={s} view={view} me={me} busy={busy} onVote={vote} onConfirm={confirmPlan}
            recommended={view.options.recommended === o.id} />
        ))}
        {view.options && (
          <>
            {view.options.reasons?.length > 0 && <ul className="list-disc pl-5 text-sm text-ink-700">{view.options.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            <p className="text-xs text-ink-500">{s.noteMatch}</p>
            <Link to={`/decided?group=${code}`}
              className="group flex items-center gap-3 rounded-md border border-limestone-300 bg-paper p-3 hover:border-juniper-500">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-juniper-100 text-juniper-700" aria-hidden="true"><MessagesSquare size={20} /></span>
              <span className="min-w-0">
                <span className="block font-semibold group-hover:underline">{s.howDecided}</span>
                <span className="block text-sm text-ink-600">{s.howDecidedHint}</span>
              </span>
            </Link>
          </>
        )}
      </section>

      {!me.organizer && <button type="button" className="btn-quiet self-start text-brick" onClick={leave}>{s.leave}</button>}
    </div>
  );
}
