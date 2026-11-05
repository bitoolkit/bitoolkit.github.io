import sharp from 'sharp';

export interface Accent {
  deep: string;
  accent: string;
  soft: string;
}

export const BRAND_ACCENT: Accent = { deep: '#006830', accent: '#00773a', soft: '#e3eee3' };

function toHsl(red: number, green: number, blue: number): [number, number, number] {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function toHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    const value = lightness - chroma / 2 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export async function accentFromImage(url: string): Promise<Accent> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetching ${url} failed: ${response.status}`);
  const { data } = await sharp(Buffer.from(await response.arrayBuffer()))
    .resize(64, 64, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bins = Array.from({ length: 24 }, () => ({ weight: 0, hue: 0, saturation: 0 }));
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha < 0.5) continue;
    const [hue, saturation, lightness] = toHsl(data[index], data[index + 1], data[index + 2]);
    if (saturation < 0.35 || lightness < 0.15 || lightness > 0.85) continue;
    const bin = bins[Math.floor(hue / 15) % 24];
    const weight = saturation * alpha;
    bin.weight += weight;
    bin.hue += hue * weight;
    bin.saturation += saturation * weight;
  }
  const best = bins.reduce((a, b) => (b.weight > a.weight ? b : a));
  if (best.weight === 0) return BRAND_ACCENT;

  const hue = best.hue / best.weight;
  const saturation = best.saturation / best.weight;
  return {
    deep: toHex(hue, clamp(saturation, 0.45, 0.7), 0.24),
    accent: toHex(hue, clamp(saturation, 0.5, 0.75), 0.36),
    soft: toHex(hue, clamp(saturation, 0.3, 0.5), 0.92),
  };
}
