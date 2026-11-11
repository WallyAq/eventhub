from pathlib import Path
import json,re,unicodedata,hashlib
import fitz
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[3]
WORK=Path(__file__).resolve().parent
PDF=WORK/"compiled/main.pdf"
d=fitz.open(PDF)
qa={"pages":len(d),"out_of_page_text":[],"placeholder_pages":[],"sparse_pages":[],
    "images":0,"page_summaries":[],"file_bytes":PDF.stat().st_size}
full=[]
for i,page in enumerate(d):
    t=unicodedata.normalize("NFKC",page.get_text());full.append(t)
    qa["images"]+=len(page.get_images())
    if "ADICIONAR IMAGEM" in t:qa["placeholder_pages"].append(i+1)
    if len(t.strip())<100:qa["sparse_pages"].append(i+1)
    qa["page_summaries"].append({"page":i+1,"characters":len(t),"first_lines":t.splitlines()[:4]})
    for b in page.get_text("dict")["blocks"]:
        if b.get("type")!=0:continue
        for line in b["lines"]:
            for s in line["spans"]:
                x0,y0,x1,y1=s["bbox"]
                if x0<0 or y0<0 or x1>page.rect.width+1 or y1>page.rect.height+1:
                    qa["out_of_page_text"].append({"page":i+1,"text":s["text"],"bbox":s["bbox"]})
    page.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False).save(WORK/f"render-{i+1:02d}.png")
for start in range(0,len(d),6):
    sheet=Image.new("RGB",(960,906),"#e8ebf1")
    for k,i in enumerate(range(start,min(start+6,len(d)))):
        im=Image.open(WORK/f"render-{i+1:02d}.png").convert("RGB");im.thumbnail((300,425))
        x=(k%3)*320;y=(k//3)*453
        sheet.paste(im,(x+(320-im.width)//2,y+8))
        ImageDraw.Draw(sheet).text((x+12,y+434),f"Pagina {i+1}",fill="#25304a")
    sheet.save(WORK/f"contact-{start//6+1}.png")
log=(WORK/"compiled/main.log").read_text(encoding="utf-8",errors="replace")
qa["overfull"]=re.findall(r"Overfull.*",log)
qa["undefined"]=re.findall(r"undefined.*",log)
qa["sha256"]=hashlib.sha256(PDF.read_bytes()).hexdigest()
qa["text_characters"]=sum(len(t) for t in full)
(WORK/"qa.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({k:v for k,v in qa.items() if k!="page_summaries"},ensure_ascii=False,indent=2))
if qa["out_of_page_text"] or qa["placeholder_pages"] or qa["sparse_pages"] or qa["overfull"]:
    raise SystemExit("Review required")
