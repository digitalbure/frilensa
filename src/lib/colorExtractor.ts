/**
 * Auto Color Scheme Extractor from Business Logos & Images
 * Uses client-side HTML5 Canvas pixel sampling and color quantization
 * to extract dominant, vibrant brand colors, accent tones, and tints.
 */

export interface ExtractedColor {
  hex: string;
  r: number;
  g: number;
  b: number;
  h: number;
  s: number;
  l: number;
  population: number;
}

export interface ExtractedPalette {
  primary: string;       // Dominant vibrant brand color (e.g. #0284c7)
  accent: string;        // Vibrant secondary / complementary color
  lightTint: string;     // Soft pastel background tint
  darkShade: string;     // Deep high-contrast shade
  palette: string[];     // Top 5 extracted hex swatches
  isDarkLogo: boolean;   // Whether the primary color is dark
}

/**
 * Convert RGB to Hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Calculate color distance to avoid picking almost identical colors
 */
function colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Extract dominant colors and harmonious palette from an image source
 * (Data URL, Blob URL, or external URL with CORS support)
 */
export async function extractPaletteFromImage(imageSrc: string): Promise<ExtractedPalette> {
  return new Promise((resolve) => {
    // Default fallback palette if image fails to load
    const fallbackPalette: ExtractedPalette = {
      primary: '#0284c7', // Sky-600
      accent: '#0d9488',  // Teal-600
      lightTint: '#f0f9ff',
      darkShade: '#0c4a6e',
      palette: ['#0284c7', '#0d9488', '#059669', '#1e293b', '#64748b'],
      isDarkLogo: false
    };

    if (!imageSrc || typeof window === 'undefined') {
      resolve(fallbackPalette);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(fallbackPalette);
          return;
        }

        // Downscale image to max 80x80 for instant performance and smoothing
        const maxDim = 80;
        let width = img.width || maxDim;
        let height = img.height || maxDim;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height).data;
        const colorBuckets = new Map<string, { r: number; g: number; b: number; count: number }>();

        // Sample pixels (step by 4 bytes = RGBA)
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          // Filter out transparent pixels
          if (a < 120) continue;

          // Filter out pure white/very light background pixels (> 245)
          if (r > 245 && g > 245 && b > 245) continue;

          // Filter out pure black/near black pixels (< 15) unless that's all there is
          if (r < 15 && g < 15 && b < 15) continue;

          // Quantize to 16-color step buckets to group similar shades
          const quantizeStep = 16;
          const qr = Math.floor(r / quantizeStep) * quantizeStep + Math.floor(quantizeStep / 2);
          const qg = Math.floor(g / quantizeStep) * quantizeStep + Math.floor(quantizeStep / 2);
          const qb = Math.floor(b / quantizeStep) * quantizeStep + Math.floor(quantizeStep / 2);
          const key = `${qr},${qg},${qb}`;

          const existing = colorBuckets.get(key);
          if (existing) {
            existing.count++;
          } else {
            colorBuckets.set(key, { r: qr, g: qg, b: qb, count: 1 });
          }
        }

        if (colorBuckets.size === 0) {
          resolve(fallbackPalette);
          return;
        }

        // Convert buckets to list with HSL metadata
        const colors: ExtractedColor[] = [];
        colorBuckets.forEach((val) => {
          const hsl = rgbToHsl(val.r, val.g, val.b);
          colors.push({
            hex: rgbToHex(val.r, val.g, val.b),
            r: val.r,
            g: val.g,
            b: val.b,
            h: hsl.h,
            s: hsl.s,
            l: hsl.l,
            population: val.count
          });
        });

        // Filter and distinct candidates
        const distinctColors: ExtractedColor[] = [];
        colors.sort((a, b) => b.population - a.population);

        for (const c of colors) {
          const isSimilar = distinctColors.some(d => colorDistance(c, d) < 45);
          if (!isSimilar) {
            distinctColors.push(c);
          }
          if (distinctColors.length >= 8) break;
        }

        // Score colors to find the best brand primary color:
        // Saturated colors with good visibility (lightness between 25% and 75%) get highest priority
        distinctColors.sort((a, b) => {
          const scoreA = a.s * 1.5 + (100 - Math.abs(a.l - 50)) + Math.log(a.population + 1) * 10;
          const scoreB = b.s * 1.5 + (100 - Math.abs(b.l - 50)) + Math.log(b.population + 1) * 10;
          return scoreB - scoreA;
        });

        const primaryObj = distinctColors[0] || {
          hex: '#0284c7', r: 2, g: 132, b: 199, h: 200, s: 98, l: 39, population: 100
        };

        // Pick accent color: distinct hue difference from primary (> 30 deg hue or high saturation)
        let accentObj = distinctColors.find(c => {
          const hueDiff = Math.abs(c.h - primaryObj.h);
          const effectiveHueDiff = hueDiff > 180 ? 360 - hueDiff : hueDiff;
          return effectiveHueDiff > 35 && c.hex !== primaryObj.hex && c.s > 25;
        });

        if (!accentObj) {
          accentObj = distinctColors[1] || primaryObj;
        }

        const topSwatches = distinctColors.slice(0, 5).map(c => c.hex);
        if (!topSwatches.includes(primaryObj.hex)) {
          topSwatches.unshift(primaryObj.hex);
        }

        // Calculate light background tint & dark shade based on primary
        const lightTint = `hsl(${primaryObj.h}, ${Math.max(30, primaryObj.s * 0.4)}%, 96%)`;
        const darkShade = `hsl(${primaryObj.h}, ${Math.min(90, primaryObj.s * 0.8)}%, 22%)`;

        resolve({
          primary: primaryObj.hex,
          accent: accentObj ? accentObj.hex : primaryObj.hex,
          lightTint,
          darkShade,
          palette: topSwatches,
          isDarkLogo: primaryObj.l < 40
        });
      } catch (err) {
        console.warn('Auto color extraction failed, returning fallback:', err);
        resolve(fallbackPalette);
      }
    };

    img.onerror = () => {
      resolve(fallbackPalette);
    };

    img.src = imageSrc;
  });
}
