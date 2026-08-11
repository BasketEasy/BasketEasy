import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, resolvePagination } from './pagination';

describe('resolvePagination', () => {
  it('defaults to page 1 and the default page size when nothing is passed', () => {
    expect(resolvePagination()).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it('computes skip for page 2+', () => {
    expect(resolvePagination(3, 10)).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });

  it('clamps pageSize above MAX_PAGE_SIZE', () => {
    expect(resolvePagination(1, 1000)).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      skip: 0,
      take: MAX_PAGE_SIZE,
    });
  });

  it('falls back to defaults for non-positive values', () => {
    expect(resolvePagination(0, -5)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });
});
