# Archived v1 generator: never overwrite reviewed film-reference artwork.
from pathlib import Path as _LegacyPath
import json as _legacy_json
_legacy_manifest = _LegacyPath(__file__).parent / 'manifest.json'
if _legacy_manifest.exists() and _legacy_json.loads(_legacy_manifest.read_text()).get('styleVersion') == 'film-reference-v2':
    raise SystemExit('v1 art generator is archived. Keep the reviewed PNGs and run scripts/integrate-reference-art.mjs instead.')

from pathlib import Path
import json
P=Path(__file__).parent
m=json.loads((P/'manifest.json').read_text())
for loc in ['cove','hangar','hotel','market','post','lighthouse','sea','kitchen','garden','ferry','dock']:
 source='cover-generated.png' if loc=='cove' else 'bg-hotel.png' if loc=='dock' else f'bg-{loc}.png'
 if (P/source).exists(): m['backgrounds'][loc]='assets/'+source;m['backgrounds'][loc+'-day']='assets/'+source
 for v in ['night','rain']:
  source=f'bg-{loc}-{v}.png' if (P/f'bg-{loc}-{v}.png').exists() else f'bg-{loc}-{v}.svg'
  m['backgrounds'][loc+'-'+v]='assets/'+source
for id,cg in m['cgs'].items():
 if (P/f'cg-{id}.png').exists():cg['src']=f'assets/cg-{id}.png';cg['placeholder']=False
(P/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
print(len(m['backgrounds']),'background entries,',len(m['portraits']),'portraits,',len(m['cgs']),'CGs; generated:',sum(not c['placeholder'] for c in m['cgs'].values()))
