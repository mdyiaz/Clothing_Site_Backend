import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates a name', () => {
    expect(slugify('Classic Cotton Panjabi — Eid Edition')).toBe(
      'classic-cotton-panjabi-eid-edition',
    );
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugify('  !!! Hello World !!!  ')).toBe('hello-world');
  });

  it('collapses runs of special characters into one hyphen', () => {
    expect(slugify('a___b///c')).toBe('a-b-c');
  });

  it('returns an empty string for values with no usable characters', () => {
    expect(slugify('???')).toBe('');
  });

  it('keeps numbers', () => {
    expect(slugify('Shirt 2026')).toBe('shirt-2026');
  });
});
