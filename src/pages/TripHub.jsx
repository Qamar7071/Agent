// Safar Saathi: the trip companion. /trip/new starts one; /trip/<id> is the hub with three tabs
// (Aaj, Kharcha, Plan), a big "+ Kharcha" button and quiet background sync.
import { useState } from 'react';
import { Cloud, CloudOff, HeartHandshake, ListChecks, MessagesSquare, Plus, RefreshCw, Settings, Sun, Wallet } from 'lucide-react';
import { Link } from '../lib/router.jsx';
import { usePageMeta } from '../lib/seo.js';
import { pkr } from '../lib/format.js';
import { useCompanion } from '../lib/companion/useCompanion.js';
import { strings } from '../lib/companion/i18n.js';
import { read } from '../lib/store.js';
import { LANG_KEY } from '../lib/companion/store.js';
import StartTrip from '../components/companion/StartTrip.jsx';
import AddExpense from '../components/companion/AddExpense.jsx';
import TodayView from '../components/companion/TodayView.jsx';
import MoneyView from '../components/companion/MoneyView.jsx';
import PlanTab from '../components/companion/PlanTab.jsx';
import TripSettings from '../components/companion/TripSettings.jsx';
import Notice from '../components/ui/Notice.jsx';
import { dismiss, toast } from '../lib/toast.js';
import ShareFamily from '../components/shared/ShareFamily.jsx';

const TABS = [['today', Sun], ['money', Wallet], ['plan', ListChecks]];

function SyncBadge({ hub }) {
  const { c, s, online, sync, pending } = hub;
  if (!c.server) return null;
  const pill = 'mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold';
  if (!online || sync.serverOff) {
    return <span className={`${pill} border-limestone-400 bg-limestone-200 text-ink-700`}><CloudOff size={13} aria-hidden="true" />{pending ? s.pending(pending) : s.offlineShort}</span>;
  }
  if (sync.state === 'syncing') return <span className={`${pill} border-lake/30 bg-lake-50 text-lake-700`}><RefreshCw size={13} className="animate-spin" aria-hidden="true" />Sync…</span>;
  if (sync.error) return <span className={`${pill} border-brick/30 bg-brick-50 text-brick`}><CloudOff size={13} aria-hidden="true" />{s.syncFailed}</span>;
  if (pending) return <span className={`${pill} border-ochre/40 bg-ochre-50 text-ochre-700`}><Cloud size={13} aria-hidden="true" />{s.pending(pending)}</span>;
  return <span className={`${pill} border-juniper/30 bg-juniper-50 text-juniper-700`}><Cloud size={13} aria-hidden="true" />{s.synced}</span>;
}

function Hub({ id }) {
  const hub = useCompanion(id);
  const { c, s, dayIndex, online, sync } = hub;
  const [tab, setTab] = useState('today');
  const [sheet, setSheet] = useState({ open: false, editing: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sharingFamily, setSharingFamily] = useState(false);
  usePageMeta({ title: c ? c.title : s.appName, path: `/trip/${id}`, noindex: true });

  if (!c) {
    const fallback = strings(read(LANG_KEY, 'en'));
    return (
      <main id="main" className="mx-auto mt-16 min-h-[70vh] max-w-xl px-4 py-12 sm:px-6">
        <h1 className="type-wide text-2xl font-extrabold">{fallback.notHere}</h1>
        <p className="mt-2 text-ink-600">{fallback.notHereHelp}</p>
        <Link to="/trips" className="btn-primary mt-6">{fallback.myTrips}</Link>
      </main>
    );
  }

  const n = c.plan.days.length;
  // Toasts sit above the "+ Kharcha" button and the tab bar.
  const notify = (t) => toast({ bottom: 150, undoLabel: s.undo, ...t }, { duration: 6000 });
  // A toast left over from the last save would cover the sheet's category buttons.
  const openSheet = (editing = null) => { dismiss(); setSheet({ open: true, editing }); };
  const name = (pid) => c.settings.members.find((m) => m.id === pid)?.name || '';
  const view = {
    ...hub, setTab,
    edit: (e) => openSheet(e),
    openSettings: () => setSettingsOpen(true),
    onChoose: (nudge, option) => {
      const action = hub.choose(nudge, option);
      if (action.type === 'edit_expense') {
        const e = c.expenses.find((x) => x.id === action.expenseId);
        if (e) openSheet(e);
      }
      if (action.type === 'apply_alt') notify({ text: s.applied(action.altId === 'stay_down' ? s.optionStay : s.optionBus) });
    },
  };
  const save = (input) => {
    if (sheet.editing) {
      hub.update(sheet.editing.id, input);
      setSheet({ open: false, editing: null });
      return;
    }
    const e = hub.add(input);
    setSheet({ open: false, editing: null });
    notify({ text: s.saved(pkr(e.amountPkr), s.cat[e.category], name(e.paidBy)), undo: () => hub.remove(e.id) });
  };
  const remove = (expenseId) => {
    hub.remove(expenseId);
    setSheet({ open: false, editing: null });
    notify({ text: s.deleted, undo: () => hub.restore(expenseId) });
  };
  const dayLabel = dayIndex === 0 ? s.dayN(0) : dayIndex > n ? s.afterTrip : s.dayOf(dayIndex, n);

  return (
    <main id="main" className="mx-auto mt-16 min-h-[80vh] w-full max-w-2xl px-4 pb-40 pt-4 sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-juniper-600">{s.appName} · {dayLabel}</p>
          <h1 className="type-semiwide line-clamp-2 break-words text-2xl font-extrabold">{c.title}</h1>
          <SyncBadge hub={hub} />
        </div>
        <button type="button" className="btn-outline shrink-0 px-3" onClick={() => setSettingsOpen(true)} aria-label={s.settings}>
          <Settings size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="mt-3 flex flex-col gap-2">
        {!online && <Notice level="info">{s.offline}</Notice>}
        {!c.server && <Notice level="info">{s.localOnly}</Notice>}
        {c.server && sync.serverOff && <Notice level="info">{s.serverOff}</Notice>}
        {c.server && sync.error && online && (
          <Notice level="warning" action={<button type="button" className="btn-outline" onClick={() => hub.syncNow({ pull: true })}>{s.retry}</button>}>
            {s.syncFailed} ({sync.error})
          </Notice>
        )}
      </div>

      <div className="mt-4">
        {TABS.map(([key]) => (
          <div key={key} role="tabpanel" id={`panel-${key}`} aria-labelledby={`tab-${key}`} hidden={tab !== key}>
            {tab === key && key === 'today' && <TodayView hub={view} />}
            {tab === key && key === 'money' && <MoneyView hub={view} />}
            {tab === key && key === 'plan' && <PlanTab hub={view} />}
          </div>
        ))}
        {c.server?.token && (
          <button type="button" onClick={() => setSharingFamily(true)}
            className="group mt-8 flex w-full items-center gap-3 rounded-md border border-limestone-300 bg-paper p-3 text-left hover:border-juniper-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-apricot-100 text-ochre-700" aria-hidden="true"><HeartHandshake size={20} /></span>
            <span className="min-w-0">
              <span className="block font-semibold group-hover:underline">{s.shareFamily}</span>
              <span className="block text-sm text-ink-600">{s.shareFamilyHint}</span>
            </span>
          </button>
        )}
        {sharingFamily && (
          <ShareFamily open={sharingFamily} onClose={() => setSharingFamily(false)}
            trip={{ id: c.server.id, token: c.server.token, title: c.title }} />
        )}
        <Link to={`/decided?trip=${c.id}`}
          className="group mt-3 flex items-center gap-3 rounded-md border border-limestone-300 bg-paper p-3 hover:border-juniper-500">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-juniper-100 text-juniper-700" aria-hidden="true"><MessagesSquare size={20} /></span>
          <span className="min-w-0">
            <span className="block font-semibold group-hover:underline">{s.seeAgents}</span>
            <span className="block text-sm text-ink-600">{s.seeAgentsHint}</span>
          </span>
        </Link>
      </div>

      {tab !== 'plan' && (
        <button type="button" onClick={() => openSheet()} aria-label={s.addExpense}
          className="fixed bottom-[84px] right-4 z-30 inline-flex min-h-[56px] items-center gap-2 rounded-full bg-juniper px-5 text-base font-bold text-on-juniper shadow-lg hover:bg-juniper-700 sm:right-[max(1rem,calc(50%-20rem))]">
          <Plus size={22} aria-hidden="true" /> {s.addShort}
        </button>
      )}

      <nav aria-label={s.appName} className="fixed inset-x-0 bottom-0 z-30 border-t border-limestone-300 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div role="tablist" aria-label={s.appName} className="mx-auto grid max-w-2xl grid-cols-3">
          {TABS.map(([key, Icon]) => {
            const label = { today: s.tabToday, money: s.tabMoney, plan: s.tabPlan }[key];
            return (
              <button key={key} id={`tab-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`}
                onClick={() => setTab(key)}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 text-xs font-semibold ${tab === key ? 'text-juniper-700' : 'text-ink-600'}`}>
                <Icon size={22} aria-hidden="true" strokeWidth={tab === key ? 2.5 : 2} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <AddExpense open={sheet.open} editing={sheet.editing} c={c} s={s} dayIndex={dayIndex}
        onClose={() => setSheet({ open: false, editing: null })} onSave={save} onDelete={remove} />
      <TripSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} hub={hub} />
    </main>
  );
}

export default function TripHub({ id }) {
  if (id === 'new') return <StartTrip />;
  return <Hub id={id} />;
}
