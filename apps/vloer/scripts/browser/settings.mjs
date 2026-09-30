/** Settings: the Environment page, reached through Settings. */
export async function run({ page }) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Environment', exact: true }).click();
  await page.getByRole('heading', { name: 'Execution environment', exact: true }).waitFor();
}
