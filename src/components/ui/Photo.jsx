import { photoSize, photoSrc, photos, srcSet } from '../../data/photos.js';

// A real photo of the place, responsive (WebP srcset) with fixed dimensions so the layout
// never jumps while it loads.
export default function Photo({ id, sizes = '100vw', className = '', priority = false, alt, position }) {
  const { width, height } = photoSize(id);
  return (
    <img
      src={photoSrc(id, 800)}
      srcSet={srcSet(id)}
      sizes={sizes}
      width={width}
      height={height}
      alt={alt ?? photos[id]?.alt ?? ''}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchpriority={priority ? 'high' : undefined}
      style={{ objectPosition: position || photos[id]?.position || 'center' }}
      className={`h-full w-full bg-limestone-300 object-cover ${className}`}
    />
  );
}
