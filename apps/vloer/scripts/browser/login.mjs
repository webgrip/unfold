/** Live sign-in and sign-out against the live-mode server, whose bootstrap account uses `password`: a failed attempt that keeps the account name, the phone layout, and a session that expires mid-use. */
export async function run({ page, live, password, assert, screenshot }) {
  const signIn = async () => {
    await page.getByRole('textbox', { name: 'Account name' }).fill('browser-operator');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  };
  await page.goto(`http://127.0.0.1:${live.server.address().port}`);
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await screenshot('login');
  await page.getByRole('textbox', { name: 'Account name' }).fill('browser-operator');
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Name or password is incorrect.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Account name' }).inputValue(), 'browser-operator', 'a failed sign-in cleared the account name');
  assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('aria-invalid'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'login-password', 'a failed sign-in does not return to the password');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the sign-in page overflows at 390px');
  await screenshot('login-error-390');
  await page.setViewportSize({ width: 1440, height: 1040 });
  await signIn();
  await page.getByRole('heading', { name: 'Now', exact: true }).first().waitFor();
  await page.keyboard.press('?');
  await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
  await page.context().clearCookies();
  await page.evaluate(() => { location.hash = 'settings/accounts'; });
  await page.getByText('Your session expired', { exact: true }).waitFor();
  await page.getByText('Sign in again to continue where you were.', { exact: true }).waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 0, 'a dialog stayed open over the sign-in page');
  assert.equal(await page.title(), 'Sign in · De Vloer', 'the sign-in page keeps the title of the page it replaced');
  assert.equal(new URL(page.url()).hash, '#settings/accounts');
  await signIn();
  await page.getByRole('heading', { level: 1, name: 'Linked accounts', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Account and theme/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  assert.equal(await page.getByText('Your session expired', { exact: false }).count(), 0, 'signing out on purpose is not an expired session');
  assert.equal(await page.getByRole('textbox', { name: 'Account name' }).inputValue(), '', 'signing out kept the last account name');
}
