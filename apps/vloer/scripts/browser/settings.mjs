/** Settings: the Environment page. */
export async function run({ page }) {
  await page.getByRole('link', { name: 'Environment' }).click();
  await page.getByRole('heading', { name: 'Execution environment', exact: true }).waitFor();
}
