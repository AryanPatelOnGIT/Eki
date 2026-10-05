import { FieldPath, type Query } from "firebase-admin/firestore";
export const RECONCILIATION_PAGE_SIZE = 100;
/** Keep the enclosing permit/mutex until every SDK call actually settles. */
export async function settleTogether<T extends readonly unknown[]>(tasks: readonly [...T]): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const outcomes = await Promise.allSettled(tasks);
  const failure = outcomes.find(outcome => outcome.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return outcomes.map(outcome => (outcome as PromiseFulfilledResult<unknown>).value) as { -readonly [K in keyof T]: Awaited<T[K]> };
}
/** A stable document-ID cursor; one query and at most 100 records per page. */
export async function reconciliationPage(query: Query, cursor?: string) {
  let pageQuery = query.orderBy(FieldPath.documentId()).limit(RECONCILIATION_PAGE_SIZE);
  if (cursor) pageQuery = pageQuery.startAfter(cursor);
  const snapshot = await pageQuery.get();
  return { docs: snapshot.docs, nextCursor: snapshot.size === RECONCILIATION_PAGE_SIZE ? snapshot.docs.at(-1)!.id : null };
}
export async function* reconciliationPages(query: Query) {
  let cursor: string | undefined;
  do {
    const page = await reconciliationPage(query, cursor); yield page.docs;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
}
/** A rejection stops subsequent batches only after every dispatched task settles. */
export async function forEachBounded<T>(items: readonly T[], concurrency: number, work: (item: T) => Promise<unknown>) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error("Invalid reconciliation concurrency.");
  for (let index = 0; index < items.length; index += concurrency) {
    const results = await Promise.allSettled(items.slice(index, index + concurrency).map(work));
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}
