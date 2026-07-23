import React, { useRef, useState } from 'react';
import { MediaItem } from '../types';

interface MediaCarouselProps {
  media: MediaItem[];
  aspect?: string; // clase tailwind de aspecto; por defecto vertical estilo feed
}

// Carrusel estilo feed de Instagram: media a ancho completo (formato vertical
// 4:5 por defecto), contador 1/N arriba a la derecha y puntitos debajo.
const MediaCarousel: React.FC<MediaCarouselProps> = ({ media, aspect = 'aspect-[4/5]' }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (!media || media.length === 0) return null;

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(idx);
  };

  return (
    <div>
      <div className="relative rounded-2xl overflow-hidden border-2 border-black bg-black">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: 'none' }}
        >
          {media.map((m, i) => (
            <div key={i} className={`shrink-0 w-full ${aspect} snap-center bg-black flex items-center justify-center`}>
              {m.type === 'video' ? (
                <video src={m.url} controls playsInline className="w-full h-full object-cover" />
              ) : (
                <img src={m.url} className="w-full h-full object-cover" />
              )}
            </div>
          ))}
        </div>

        {media.length > 1 && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-[11px] font-black px-2 py-0.5 rounded-full pointer-events-none">
            {active + 1}/{media.length}
          </div>
        )}
      </div>

      {media.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {media.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? 'bg-black w-4' : 'bg-black/25 w-1.5'}`} />
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaCarousel;
