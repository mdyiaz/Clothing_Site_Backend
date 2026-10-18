import { buildMeta, PaginatedResult } from './paginated-result';

describe('buildMeta', () => {
  it('describes a full first page', () => {
    expect(buildMeta(45, 1, 20)).toEqual({
      total: 45,
      page: 1,
      limit: 20,
      totalPages: 3,
      hasNext: true,
      hasPrev: false,
      from: 1,
      to: 20,
    });
  });

  it('describes a middle page', () => {
    const meta = buildMeta(45, 2, 20);
    expect(meta.hasPrev).toBe(true);
    expect(meta.hasNext).toBe(true);
    expect(meta.from).toBe(21);
    expect(meta.to).toBe(40);
  });

  it('describes the last page', () => {
    const meta = buildMeta(45, 3, 20);
    expect(meta.hasNext).toBe(false);
    expect(meta.to).toBe(45);
  });

  it('handles an empty result', () => {
    expect(buildMeta(0, 1, 20)).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
      from: 0,
      to: 0,
    });
  });
});

describe('PaginatedResult', () => {
  it('carries items + meta together', () => {
    const result = new PaginatedResult([1, 2], buildMeta(2, 1, 20));
    expect(result.items).toEqual([1, 2]);
    expect(result.meta.total).toBe(2);
  });
});
