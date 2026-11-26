"""Render contact proofs with correct alpha; never modifies source artwork."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'.cache/art-review';OUT.mkdir(parents=True,exist_ok=True)
EXPRESSIONS=['neutral','smile','serious','sad','surprise','tired']
for who,outfit in [('fio','work'),('fio','date'),('fio','flight'),('gina','morning'),('gina','date'),('gina','stage'),('porco','work')]:
 board=Image.new('RGB',(1440,900),'#eee6d3');draw=ImageDraw.Draw(board)
 for i,expression in enumerate(EXPRESSIONS):
  p=ROOT/'assets'/f'portrait-{who}-{outfit}-{expression}.png'
  if not p.exists():continue
  image=Image.open(p).convert('RGBA');image.thumbnail((225,800))
  board.paste(image,(i*240+8,70),image)
  draw.text((i*240+12,30),f'{who} / {outfit} / {expression}',fill='#173840')
 board.save(OUT/f'{who}-{outfit}.jpg',quality=95)
# This is an asset proof, not a character-height diagram or browser screenshot.
board=Image.new('RGB',(1500,1000),'#eee6d3');draw=ImageDraw.Draw(board)
for i,(name,label)in enumerate([('fio-work','FIO'),('gina-morning','GINA'),('porco-work','PORCO')]):
 p=ROOT/'assets'/f'portrait-{name}-neutral.png'
 image=Image.open(p).convert('RGBA');image.thumbnail((470,900))
 board.paste(image,(i*500+15,80),image);draw.text((i*500+20,30),label,fill='#173840')
board.save(OUT/'portraits-v2.jpg',quality=95)
print('Art review contact proofs written to .cache/art-review (no source image changes).')
