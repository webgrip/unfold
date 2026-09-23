import re
from pathlib import Path

import yaml

root = Path(__file__).resolve().parent.parent
models = ['docs/domain/model.yaml', 'apps/ploeg/docs/domain/model.yaml']
styles = root / '.build/vale/styles'
NAMED_CONTEXTS = {'System', 'Tooling'}


def vocabulary(terms):
    """Return the glossary terms Vale.Terms should hold to their exact spelling.

    Single common words such as Run or Team are left out: their lowercase English use is correct.
    Multi-word terms, internally capitalised names and system or tooling names are kept.
    """
    kept = set()
    for term in terms:
        name = str(term['name'])
        if ' ' in name or '-' in name or re.search(r'.[A-Z]', name) or term.get('context') in NAMED_CONTEXTS:
            kept.add(name)
    return sorted(kept, key=str.lower)


def substitutions(model_list):
    """Return {discouraged: preferred} from multi-word retired terms and `avoid` entries.

    Single words such as ticket or execution stay legitimate English and bounded-context names, so they are not flagged.
    """
    swap = {}
    for model in model_list:
        for retired in model.get('retired_terms', []) or []:
            swap[str(retired['name']).lower()] = str(retired['use'][0])
        for term in model.get('terms', []) or []:
            for word in term.get('avoid', []) or []:
                swap[str(word).lower()] = str(term['name'])
    return {bad: good for bad, good in sorted(swap.items()) if ' ' in bad and '(' not in bad}


def rule(swap):
    lines = [
        'extends: substitution',
        'message: "Glide glossary: use \'%s\' instead of \'%s\'."',
        'link: docs/reference/glossary.md',
        'level: warning',
        'ignorecase: true',
        'swap:',
    ]
    lines += [f'  {yaml.safe_dump(bad, default_style=chr(34)).strip()}: {yaml.safe_dump(good, default_style=chr(34)).strip()}' for bad, good in swap.items()]
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    loaded = [yaml.safe_load((root / path).read_text()) for path in models]
    accept = styles / 'config/vocabularies/Glide/accept.txt'
    accept.parent.mkdir(parents=True, exist_ok=True)
    accept.write_text('\n'.join(vocabulary([term for model in loaded for term in model.get('terms', []) or []])) + '\n')
    terms = styles / 'Glide/Terms.yml'
    terms.parent.mkdir(parents=True, exist_ok=True)
    terms.write_text(rule(substitutions(loaded)))
    print(f'Glide Vale vocabulary: {accept.relative_to(root)} and {terms.relative_to(root)}')
