import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BeanCard } from '../src/cafe/BeanCard';
import { FilterChips } from '../src/filters/FilterChips';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import type { Bean } from '@cflog/shared';

const bean: Bean = {
  id: 'b1',
  name: 'Ethiopia Guji',
  origin: { countries: ['ET'], region: 'Guji' },
  isBlend: false,
  process: 'natural',
  roastLevel: 'light',
  varieties: [],
  isDecaf: false,
  tastingNotesRaw: ['Blueberry', 'Jasmine'],
  flavorFamilies: ['fruity/berry', 'floral/floral'],
  priceUsd: 22,
  sizeGrams: 340,
  inStock: true,
  source: 'shopify',
  firstSeenAt: '2026-09-01',
  lastSeenAt: '2026-09-20T00:00:00Z',
};

describe('components', () => {
  it('shows chip badges and opens a dimension', async () => {
    const onOpen = jest.fn();
    const onReset = jest.fn();
    await render(
      <ThemeProvider>
        <FilterChips
          filters={{ roastLevels: ['light', 'dark'], decafOnly: true }}
          onOpen={onOpen}
          onReset={onReset}
        />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Roast, 2 selected')).toBeTruthy();
    expect(screen.getByLabelText('All filters, 2 selected')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Origin'));
    expect(onOpen).toHaveBeenCalledWith('origin');
    await fireEvent.press(screen.getByLabelText('Reset'));
    expect(onReset).toHaveBeenCalled();
  });

  it('renders a bean card with origin, roast, notes and price, marking matches', async () => {
    await render(
      <ThemeProvider>
        <BeanCard bean={bean} matches />
      </ThemeProvider>,
    );
    expect(screen.getByText('Ethiopia Guji')).toBeTruthy();
    expect(screen.getByText(/Ethiopia · Guji · Natural/)).toBeTruthy();
    expect(screen.getByLabelText('Roast: Light')).toBeTruthy();
    expect(screen.getByText('Blueberry, Jasmine')).toBeTruthy();
    expect(screen.getByText('$22 · 12 oz')).toBeTruthy();
    expect(screen.getByLabelText('Matches your filters')).toBeTruthy();
    expect(screen.queryByText(/stars?|rating/i)).toBeNull();
  });
});
