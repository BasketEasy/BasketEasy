export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface PaginationArgs {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

// Defense-in-depth clamp behind PaginationQueryDto's own @Max(100) — callers
// that construct a query object outside the validation pipe (e.g. tests)
// still can't request an unbounded page.
export function resolvePagination(page?: number, pageSize?: number): PaginationArgs {
  const resolvedPage = page && page > 0 ? page : 1;
  const resolvedPageSize =
    pageSize && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    skip: (resolvedPage - 1) * resolvedPageSize,
    take: resolvedPageSize,
  };
}
