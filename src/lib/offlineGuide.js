// Answers from the curated destination guide when the AI backend is unreachable.
// It never states live road, weather, price or availability information —
// for those it points to official sources.
import { destinations, destinationById, matchDestinations, months, seasonNotes, seasonOf } from '../data/destinations.js';
import { officialSources } from '../data/content.js';
import { monthRange, metres } from './format.js';

const sourcesLinks = officialSources.slice(0, 3).map((s) => ({ label: s.label, href: s.href }));

export function offlineReply(text, intent) {
  const t = (text || '').toLowerCase();
  const found = matchDestinations(t);
  const month = months.findIndex((m) => t.includes(m.toLowerCase()) || t.includes(m.slice(0, 3).toLowerCase() + ' '));

  if (intent === 'conditions' || /weather|road|open|closed|landslide|snow|temperature|kkh status|forecast/.test(t)) {
    const d = found[0] && destinationById[found[0]];
    if (d) {
      return {
        text: `Here’s the **live weather** for **${d.name}** (from Open-Meteo). Road status isn’t a live feed I can read, so confirm the KKH with the official sources below before you travel.`,
        weatherId: d.id,
        links: sourcesLinks,
      };
    }
    return {
      text: 'I can show **live weather** for any destination — pick one. For live road/KKH status, always check the official sources before travelling.',
      links: sourcesLinks,
      actions: ['skardu', 'hunza', 'deosai', 'passu'].map((id) => ({ label: destinationById[id].name, type: 'ask', value: `Weather in ${destinationById[id].name}` })),
    };
  }

  if (intent === 'budget' || /budget|cheap|afford|price|cost|pkr|rupee/.test(t)) {
    return {
      text: 'Budget matching uses live prices from the AI planner, which isn’t connected right now — so I won’t quote rupee figures. In the trip planner you can set your budget in PKR, and here are shorter trips that are usually easier on a budget:',
      destinations: ['hunza', 'attabad', 'skardu'],
      actions: [{ label: 'Open trip planner', type: 'planner', value: { destinations: ['hunza', 'attabad'] } }],
    };
  }

  if (intent === 'itinerary' || /itinerar|plan|schedule|days? trip|\d+\s*days?/.test(t)) {
    const ids = found.length ? found : ['hunza', 'attabad', 'passu'];
    const daysMatch = t.match(/(\d+)\s*days?/);
    return {
      text: `Let’s build it in the trip planner — I’ve pre-filled ${ids.map((id) => `**${destinationById[id].name}**`).join(', ')}${daysMatch ? ` for **${daysMatch[1]} days**` : ''}. Add your dates, budget and transport, and you’ll get a day-by-day route.`,
      destinations: ids,
      actions: [{ label: 'Open trip planner', type: 'planner', value: { destinations: ids, days: daysMatch ? Number(daysMatch[1]) : undefined } }],
    };
  }

  if (intent === 'nearby' || /near|around|close to|nearby/.test(t)) {
    if (!found.length) {
      return {
        text: 'Which base are you staying in? Pick one and I’ll show what’s around it.',
        actions: ['hunza', 'skardu', 'passu', 'fairy-meadows'].map((id) => ({ label: destinationById[id].name, type: 'ask', value: `What is near ${destinationById[id].name}?` })),
      };
    }
    const d = destinationById[found[0]];
    return {
      text: `Around **${d.name}**:\n${d.highlights.map((h) => `- ${h}`).join('\n')}\n\nEasy add-ons from here:`,
      destinations: d.nearby,
    };
  }

  if (month >= 0 || /season|best time|when to go|winter|summer|spring|autumn|fall/.test(t)) {
    const m = month >= 0 ? month + 1 : /winter/.test(t) ? 1 : /spring/.test(t) ? 4 : /summer/.test(t) ? 7 : /autumn|fall/.test(t) ? 10 : new Date().getMonth() + 1;
    const picks = destinations.filter((d) => d.bestMonths.includes(m)).map((d) => d.id);
    return {
      text: `**${months[m - 1]}** — ${seasonNotes[seasonOf(m)]}${picks.length ? '\n\nGood choices that month:' : ''}`,
      destinations: picks.slice(0, 6),
    };
  }

  if (found.length) {
    const d = destinationById[found[0]];
    return {
      text: `**${d.name}** · ${d.region} · ${metres(d.altitude)}\n\n${d.description}\n\n**Best months:** ${monthRange(d.bestMonths)}\n**Getting there:** ${d.access}\n**Suggested stay:** ${d.duration.min === d.duration.max ? d.duration.min : `${d.duration.min}–${d.duration.max}`} days`,
      destinations: found.slice(0, 3),
      actions: [{ label: `Plan a trip to ${d.name}`, type: 'planner', value: { destinations: found } }],
    };
  }

  if (intent === 'discover' || /best|places|where|visit|destination|recommend|show/.test(t)) {
    return {
      text: 'Here are the places that define Northern Pakistan — tap one to explore it, or ask me about any of them.',
      destinations: ['hunza', 'skardu', 'attabad', 'fairy-meadows', 'deosai', 'passu'],
    };
  }

  return {
    text: 'I can help with destinations, seasons, getting there, nearby attractions and day-by-day routes across Gilgit-Baltistan. Try asking “Best time for Deosai?” or “Plan 7 days in Hunza”.',
    actions: [
      { label: 'Best places', type: 'ask', value: 'Show me the best places to visit in Northern Pakistan.' },
      { label: 'Plan 7 days in Hunza', type: 'ask', value: 'Plan 7 days in Hunza' },
    ],
  };
}
