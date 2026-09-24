import { readFileSync } from 'node:fs';
import { isCoffeeProduct } from '@cflog/shared';
import { describe, expect, it } from 'vitest';
import {
  findNotes,
  findProcessInText,
  findRoastInText,
  findVarieties,
  isDecafText,
  parseProcess,
  parseRoast,
  parseSizeGrams,
  splitNotes,
} from '../src/extract/keywords.js';
import { beansFromShopify } from '../src/extract/shopify.js';
import { beansFromWoo } from '../src/extract/woocommerce.js';

const fixture = (f: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf8')) as unknown;

describe('keyword parsers', () => {
  it('parses roast levels', () => {
    expect(parseRoast('Medium-Light')).toBe('medium-light');
    expect(parseRoast('Full City')).toBe('medium-dark');
    expect(parseRoast('Omni')).toBe('omni');
    expect(parseRoast('banana')).toBeNull();
    expect(findRoastInText('Our light roast for filter.')).toBe('light');
    expect(findRoastInText('Roast level: Medium')).toBe('medium');
    expect(findRoastInText('Great for espresso roast lovers')).toBeNull();
  });
  it('parses processes without mistaking flavour words', () => {
    expect(parseProcess('Carbonic Maceration Natural')).toBe('carbonic-maceration');
    expect(parseProcess('Red Honey')).toBe('honey');
    expect(parseProcess('Giling Basah')).toBe('wet-hulled');
    expect(findProcessInText('Process: Anaerobic natural')).toBe('anaerobic');
    expect(findProcessInText('A natural sweetness with honey notes')).toBeNull();
    expect(findProcessInText('This naturally processed lot')).toBe('natural');
  });
  it('finds varieties, notes, decaf and sizes', () => {
    expect(findVarieties('Pink Bourbon and Gesha, aged in bourbon barrels')).toEqual([
      'gesha',
      'pink bourbon',
    ]);
    expect(findVarieties('SL-28, SL 34 & Ruiru 11')).toEqual(['sl28', 'sl34', 'ruiru11']);
    expect(splitNotes('Blueberry, milk chocolate & jasmine.')).toEqual([
      'Blueberry',
      'milk chocolate',
      'jasmine',
    ]);
    expect(findNotes('Some intro.\nTasting Notes: Peach / Honey / Black tea\nMore')).toEqual([
      'Peach',
      'Honey',
      'Black tea',
    ]);
    expect(isDecafText('Sugarcane process decaf')).toBe(true);
    expect(isDecafText('Decadent chocolate')).toBe(false);
    expect(parseSizeGrams('12 oz / Whole Bean')).toBe(340);
    expect(parseSizeGrams('2 lb')).toBe(907);
    expect(parseSizeGrams('250g')).toBe(250);
    expect(parseSizeGrams('1 kg')).toBe(1000);
    expect(parseSizeGrams('Whole bean')).toBeUndefined();
  });
});

describe('isCoffeeProduct', () => {
  it.each([
    ['Ethiopia Guji', 'Coffee', true],
    ['Filter Roast Box', '', true],
    ['Colombia Cup of Excellence #3', '', true],
    ['Kenya — tea-like and bright', 'Coffee', true],
    ['Logo Mug', 'Merch', false],
    ['Coffee Subscription', 'Coffee', false],
    ['Earl Grey', 'Tea', false],
    ['Cold Brew Concentrate', 'Coffee', false],
    ['Hand Grinder', '', false],
    ['Gift Card', '', false],
  ])('%s (%s) → %s', (title, type, expected) => {
    expect(isCoffeeProduct({ title, type, tags: [] })).toBe(expected);
  });
});

describe('Shopify extraction', () => {
  const beans = beansFromShopify([fixture('shopify-products.json')], 'https://sample.example');
  const byName = Object.fromEntries(beans.map((b) => [b.name, b]));

  it('keeps only coffee products', () => {
    expect(beans.map((b) => b.name)).toEqual([
      'Ethiopia Guji Hambela',
      'Sample House Blend',
      'Decaf Colombia',
      'Costa Rica Tarrazu Honey',
    ]);
  });
  it('maps a single origin with labelled attributes', () => {
    expect(byName['Ethiopia Guji Hambela']).toMatchObject({
      url: 'https://sample.example/products/ethiopia-guji-hambela',
      roast: 'light',
      process: 'natural',
      countries: ['ET'],
      varieties: ['ethiopian landrace'],
      notes: ['Blueberry', 'jasmine', 'milk chocolate'],
      priceUsd: 22,
      sizeGrams: 340,
      inStock: true,
      isDecaf: false,
      isBlend: false,
      source: 'shopify',
    });
  });
  it('detects blends, stock and multiple countries', () => {
    expect(byName['Sample House Blend']).toMatchObject({
      isBlend: true,
      countries: ['BR', 'CO'],
      roast: 'medium',
      inStock: false,
      priceUsd: 17,
    });
    expect(byName['Sample House Blend']!.notes).toEqual(['cocoa', 'toffee', 'almond']);
  });
  it('detects decaf and processes named in titles', () => {
    expect(byName['Decaf Colombia']).toMatchObject({
      isDecaf: true,
      countries: ['CO'],
      sizeGrams: 340,
      priceUsd: 19.5,
      notes: ['caramel', 'red apple'],
    });
    expect(byName['Costa Rica Tarrazu Honey']).toMatchObject({
      process: 'honey',
      countries: ['CR'],
      varieties: ['caturra', 'catuai'],
    });
  });
  it('de-duplicates across pages', () => {
    const f = fixture('shopify-products.json');
    expect(beansFromShopify([f, f], 'https://sample.example')).toHaveLength(4);
  });
});

describe('WooCommerce extraction', () => {
  it('uses attributes and minor-unit prices', () => {
    const beans = beansFromWoo([fixture('woo-products.json')]);
    expect(beans).toHaveLength(1);
    expect(beans[0]).toMatchObject({
      name: 'Kenya Nyeri AA',
      url: 'https://woo.example/product/kenya-nyeri-aa/',
      countries: ['KE'],
      process: 'Washed',
      roast: 'Light',
      notes: ['Blackcurrant', 'grapefruit', 'Brown sugar'],
      varieties: ['sl28', 'sl34'],
      priceUsd: 21,
      sizeGrams: 340,
      inStock: true,
      source: 'woocommerce',
    });
  });
});

describe('malformed store data', () => {
  it('skips null or odd-shaped products instead of crashing', () => {
    const body = {
      products: [
        null,
        42,
        { title: 7 },
        {
          title: 'Kenya AA',
          product_type: 'Coffee',
          tags: [null, 'coffee'],
          variants: [null, { price: '20', title: '12 oz' }],
        },
      ],
    };
    expect(beansFromShopify([body], 'https://x.example').map((b) => b.name)).toEqual(['Kenya AA']);
    expect(
      beansFromWoo([
        [null, { name: 'Peru', categories: [null, { name: 'Coffee' }], attributes: [null] }],
      ]).map((b) => b.name),
    ).toEqual(['Peru']);
  });
});
