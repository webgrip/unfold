/** Opens a page from the primary navigation: the sidebar when it is visible, otherwise the drawer behind the menu button. */
export async function navigate(page, label) {
  const sidebar = page.locator('.app-sidebar').getByRole('navigation', { name: 'Primary navigation' });
  if (await sidebar.isVisible()) return await sidebar.getByRole('link', { name: label, exact: true }).click();
  await page.locator('.app-topbar').getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await drawer.getByRole('link', { name: label, exact: true }).click();
  await drawer.waitFor({ state: 'hidden' });
}
