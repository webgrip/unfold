/** Formats US dollars with more fraction digits for sub-dollar and sub-cent amounts. */
export const money = value => { const amount = value || 0; const digits = amount > 0 && amount < 0.01 ? 5 : amount > 0 && amount < 1 ? 4 : 3; return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(amount); };
/** Formats a timestamp as a local wall-clock time with seconds. */
export const clock = value => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
/** Describes how long ago a timestamp was, falling back to a local date after a day. */
export const ago = value => { const minutes = Math.floor((Date.now() - Date.parse(value)) / 60000); return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : new Date(value).toLocaleDateString(); };
