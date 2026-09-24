import { describe, expect, it } from 'vitest';
import {
  FLAVOR_FAMILIES,
  familyMatches,
  isFlavorFamilyId,
  subFamilies,
  TOP_FAMILIES,
} from '../src/flavor';
import { mapTastingNote, mapTastingNotes, NOTE_DICTIONARY } from '../src/noteDictionary';
import { normalizeText, normalizeVariety } from '../src/vocab';

describe('note dictionary', () => {
  it('has at least 300 entries, all valid ids', () => {
    const entries = Object.entries(NOTE_DICTIONARY);
    expect(entries.length).toBeGreaterThanOrEqual(300);
    for (const [, id] of entries) expect(isFlavorFamilyId(id)).toBe(true);
  });
  it('keys are normalised', () => {
    for (const key of Object.keys(NOTE_DICTIONARY)) expect(normalizeText(key)).toBe(key);
  });
});

describe('mapTastingNote', () => {
  it.each([
    ['Jammy Blackberry', ['fruity/berry', 'fruity/other-fruit']],
    ['cocoa nib', ['nutty-cocoa/cocoa']],
    ['Cocoa Nibs', ['nutty-cocoa/cocoa']],
    ['Blueberries', ['fruity/berry']],
    ['Rainier cherry & rose', ['fruity/other-fruit', 'floral/floral']],
    ['Earl Grey', ['floral/tea']],
    ['crème brûlée', ['sweet/brown-sugar']],
    ['Milk Chocolate, Toffee', ['nutty-cocoa/cocoa', 'sweet/brown-sugar']],
    ['baker’s chocolate', ['nutty-cocoa/cocoa']],
    ['dried cherries', ['fruity/dried-fruit']],
  ])('%s', (note, expected) => {
    expect(mapTastingNote(note).sort()).toEqual([...expected].sort());
  });
  it('returns [] for texture words', () => {
    expect(mapTastingNote('silky body')).toEqual([]);
  });
  it('collects unmapped notes', () => {
    expect(mapTastingNotes(['Peach', 'Velvety', 'Lemon'])).toEqual({
      families: ['fruity/other-fruit', 'fruity/citrus'],
      unmapped: ['Velvety'],
    });
  });
});

describe('flavor taxonomy', () => {
  it('lists top families and their subs', () => {
    expect(TOP_FAMILIES).toContain('fruity');
    expect(TOP_FAMILIES.every((f) => !f.includes('/'))).toBe(true);
    expect(subFamilies('fruity')).toHaveLength(4);
    expect(subFamilies('roasted')).toEqual([]);
    expect(FLAVOR_FAMILIES.every((f) => TOP_FAMILIES.includes(f.split('/')[0] as never))).toBe(
      true,
    );
  });
  it('matches parents to children only', () => {
    expect(familyMatches('fruity/berry', 'fruity')).toBe(true);
    expect(familyMatches('fruity', 'fruity/berry')).toBe(false);
  });
});

describe('normalisers', () => {
  it('normalises text and varieties', () => {
    expect(normalizeText('  Crème—Brûlée! ')).toBe('creme brulee');
    expect(normalizeVariety('Geisha')).toBe('gesha');
    expect(normalizeVariety('SL-28')).toBe('sl28');
    expect(normalizeVariety('Pink Bourbon')).toBe('pink bourbon');
  });
});
