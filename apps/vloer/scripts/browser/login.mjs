/** Live sign-in and sign-out against the live-mode server, whose bootstrap account uses `password`. */
export async function run({ page, live, password, screenshot }) {
  await page.goto(`http://127.0.0.1:${live.server.address().port}`);
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await screenshot('login');
  await page.getByRole('textbox', { name: 'Account name' }).fill('browser-operator');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Now', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
}
