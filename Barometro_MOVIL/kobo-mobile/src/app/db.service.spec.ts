import { ACCOUNT_SCOPE_KEY, accountScope, DbService } from './db.service';

describe('DbService account isolation', () => {
  it('uses a separate local database for each account and server', () => {
    const previousToken = localStorage.getItem('kobo_token');
    const previousScope = localStorage.getItem(ACCOUNT_SCOPE_KEY);
    const databases: DbService[] = [];

    try {
      localStorage.setItem('kobo_token', 'test-token');
      for (const scope of [
        accountScope(1, 'http://localhost:8000'),
        accountScope(3, 'http://localhost:8000'),
        accountScope(3, 'https://barometro-backend.onrender.com'),
      ]) {
        localStorage.setItem(ACCOUNT_SCOPE_KEY, scope);
        databases.push(new DbService());
      }

      expect(new Set(databases.map(database => database.name)).size).toBe(3);

      localStorage.removeItem(ACCOUNT_SCOPE_KEY);
      const unassigned = new DbService();
      databases.push(unassigned);
      expect(unassigned.name).not.toBe('KoboMobileDB');
      expect(databases.slice(0, 3).every(database => database.name !== unassigned.name)).toBe(true);
    } finally {
      databases.forEach(database => database.close());
      if (previousToken === null) localStorage.removeItem('kobo_token');
      else localStorage.setItem('kobo_token', previousToken);
      if (previousScope === null) localStorage.removeItem(ACCOUNT_SCOPE_KEY);
      else localStorage.setItem(ACCOUNT_SCOPE_KEY, previousScope);
    }
  });
});
