import React from 'react';
import { Waves } from 'lucide-react';
import { useBranding, type AppBranding } from '../lib/branding';

/**
 * Frilensa's logo tile: the uploaded image, letters or an emoji on the brand colours, or the
 * built-in waves mark. Pass `branding` to preview unsaved settings.
 */
export default function BrandMark({ size = 36, rounded = 'rounded-xl', branding, className = '' }: {
  size?: number; rounded?: string; branding?: AppBranding; className?: string;
}) {
  const live = useBranding();
  const b = branding || live;
  const box: React.CSSProperties = { width: size, height: size };
  if (b.logoType === 'image' && b.logoUrl) {
    return <img src={b.logoUrl} alt={b.name} style={box} className={`${rounded} object-contain shrink-0 ${className}`} />;
  }
  const gradient: React.CSSProperties = { ...box, backgroundImage: `linear-gradient(to top right, ${b.primaryColor}, ${b.accentColor})` };
  return (
    <div style={gradient} className={`${rounded} flex items-center justify-center text-white shrink-0 shadow-md ${className}`} aria-label={b.name} role="img">
      {b.logoType === 'text' ? (
        <span className="font-black tracking-tight leading-none" style={{ fontSize: Math.round(size * (b.logoText.length > 2 ? 0.32 : 0.42)) }}>{b.logoText || b.name.charAt(0)}</span>
      ) : b.logoType === 'emoji' ? (
        <span className="leading-none" style={{ fontSize: Math.round(size * 0.55) }}>{b.logoEmoji}</span>
      ) : (
        <Waves style={{ width: size * 0.55, height: size * 0.55 }} />
      )}
    </div>
  );
}
