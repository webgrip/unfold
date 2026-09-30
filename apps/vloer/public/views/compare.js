import { openPage } from '../core/navigation.js';

/** Compare was removed. An old `#compare/…` link that reaches this view is replaced by `#sessions`, which then opens. */
export default {
  id: 'compare',
  match: hash => hash === 'compare' || hash.startsWith('compare/') ? {} : null,
  enter: async () => { history.replaceState(null, '', '#sessions'); await openPage('sessions'); },
};
