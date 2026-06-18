/**
 * Runs a callback inside a mocked transaction.
 * Replaced PostgreSQL with MongoDB, so we simply execute the callback immediately.
 */
export async function withPgTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  return await fn(null);
}
