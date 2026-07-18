import type { Drug } from '../types';
import { DRUGS } from '../data/drugs';

// Rank prefix matches above partial matches; search generic, brand and class.
export function searchDrugs(query: string, limit = 20): Drug[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { drug: Drug; score: number }[] = [];

  for (const d of DRUGS) {
    const generic = d.generic.toLowerCase();
    const brands = d.brand.map((b) => b.toLowerCase());
    const klass = d.drugClass.toLowerCase();
    const tags = d.classTags.join(' ');

    let score = 0;
    if (generic === q) score = 100;
    else if (generic.startsWith(q)) score = 90;
    else if (brands.some((b) => b === q)) score = 85;
    else if (brands.some((b) => b.startsWith(q))) score = 80;
    else if (generic.includes(q)) score = 60;
    else if (brands.some((b) => b.includes(q))) score = 55;
    else if (klass.startsWith(q)) score = 45;
    else if (klass.includes(q)) score = 35;
    else if (tags.includes(q)) score = 25;
    else if (fuzzy(generic, q)) score = 15;

    if (score > 0) scored.push({ drug: d, score });
  }

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.drug.generic.localeCompare(b.drug.generic)));
  return scored.slice(0, limit).map((s) => s.drug);
}

// Lightweight subsequence fuzzy match (handles typos/skips).
function fuzzy(text: string, q: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}
