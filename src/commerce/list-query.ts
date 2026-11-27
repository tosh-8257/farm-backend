export function listQuery(input: {
  page?: string | number;
  limit?: string | number;
  sort?: string;
  status?: string;
}) {
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(input.limit) || 20));
  const sort = input.sort === 'asc' ? 'asc' : 'desc';
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    order: sort as 'asc' | 'desc',
    status: input.status?.trim() || undefined,
  };
}
