import login from './login.js';
import session from './session.js';
import now from './now.js';
import sessions from './sessions.js';
import compare from './compare.js';
import tasks from './tasks.js';
import ploeg from './ploeg.js';
import account from './account.js';
import system from './system.js';
import dialogs from './dialogs.js';

/** Every view descriptor. The order is the dispatch order for key bindings and page loaders. */
export const views = [login, session, now, sessions, compare, tasks, ploeg, account, system, dialogs];
