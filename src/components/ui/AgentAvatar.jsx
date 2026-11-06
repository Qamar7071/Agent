// Each agent's icon and colour, shared by the conversation, the pipeline and the homepage.
import {
  BadgeCheck, BedDouble, Backpack, Brain, CloudSun, Compass, Copy, Leaf, Network, Route, Scale, ShieldAlert, ShieldCheck,
  Signpost, Users, Wallet,
} from 'lucide-react';

export const LOOK = {
  orchestrator: [Network, 'bg-juniper-100 text-juniper-700'],
  memory: [Brain, 'bg-lake-100 text-lake-700'],
  research: [Compass, 'bg-lake-100 text-lake-700'],
  itinerary: [Route, 'bg-apricot-100 text-ochre-700'],
  route: [Signpost, 'bg-apricot-100 text-ochre-700'],
  weather: [CloudSun, 'bg-lake-100 text-lake-700'],
  budget: [Wallet, 'bg-ochre-100 text-ochre-700'],
  accommodation: [BedDouble, 'bg-ochre-100 text-ochre-700'],
  safety: [ShieldCheck, 'bg-brick-50 text-brick'],
  guardian: [ShieldAlert, 'bg-brick-50 text-brick'],
  packing: [Backpack, 'bg-juniper-100 text-juniper-700'],
  eco: [Leaf, 'bg-juniper-100 text-juniper-700'],
  validation: [BadgeCheck, 'bg-juniper-100 text-juniper-700'],
  twin: [Copy, 'bg-limestone-300 text-ink-700'],
  comparison: [Scale, 'bg-limestone-300 text-ink-700'],
};

export function agentIcon(agent, label) {
  return /consensus/i.test(label || '') ? [Users, LOOK.validation[1]] : LOOK[agent] || LOOK.orchestrator;
}

export function AgentAvatar({ agent, label, size = 40, className = '' }) {
  const [Icon, tone] = agentIcon(agent, label);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${tone} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
