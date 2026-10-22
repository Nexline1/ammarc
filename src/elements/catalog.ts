import a from './batch-a.json';
import b from './batch-b.json';
import c from './batch-c.json';

export type CatalogItem = { id: string; cat: string; en: string; ar: string; syn: string[]; size: [number, number]; hinge: 'left' | null; prompt: string };

export const CATEGORIES = [
  { id: 'access', en: 'Access & Safety', ar: 'الوصول والسلامة' },
  { id: 'gas', en: 'Gas & Piping', ar: 'الغاز والأنابيب' },
  { id: 'air', en: 'Ducts & Air', ar: 'الدكت والتهوية' },
  { id: 'machinery', en: 'Machinery & Lifting', ar: 'المعدات والرفع' },
  { id: 'structure', en: 'Structure & Materials', ar: 'الهيكل والمواد' },
  { id: 'vessels', en: 'Tanks & Vessels', ar: 'الخزانات والأوعية' },
  { id: 'signs', en: 'Signs & Safety Gear', ar: 'اللافتات ومعدات السلامة' },
];

const order = (cat: string) => CATEGORIES.findIndex((x) => x.id === cat);
export const ITEMS = ([...a, ...b, ...c] as CatalogItem[]).sort((x, y) => order(x.cat) - order(y.cat));
export const elementUrl = (id: string) => `/elements/${id}.svg`;

// Arabic-tolerant matching: strip diacritics/tatweel, unify alef/ya/ta-marbuta forms.
export const norm = (s: string) =>
  s.toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const hay = new Map(ITEMS.map((i) => [i.id, norm([i.id, i.en, i.ar, ...i.syn].join(' '))]));

export function search(q: string): CatalogItem[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return ITEMS;
  return ITEMS.filter((i) => words.every((w) => hay.get(i.id)!.includes(w)));
}
