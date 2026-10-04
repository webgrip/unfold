var REG_NONE = NewRegistrar('none');
var CF_REDIRECTS = NewDnsProvider('cloudflare_redirects', { manage_single_redirects: true });

D(
  'unfoldhq.dev',
  REG_NONE,
  DnsProvider(CF_REDIRECTS),
  DefaultTTL(1),
  IGNORE('@', 'A,AAAA,CNAME'),
  IGNORE('www', 'A,AAAA,CNAME'),

  AAAA('staging', '100::', CF_PROXY_ON),

  MX('@', 0, '.'),
  TXT('@', 'v=spf1 -all'),
  TXT('_dmarc', 'v=DMARC1; p=reject'),

  CF_SINGLE_REDIRECT(
    'www-to-apex',
    301,
    'http.host eq "www.unfoldhq.dev"',
    'concat("https://unfoldhq.dev", http.request.uri.path)',
  ),
);
