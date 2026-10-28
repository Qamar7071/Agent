// One place for the trip being planned: the conversation, the structured trip state the
// agent keeps, the itinerary, live conditions for it, and the saved-trip key.
// It survives page changes and reloads (localStorage), so nothing is lost mid-plan.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { read, rememberTrip, write } from '../lib/store.js';

const Ctx = createContext(null);
const KEY = 'raahi:workspace:v2';
let counter = 0;
const uid = () => `m${Date.now().toString(36)}${(counter += 1)}`;

export const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  welcome: true,
  text:
    'Assalam-o-Alaikum! Tell me where you’d like to go, for how many days, who’s coming and roughly what you want to spend. ' +
    'English or Roman Urdu is fine. I’ll work out the drive days, check the season and the forecast, and estimate the cost.',
};

export function stateFromRequest(request, prev) {
  return {
    ...(prev || {}),
    origin: request.origin,
    destinations: request.destinations,
    start_date: request.start_date,
    month: request.start_date ? Number(request.start_date.slice(5, 7)) : request.travel_month,
    days: request.days,
    adults: request.adults,
    children: request.children,
    budget_pkr: request.budget_pkr,
    budget_basis: request.budget_basis,
    transport: request.transport,
    accommodation: request.accommodation,
    pace: request.pace,
    interests: request.interests,
    accessibility: request.accessibility,
    food: request.food,
    guide: request.guide,
    day_edits: request.day_edits,
    has_itinerary: true,
    plan_request: request,
    assumed: [],
  };
}

const lean = (m) => ({ id: m.id, role: m.role, text: m.text, welcome: m.welcome, error: m.error, retryText: m.retryText,
  trace: m.trace, mode: m.mode, notice: m.notice, system: m.system });

export function PlannerProvider({ children }) {
  const saved = useMemo(() => read(KEY, null), []);
  const [messages, setMessages] = useState(saved?.messages?.length ? saved.messages : [WELCOME]);
  const [agentState, setAgentState] = useState(saved?.agentState || null);
  const [itinerary, setItinerary] = useState(saved?.itinerary || null);
  const [savedTrip, setSavedTrip] = useState(saved?.savedTrip || null);
  const [suggestions, setSuggestions] = useState(saved?.suggestions || []);
  const [unsaved, setUnsaved] = useState(Boolean(saved?.unsaved));
  const [chatBusy, setChatBusy] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState(null);
  const [conditions, setConditions] = useState({ status: 'idle' });
  const [enquiryDraft, setEnquiryDraft] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);

  const ref = useRef({});
  ref.current = { messages, agentState, itinerary, savedTrip, chatBusy };

  useEffect(() => {
    write(KEY, { messages: messages.slice(-40).map(lean), agentState, itinerary, savedTrip, suggestions, unsaved });
  }, [messages, agentState, itinerary, savedTrip, suggestions, unsaved]);

  const checkHealth = useCallback(async () => {
    setHealthError(null);
    try {
      setHealth(await api.health());
    } catch (e) {
      setHealthError(e.message);
    }
  }, []);
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const handleActions = useCallback((actions = []) => {
    for (const a of actions) {
      if (a.type === 'trip_saved') {
        const token = a.token || ref.current.savedTrip?.token;
        if (token) {
          const trip = { id: a.trip_id, token, title: a.title };
          rememberTrip(trip);
          setSavedTrip(trip);
          setUnsaved(false);
        }
      } else if (a.type === 'open_enquiry_form') {
        setEnquiryDraft(a.draft || {});
      }
    }
  }, []);

  const send = useCallback(async (text) => {
    const clean = (text || '').trim();
    if (!clean || ref.current.chatBusy) return;
    ref.current.chatBusy = true;
    const history = ref.current.messages
      .filter((m) => !m.welcome && !m.error && !m.system && m.text)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }));
    setMessages((list) => [...list, { id: uid(), role: 'user', text: clean }]);
    setChatBusy(true);
    try {
      const { savedTrip: st, agentState: state } = ref.current;
      const res = await api.chat({ message: clean, history, state, ...(st?.token ? { trip: { id: st.id, token: st.token } } : {}) });
      setAgentState(res.state);
      if (res.itinerary) {
        setItinerary(res.itinerary);
        setUnsaved(true);
      }
      handleActions(res.client_actions);
      setSuggestions(res.suggestions || []);
      setMessages((list) => [...list, {
        id: uid(), role: 'assistant', text: res.reply, trace: res.trace, mode: res.mode, notice: res.notice,
        weather: res.weather, roads: res.roads, route: res.route, budget: res.budget, planned: Boolean(res.itinerary),
      }]);
    } catch (e) {
      setMessages((list) => [...list, { id: uid(), role: 'assistant', error: true, text: e.message, retryText: clean }]);
    } finally {
      ref.current.chatBusy = false;
      setChatBusy(false);
    }
  }, [handleActions]);

  const retry = useCallback((id) => {
    const list = ref.current.messages;
    const i = list.findIndex((m) => m.id === id);
    if (i < 0 || !list[i].retryText) return;
    const text = list[i].retryText;
    const trimmed = list.slice(0, i).filter((m, j) => !(j === i - 1 && m.role === 'user'));
    ref.current.messages = trimmed;
    setMessages(trimmed);
    send(text);
  }, [send]);

  const note = (text) => setMessages((list) => [...list, { id: uid(), role: 'assistant', system: true, text }]);

  const adoptPlan = useCallback((plan, message) => {
    setItinerary(plan);
    setAgentState((prev) => stateFromRequest(plan.request, prev));
    setUnsaved(true);
    if (message) note(message);
  }, []);

  const buildPlan = useCallback(async (tripRequest) => {
    setPlanBusy(true);
    setPlanError(null);
    try {
      const res = await api.plan(tripRequest);
      adoptPlan(res.itinerary, `Built a ${res.itinerary.days.length}-day plan from the trip details form: ${res.itinerary.title}.`);
      return res.itinerary;
    } catch (e) {
      setPlanError(e);
      return null;
    } finally {
      setPlanBusy(false);
    }
  }, [adoptPlan]);

  const applyChanges = useCallback(async (changes, message) => {
    const plan = ref.current.itinerary;
    if (!plan) return null;
    setPlanBusy(true);
    setPlanError(null);
    try {
      const res = await api.updatePlan(plan.request, changes);
      adoptPlan(res.itinerary, message);
      return res.itinerary;
    } catch (e) {
      setPlanError(e);
      return null;
    } finally {
      setPlanBusy(false);
    }
  }, [adoptPlan]);

  const conditionsKey = itinerary
    ? JSON.stringify([itinerary.request.destinations, itinerary.request.start_date, itinerary.days.length])
    : null;

  const refreshConditions = useCallback(async () => {
    const plan = ref.current.itinerary;
    if (!plan) return;
    setConditions((c) => ({ ...c, status: 'loading', error: null }));
    try {
      const data = await api.conditions({
        destinations: plan.request.destinations,
        start_date: plan.request.start_date,
        days: plan.days.length,
        plan_days: plan.days.map((d) => ({ day: d.day, date: d.date, destination_id: d.destination_id })),
      });
      setConditions({ status: 'ready', data, key: JSON.stringify([plan.request.destinations, plan.request.start_date, plan.days.length]) });
    } catch (e) {
      setConditions({ status: 'error', error: e.message });
    }
  }, []);

  useEffect(() => {
    if (!conditionsKey) return undefined;
    const t = setTimeout(refreshConditions, 500);
    return () => clearTimeout(t);
  }, [conditionsKey, refreshConditions]);

  const saveTrip = useCallback(async (title) => {
    const plan = ref.current.itinerary;
    const st = ref.current.savedTrip;
    if (!plan) return null;
    const name = (title || plan.title).slice(0, 120);
    if (st?.token) {
      const res = await api.updateTrip(st.id, st.token, name, plan.request);
      const trip = { id: st.id, token: st.token, title: res.trip.title };
      rememberTrip(trip);
      setSavedTrip(trip);
      setUnsaved(false);
      return trip;
    }
    const res = await api.saveTrip(name, plan.request);
    const trip = { id: res.trip.id, token: res.token, title: res.trip.title };
    rememberTrip(trip);
    setSavedTrip(trip);
    setUnsaved(false);
    return trip;
  }, []);

  const loadTrip = useCallback(async (id, token) => {
    const res = await api.getTrip(id, token);
    let plan = res.trip.itinerary;
    try {
      plan = (await api.plan(res.trip.request)).itinerary;          // refresh with today's data
    } catch {
      /* keep the saved copy */
    }
    setItinerary(plan);
    setAgentState(stateFromRequest(plan.request, null));
    setSavedTrip({ id, token, title: res.trip.title });
    setUnsaved(false);
    setMessages([WELCOME, { id: uid(), role: 'assistant', system: true, text: `Opened your saved trip “${res.trip.title}”. Ask me to change anything.` }]);
    setSuggestions([]);
    return res.trip;
  }, []);

  const newTrip = useCallback(() => {
    setMessages([WELCOME]);
    setAgentState(null);
    setItinerary(null);
    setSavedTrip(null);
    setSuggestions([]);
    setUnsaved(false);
    setConditions({ status: 'idle' });
    setPlanError(null);
  }, []);

  const prefillDestination = useCallback((id) => {
    if (ref.current.itinerary) return;
    setAgentState((prev) => ({ ...(prev || {}), destinations: [...new Set([...(prev?.destinations || []), id])] }));
  }, []);

  const value = useMemo(() => ({
    messages, agentState, itinerary, savedTrip, suggestions, unsaved, chatBusy, planBusy, planError, conditions,
    enquiryDraft, health, healthError,
    send, retry, buildPlan, applyChanges, refreshConditions, saveTrip, loadTrip, newTrip, prefillDestination,
    checkHealth, setPlanError, openEnquiry: (draft) => setEnquiryDraft(draft || {}), closeEnquiry: () => setEnquiryDraft(null),
  }), [messages, agentState, itinerary, savedTrip, suggestions, unsaved, chatBusy, planBusy, planError, conditions,
    enquiryDraft, health, healthError, send, retry, buildPlan, applyChanges, refreshConditions, saveTrip, loadTrip, newTrip,
    prefillDestination, checkHealth]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePlanner = () => useContext(Ctx);
