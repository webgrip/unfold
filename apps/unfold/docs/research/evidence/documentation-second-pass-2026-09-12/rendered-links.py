import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote,urlsplit
site=Path('/tmp/ploeg-vloer-second-pass.rwW0Ip/site').resolve()
class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.ids=set()
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if 'id' in attrs: self.ids.add(attrs['id'])
        if tag=='a' and 'href' in attrs: self.links.append(attrs['href'])
        if tag=='img' and 'src' in attrs: self.links.append(attrs['src'])
pages={}
for file in site.rglob('*.html'):
    if file.name=='explorer.html': continue
    parser=Links();parser.feed(file.read_text());pages[file.resolve()]=parser
count=0; problems=[]
for file,parser in pages.items():
    for href in parser.links:
        parts=urlsplit(href)
        if parts.scheme or parts.netloc or parts.path.startswith('/'):continue
        path=(file.parent/unquote(parts.path)).resolve() if parts.path else file
        if path.is_dir():path=path/'index.html'
        if not path.is_relative_to(site): continue
        count+=1
        if not path.exists():problems.append([str(file.relative_to(site)),href,'missing file'])
        elif parts.fragment and path in pages and unquote(parts.fragment) not in pages[path].ids:problems.append([str(file.relative_to(site)),href,'missing anchor'])
print(json.dumps({'htmlPages':len(pages),'checked':count,'problems':problems},indent=2))
raise SystemExit(bool(problems))
