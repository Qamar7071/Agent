// Live state of one multi-agent job, built only from the server's execution events.
// Finished runs are kept in this browser (last 10) so the Agent Control Center can show them.
import { useCallback, useRef, useState } from 'react';
import { read, write } from './store.js';

const RUNS = 'raahi:runs:v1';

// The competition demo: day 4 of this trip is the Khunjerab Pass day. It starts five days from
// today so the weather agent can fetch a real forecast for every day.
export function demoRequest(now = new Date()) {
  const d = new Date(now.getTime() + 5 * 86400000);
  const when = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  return `Plan a 5-day Hunza trip from Gilgit starting ${when} for 4 people with a Rs 1,50,000 budget, including Khunjerab Pass`;
}

export const savedRuns = () => read(RUNS, []);

export function saveRun(run, title) {
  const slim = { ...run, title, events: (run.events || []).slice(-300) };
  write(RUNS, [slim, ...savedRuns().filter((r) => r.id !== run.id)].slice(0, 10));
}

export function clearRuns() {
  write(RUNS, null);
}

export function useAgentRun() {
  const [tasks, setTasks] = useState({});
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [error, setError] = useState(null);
  const [run, setRun] = useState(null);
  const ctrl = useRef(null);

  const start = useCallback(async (call, payload, title) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setTasks({});
    setEvents([]);
    setRun(null);
    setError(null);
    setStatus('running');
    try {
      const res = await call(payload, {
        signal: c.signal,
        onEvent: (msg) => {
          if (msg.task) setTasks((t) => ({ ...t, [msg.task.id]: msg.task }));
          setEvents((e) => [...e, msg.event]);
        },
      });
      if (res.run) {
        setTasks(Object.fromEntries(res.run.tasks.map((t) => [t.id, t])));
        setEvents(res.run.events);
        setRun(res.run);
        saveRun(res.run, title);
      }
      setStatus('done');
      return res;
    } catch (e) {
      if (e.kind === 'cancelled') {
        setStatus('idle');
        return null;
      }
      setError(e);
      setStatus('error');
      return null;
    }
  }, []);

  const cancel = useCallback(() => ctrl.current?.abort(), []);
  return { tasks: Object.values(tasks), events, status, error, run, start, cancel };
}
