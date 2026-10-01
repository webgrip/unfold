/** Submits sign-up forms with fetch and confirms inline; the plain POST keeps working without it. */
export function enhanceSignupForms(): void {
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-signup]')) {
    const panel = form.parentElement;
    const done = panel?.querySelector<HTMLElement>('[data-signup-done]');
    const error = form.querySelector<HTMLElement>('[data-signup-error]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const label = form.querySelector<HTMLElement>('[data-signup-label]');
    const idle = label?.textContent ?? '';

    const showError = (code: string) => {
      if (!error) return;
      const key = `error${code.charAt(0).toUpperCase()}${code.slice(1)}`;
      error.textContent = form.dataset[key] ?? form.dataset['errorUnavailable'] ?? '';
      error.hidden = false;
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (submit?.getAttribute('aria-busy') === 'true') return;
      if (error) error.hidden = true;
      submit?.setAttribute('aria-busy', 'true');
      if (label) label.textContent = form.dataset['sending'] ?? idle;
      const body = new URLSearchParams();
      for (const [name, value] of new FormData(form))
        if (typeof value === 'string') body.append(name, value);
      fetch(form.action, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body,
      })
        .then(async (response) => {
          const result = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };
          if (response.ok && result.ok) {
            form.hidden = true;
            if (done) {
              done.hidden = false;
              done.focus();
            }
            return;
          }
          showError(result.error ?? 'unavailable');
        })
        .catch(() => showError('network'))
        .finally(() => {
          submit?.removeAttribute('aria-busy');
          if (label) label.textContent = idle;
        });
    });
  }
}
