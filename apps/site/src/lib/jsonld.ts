import { LICENSE_ID, SITE_NAME, SITE_URL, SOURCE_URL } from '../config/site.ts';

export function softwareSchema(description: string, inLanguage: string): Record<string, unknown>[] {
  const license = `https://spdx.org/licenses/${LICENSE_ID}.html`;
  return [
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: SITE_NAME,
      description,
      inLanguage,
      url: `${SITE_URL}/`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Kubernetes',
      license,
      isAccessibleForFree: true,
    },
    {
      '@type': 'SoftwareSourceCode',
      '@id': `${SITE_URL}/#source`,
      name: SITE_NAME,
      codeRepository: SOURCE_URL,
      programmingLanguage: ['Go', 'TypeScript'],
      license,
      targetProduct: { '@id': `${SITE_URL}/#software` },
    },
  ];
}
