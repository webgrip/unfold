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

  CF_SINGLE_REDIRECT(
    'www-to-apex',
    301,
    'http.host eq "www.unfoldhq.dev"',
    'concat("https://unfoldhq.dev", http.request.uri.path)',
  ),
);
