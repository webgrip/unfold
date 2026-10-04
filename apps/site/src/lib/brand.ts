export type BrandToken =
  | 'ink'
  | 'paper'
  | 'ground-dark'
  | 'muted'
  | 'muted-light'
  | 'accent'
  | 'accent-deep'
  | 'accent-night'
  | 'on-accent'
  | 'surface';

export function brandToken(css: string, token: BrandToken): string {
  const match = css.match(new RegExp(`--brand-${token}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`brand.css does not declare --brand-${token}`);
  return match[1].trim();
}

export function brandFontUrls(css: string): string[] {
  return [...css.matchAll(/url\(['"]?([^'")]+\.woff2)['"]?\)/g)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}
