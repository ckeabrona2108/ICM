export interface NormalizedPagination {
  safePerPage: number;
  safePage: number;
  totalPages: number;
  start: number;
  end: number;
}

export function normalizePagination(params: {
  total: number;
  page: number;
  perPage: number;
}): NormalizedPagination {
  const safePerPage =
    Number.isFinite(params.perPage) && params.perPage > 0 ? Math.floor(params.perPage) : 20;
  const normalizedPage =
    Number.isFinite(params.page) && params.page > 0 ? Math.floor(params.page) : 1;
  const totalPages = Math.max(1, Math.ceil(Math.max(0, params.total) / safePerPage));
  const safePage = Math.min(normalizedPage, totalPages);
  const start = (safePage - 1) * safePerPage;
  const end = safePage * safePerPage;

  return { safePerPage, safePage, totalPages, start, end };
}

export function hasInconsistentListState(params: {
  total: number;
  visibleItemsCount: number;
}): boolean {
  return params.total > 0 && params.visibleItemsCount === 0;
}
