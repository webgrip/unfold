/** A link request that failed, with the HTTP status Unfold answers and a stable code. */
export class LinkError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
