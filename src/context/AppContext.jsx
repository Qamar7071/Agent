import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { sendChat, ApiError } from '../lib/api.js';
import { offlineReply } from '../lib/offlineGuide.js';
import { flowStep, isPlanIntent } from '../lib/planFlow.js';
import { scrollToId } from '../lib/format.js';

const AppCtx = createContext(null);
let uid = 0;
const nextId = () => `m${++uid}`;

const welcome = {
  id: 'welcome',
  role: 'assistant',
  text: 'Assalam-o-Alaikum! I’m **Raahi**, your travel concierge for Gilgit-Baltistan. Tell me where you dream of going — or pick a starting point below.',
  welcome: true,
};

export function AppProvider({ children }) {
  // ── Assistant ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([welcome]);
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState('unknown'); // 'unknown' | 'ai' | 'offline'
  const [assistantOpen, setAssistantOpen] = useState(false);
  const modeRef = useRef('unknown');
  const abortRef = useRef(null);
  const flowRef = useRef(null); // offline flipped-interaction state
  const openPlannerRef = useRef(null); // set after openPlanner is defined

  const history = useCallback(
    (list) =>
      list
        .filter((m) => !m.welcome && !m.error && m.text)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.text })),
    [],
  );

  const answer = useCallback(
    async (text, intent, baseList) => {
      setThinking(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        let reply;
        let switched = false;
        const runOffline = (txt, intnt) => {
          const flowActive = flowRef.current?.active;
          if (flowActive || intnt === 'itinerary' || isPlanIntent(txt)) {
            const { state, reply: fr } = flowStep(flowActive ? flowRef.current : null, txt);
            flowRef.current = state;
            return {
              text: fr.text,
              actions: (fr.chips || []).map((c) => ({ label: c.label, type: 'ask', value: c.value })),
              offline: true,
              finalize: fr.finalize || null,
            };
          }
          return { ...offlineReply(txt, intnt), offline: true };
        };

        if (modeRef.current === 'offline') {
          await new Promise((r) => setTimeout(r, 450));
          reply = runOffline(text, intent);
        } else {
          try {
            reply = await sendChat(text, history(baseList), { signal: ctrl.signal });
            const nextMode = reply.aiAvailable ? 'ai' : 'degraded';
            modeRef.current = nextMode;
            setMode(nextMode);
            if (!reply.text && !reply.destinations.length && !reply.itinerary) {
              reply.text = 'I received an empty answer from the planner. Could you rephrase that?';
            }
          } catch (e) {
            if (e instanceof ApiError && e.kind === 'unreachable') {
              modeRef.current = 'offline';
              setMode('offline');
              reply = runOffline(text, intent);
              switched = true;
            } else {
              throw e;
            }
          }
        }
        const finalize = reply.finalize;
        delete reply.finalize;
        setMessages((list) => [...list, { id: nextId(), role: 'assistant', ...reply, switchedOffline: switched }]);
        if (finalize) setTimeout(() => openPlannerRef.current?.(finalize.values, { autoSubmit: true }), 500);
      } catch (e) {
        setMessages((list) => [
          ...list,
          { id: nextId(), role: 'assistant', error: true, text: e?.message || 'Something went wrong.', retry: { text, intent } },
        ]);
      } finally {
        setThinking(false);
        abortRef.current = null;
      }
    },
    [history],
  );

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const thinkingRef = useRef(false);
  thinkingRef.current = thinking;

  const send = useCallback(
    (text, { intent } = {}) => {
      const clean = (text || '').trim();
      if (!clean || thinkingRef.current) return;
      const next = [...messagesRef.current, { id: nextId(), role: 'user', text: clean }];
      messagesRef.current = next;
      thinkingRef.current = true;
      setMessages(next);
      answer(clean, intent, next);
    },
    [answer],
  );

  const retry = useCallback(
    (msgId) => {
      const msg = messagesRef.current.find((m) => m.id === msgId);
      if (!msg?.retry || thinkingRef.current) return;
      const next = messagesRef.current.filter((m) => m.id !== msgId);
      messagesRef.current = next;
      thinkingRef.current = true;
      setMessages(next);
      answer(msg.retry.text, msg.retry.intent, next);
    },
    [answer],
  );

  const reconnect = useCallback(() => {
    modeRef.current = 'unknown';
    setMode('unknown');
  }, []);

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    flowRef.current = null;
    setMessages([welcome]);
    setThinking(false);
  }, []);

  // ── Planner ───────────────────────────────────────────────────────────────
  const [plannerRequest, setPlannerRequest] = useState(null); // { values, autoSubmit, nonce }
  const openPlanner = useCallback((values = {}, { autoSubmit = false } = {}) => {
    setPlannerRequest({ values, autoSubmit, nonce: Date.now() });
    setAssistantOpen(false);
    requestAnimationFrame(() => scrollToId('plan'));
  }, []);
  openPlannerRef.current = openPlanner;

  // ── Destination detail, saved list, filter ────────────────────────────────
  const [activeDestination, setActiveDestination] = useState(null);
  const [destFilter, setDestFilter] = useState('all');
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('raahi-saved') || '[]');
    } catch {
      return [];
    }
  });
  const toggleSaved = useCallback((id) => {
    setSaved((list) => {
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      try {
        localStorage.setItem('raahi-saved', JSON.stringify(next));
      } catch {
        /* storage unavailable — keep in memory */
      }
      return next;
    });
  }, []);
  const showSaved = useCallback(() => {
    setDestFilter('saved');
    requestAnimationFrame(() => scrollToId('destinations'));
  }, []);

  const runAction = useCallback(
    (action) => {
      if (!action) return;
      if (action.type === 'planner') openPlanner(action.value || {});
      else if (action.type === 'ask') send(action.value || action.label);
      else if (action.type === 'destination') setActiveDestination(action.value);
      else if (action.type === 'scroll') scrollToId(action.value);
    },
    [openPlanner, send],
  );

  const askAbout = useCallback(
    (text) => {
      setActiveDestination(null);
      setAssistantOpen(true);
      send(text);
    },
    [send],
  );

  const value = useMemo(
    () => ({
      messages, thinking, mode, send, retry, reconnect, resetChat, runAction, askAbout,
      assistantOpen, openAssistant: () => setAssistantOpen(true), closeAssistant: () => setAssistantOpen(false),
      plannerRequest, openPlanner,
      activeDestination, openDestination: setActiveDestination, closeDestination: () => setActiveDestination(null),
      saved, toggleSaved, showSaved, destFilter, setDestFilter,
    }),
    [messages, thinking, mode, send, retry, reconnect, resetChat, runAction, askAbout, assistantOpen, plannerRequest, openPlanner, activeDestination, saved, toggleSaved, showSaved, destFilter],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);
