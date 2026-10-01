import { cardNews, cardSnapshot } from './moments.js';

const sameSnapshot = (a, b) => (a?.grade ?? null) === (b?.grade ?? null) && Boolean(a?.setComplete) === Boolean(b?.setComplete);

/**
 * The gate between a card's moments and its ceremonies: news plays once per person. `check(card)` reads the person's
 * seen mark for the card (`load`), works out the news since then from the card's facts, moves the mark forward
 * (`save`) before anything plays, so a reload or a second tab never replays it, and then hands the news to `play`.
 * On the person's first look at a card it only creates the mark. Checks for one card run one after another, and a
 * hidden page waits until it is visible again (`whenVisible`) before it marks or plays anything.
 * @param {{ load: (id: string) => Promise<object>, save: (id: string, snapshot: object) => Promise<object>, play: (news: object[], card: object, context: unknown) => void, now?: () => number, hidden?: () => boolean, whenVisible?: () => Promise<void> }} options
 */
export function createSeenGate({ load, save, play, now = () => Date.now(), hidden = () => false, whenVisible = () => Promise.resolve() }) {
  const marks = new Map();
  const running = new Map();

  async function run(card, context) {
    const id = String(card.workItemId);
    if (hidden()) await whenVisible();
    let mark = marks.get(id) ?? await load(id);
    const snapshot = cardSnapshot(card);
    if (!mark?.seenAt) {
      marks.set(id, await save(id, snapshot));
      return [];
    }
    const news = cardNews(card, mark, now());
    if (!news.length && sameSnapshot(snapshot, mark.snapshot)) { marks.set(id, mark); return []; }
    mark = await save(id, snapshot);
    marks.set(id, mark);
    if (news.length) play(news, card, context);
    return news;
  }

  return {
    /** Plays the news on `card` since the person last saw it, once; resolves with the news it played. */
    async check(card, context) {
      if (!card?.workItemId) return [];
      const id = String(card.workItemId);
      const previous = running.get(id) ?? Promise.resolve();
      const next = previous.catch(() => null).then(() => run(card, context));
      running.set(id, next);
      try { return await next; } catch { return []; } finally { if (running.get(id) === next) running.delete(id); }
    },
    /** Forgets the marks this page read, so the next check reads them again. */
    forget() { marks.clear(); },
  };
}
