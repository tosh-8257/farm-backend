import { listQuery } from './list-query';

describe('list query', () => {
  it('pages, caps the limit, and filters a status', () => {
    expect(listQuery({ page: '2', limit: '100', sort: 'asc', status: 'paid' })).toEqual({
      page: 2,
      limit: 50,
      skip: 50,
      order: 'asc',
      status: 'paid',
    });
    expect(listQuery({}).order).toBe('desc');
  });
});
