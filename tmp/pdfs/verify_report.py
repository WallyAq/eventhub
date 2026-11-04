from pathlib import Path
import re
import json
import unicodedata
from pypdf import PdfReader
import pymupdf
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
PDF = HERE.parent.parent/'output/pdf/EventHub_Relatorio_Final.pdf'
reader = PdfReader(PDF)
text = '\n'.join(page.extract_text() or '' for page in reader.pages)
(HERE/'extracted.txt').write_text(text, encoding='utf-8')

def normalize(s):
    s = unicodedata.normalize('NFKC', s)
    s = s.replace('\u2014','-').replace('\u2013','-').replace('\u2011','-')
    return re.sub(r'\s+', '', s).replace('`','').replace('**','')

whole = normalize(text)
missing = []
checked = 0
for line in (HERE/'relatorio.md').read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if not line or line.startswith('```') or line.startswith('[[DIAGRAM:'):
        continue
    if line.startswith('|'):
        items = [s.strip() for s in line.strip('|').split('|')]
        if all(re.match(r'^:?-+:?$', s.replace(' ','')) for s in items):
            continue
    else:
        items = [re.sub(r'^(?:#{2,3} |[-*] |\d+[.)] )','',line)]
    for item in items:
        checked += 1
        if normalize(item) not in whole:
            missing.append(item)

doc = pymupdf.open(PDF)
render = HERE/'rendered'
render.mkdir(exist_ok=True)
bad_bounds = []
pages = []
for i, page in enumerate(doc):
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                x0,y0,x1,y1 = span['bbox']
                if x0 < -1 or y0 < -1 or x1 > page.rect.width+1 or y1 > page.rect.height+1:
                    bad_bounds.append({'page':i+1,'text':span['text'],'bbox':span['bbox']})
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1.5,1.5), alpha=False)
    path = render/f'page-{i+1:02}.png'
    pix.save(path)
    pages.append(path)

font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)
for batch in range((len(pages)+15)//16):
    subset = pages[batch*16:(batch+1)*16]
    cw,ch = 260,390
    sheet = Image.new('RGB',(cw*4,ch*((len(subset)+3)//4)), '#E5E7EB')
    draw = ImageDraw.Draw(sheet)
    for j,path in enumerate(subset):
        im = Image.open(path)
        im.thumbnail((cw-16,ch-32))
        x = (j%4)*cw+(cw-im.width)//2
        y = (j//4)*ch+8
        sheet.paste(im,(x,y))
        draw.text(((j%4)*cw+10,(j//4)*ch+ch-24),f'Página {batch*16+j+1}',font=font,fill='#303647')
    sheet.save(HERE/f'contact-{batch+1}.png')

result = {'pages':len(reader.pages),'checked_content_items':checked,
          'missing_content':missing,'out_of_page_text':bad_bounds,
          'sections':json.loads((HERE/'sections.json').read_text(encoding='utf-8')),
          'file_bytes':PDF.stat().st_size}
(HERE/'qa.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='sections'},ensure_ascii=False))
