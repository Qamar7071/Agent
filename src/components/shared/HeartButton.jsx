// Save a place for later. A real button with its state, never inside a link.
import { Heart } from 'lucide-react';
import { toggleSaved, useSavedPlaces } from '../../lib/wishlist.js';

export default function HeartButton({ id, name, overlay = false, className = '' }) {
  const saved = useSavedPlaces().includes(id);
  return (
    <button type="button" aria-pressed={saved} onClick={() => toggleSaved(id)}
      aria-label={saved ? `Saved: ${name}. Remove from saved places` : `Save ${name} for later`}
      title={saved ? 'Saved' : 'Save for later'}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${overlay
        ? 'bg-paper/90 text-ink shadow hover:bg-paper' : 'border border-limestone-400 hover:border-ink-500'} ${className}`}>
      <Heart size={20} aria-hidden="true" className={saved ? 'fill-brick text-brick' : ''} />
    </button>
  );
}
