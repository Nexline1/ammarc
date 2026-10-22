import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, ITEMS, search } from '../src/elements/catalog.ts';

const dir = path.resolve('public/elements');

describe('element library', () => {
  it('has unique ids across every category', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const c of CATEGORIES) expect(ITEMS.some((i) => i.cat === c.id)).toBe(true);
  });
  it.each(ITEMS.map((i) => [i.id]))('%s.svg is a safe, sized SVG', (id) => {
    const svg = fs.readFileSync(path.join(dir, `${id}.svg`), 'utf8').trim();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/<script|href|<style|<image|<text|on\w+=/i);
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    expect(vb).not.toBeNull();
    expect(svg).toContain(`width="${vb![1]}"`);
    expect(svg).toContain(`height="${vb![2]}"`);
    expect(svg.length).toBeLessThan(5120);
  });
  it('every hinged item says left, and has a prompt and real size', () => {
    for (const i of ITEMS) {
      expect([null, 'left']).toContain(i.hinge);
      expect(i.prompt.length).toBeGreaterThan(10);
      expect(i.size).toHaveLength(2);
    }
  });
  it('finds things by Arabic, Gulf loanwords and synonyms', () => {
    expect(search('باب').some((i) => i.id === 'inspection-door')).toBe(true);
    expect(search('grating').some((i) => i.id === 'safety-grating')).toBe(true);
    expect(search('درابزين').some((i) => i.id === 'handrail')).toBe(true);
  });
});
