from pathlib import Path
import re
import html
import json

from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    Table, TableStyle, Preformatted, KeepTogether, Flowable, CondPageBreak,
)
from reportlab.platypus.tableofcontents import TableOfContents

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / 'output' / 'pdf' / 'EventHub_Relatorio_Final.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)

for name, filename in [('Arial', 'arial.ttf'), ('Arial-Bold', 'arialbd.ttf'),
                       ('Arial-Italic', 'ariali.ttf'), ('Consolas', 'consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(Path('C:/Windows/Fonts') / filename)))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial-Italic', boldItalic='Arial-Bold')

from diagrams import diagram

PURPLE = colors.HexColor('#5147D8')
INK = colors.HexColor('#202639')
GRAY = colors.HexColor('#637083')
LIGHT = colors.HexColor('#F3F2FD')
LINE = colors.HexColor('#DFE3EE')
PAGE_W, PAGE_H = A4
LEFT, RIGHT = 53, 53
WIDTH = PAGE_W - LEFT - RIGHT

STYLES = {
    'body': ParagraphStyle('Body', fontName='Arial', fontSize=10.2, leading=14.7,
                           textColor=INK, spaceAfter=7.4, allowWidows=0, allowOrphans=0),
    'h1': ParagraphStyle('Section', fontName='Arial-Bold', fontSize=17.5, leading=22,
                         textColor=PURPLE, spaceBefore=22, spaceAfter=12, keepWithNext=True),
    'h2': ParagraphStyle('Subsection', fontName='Arial-Bold', fontSize=11.7, leading=16,
                         textColor=INK, spaceBefore=13, spaceAfter=6.5, keepWithNext=True),
    'table': ParagraphStyle('TableCell', fontName='Arial', fontSize=9, leading=12.3,
                            textColor=INK, spaceAfter=0),
    'thead': ParagraphStyle('TableHeader', fontName='Arial-Bold', fontSize=9, leading=12,
                            textColor=colors.white),
    'code': ParagraphStyle('Code', fontName='Consolas', fontSize=8.3, leading=11.3,
                           textColor=INK, backColor=colors.HexColor('#F5F6FA'),
                           borderPadding=10, spaceBefore=5, spaceAfter=11),
    'caption': ParagraphStyle('Caption', fontName='Arial-Bold', fontSize=9, leading=12,
                              textColor=GRAY, spaceBefore=5, spaceAfter=9, keepWithNext=True),
    'bullet': ParagraphStyle('Bullet', fontName='Arial', fontSize=10.2, leading=14.5,
                             textColor=INK, leftIndent=13, firstLineIndent=0, bulletIndent=1,
                             spaceAfter=4.5, allowWidows=0, allowOrphans=0),
    'note': ParagraphStyle('Note', fontName='Arial', fontSize=9.2, leading=13.6,
                           textColor=GRAY, spaceAfter=7),
}

def clean(s):
    return s.replace('\u2014', '-').replace('\u2013', '-').replace('\u2011', '-').replace('\u00a0', ' ')

def rich(s):
    s = html.escape(clean(s))
    s = re.sub(r'`([^`]+)`', r'<font name="Consolas" size="8.9">\1</font>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', s)
    return s

class Cover(Flowable):
    def __init__(self):
        Flowable.__init__(self)
        self.width, self.height = WIDTH, 640

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(LIGHT)
        c.roundRect(0, 564, 173, 47, 8, fill=1, stroke=0)
        logo = ROOT / 'frontend' / 'public' / 'figma' / 'eventhub-logo.png'
        if logo.exists():
            c.drawImage(str(logo), 12, 576, width=147, height=36.75, preserveAspectRatio=True, mask='auto')
        else:
            c.setFont('Arial-Bold', 24)
            c.setFillColor(PURPLE)
            c.drawString(14, 578, 'EventHub')
        c.setFillColor(PURPLE)
        c.rect(0, 514, 43, 4, stroke=0, fill=1)
        c.setFont('Arial-Bold', 11)
        c.drawString(0, 489, 'PROJETO ACADÊMICO | UECE')
        c.setFillColor(INK)
        c.setFont('Arial-Bold', 35)
        c.drawString(0, 428, 'Relatório Final')
        c.drawString(0, 384, 'do Projeto EventHub')
        p = Paragraph('Plataforma de gerenciamento de eventos acadêmicos e profissionais',
                      ParagraphStyle('CoverSubtitle', fontName='Arial', fontSize=17, leading=24, textColor=GRAY))
        p.wrapOn(c, 440, 80)
        p.drawOn(c, 0, 306)
        c.setStrokeColor(LINE)
        c.line(0, 275, WIDTH, 275)
        c.setFont('Arial-Bold', 10)
        c.setFillColor(INK)
        c.drawString(0, 248, 'ARQUITETURA')
        c.setFont('Arial', 11)
        c.drawString(0, 228, 'Microsserviços com comunicação síncrona e assíncrona')
        c.setFillColor(LIGHT)
        c.roundRect(0, 75, WIDTH, 121, 9, fill=1, stroke=0)
        c.setFillColor(PURPLE)
        c.setFont('Arial-Bold', 10.5)
        c.drawString(15, 173, 'NOTA DE ESCOPO')
        text = ('Este documento apresenta o cenário de entrega final solicitado, considerando concluído '
                'o escopo definido: cinco microsserviços implementados e três serviços adicionais modelados. '
                'Descreve a solução final sem atribuir resultados de testes, métricas de desempenho ou '
                'publicação pública que não estejam comprovados.')
        p = Paragraph(text, ParagraphStyle('CoverNote', fontName='Arial', fontSize=10, leading=14.5, textColor=INK))
        _, h = p.wrapOn(c, WIDTH - 30, 100)
        p.drawOn(c, 15, 155 - h)
        c.setFillColor(GRAY)
        c.setFont('Arial', 9)
        c.drawString(0, 32, 'Universidade Estadual do Ceará - UECE')
        c.drawString(0, 15, 'Relatório técnico | 2 de novembro de 2026')
        c.restoreState()

class ReportDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(str(filename), pagesize=A4, leftMargin=LEFT, rightMargin=RIGHT,
                         topMargin=57, bottomMargin=51,
                         title='Relatório Final do Projeto EventHub',
                         author='EventHub - Projeto acadêmico UECE',
                         subject='Arquitetura, funcionalidades, dados, execução e validação do EventHub')
        frame = Frame(LEFT, 51, WIDTH, PAGE_H - 108, leftPadding=0, rightPadding=0,
                      topPadding=0, bottomPadding=0, id='main')
        self.addPageTemplates(PageTemplate(id='report', frames=[frame], onPage=self.furniture))
        self.section_pages = []

    def beforeDocument(self):
        self.section_pages = []

    def furniture(self, c, doc):
        if doc.page == 1:
            return
        c.saveState()
        c.setStrokeColor(LINE)
        c.line(LEFT, PAGE_H - 36, PAGE_W - RIGHT, PAGE_H - 36)
        c.setFont('Arial-Bold', 8)
        c.setFillColor(PURPLE)
        c.drawString(LEFT, PAGE_H - 26, 'EVENTHUB')
        c.setFont('Arial', 8)
        c.setFillColor(GRAY)
        c.drawRightString(PAGE_W - RIGHT, PAGE_H - 26, 'Relatório final | Projeto acadêmico UECE')
        c.line(LEFT, 37, PAGE_W - RIGHT, 37)
        c.setFont('Arial', 7.8)
        c.drawString(LEFT, 24, 'Arquitetura, implementação e evolução')
        c.drawRightString(PAGE_W - RIGHT, 24, f'{doc.page:02d}')
        c.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == 'Section':
            text = flowable.getPlainText()
            key = 'section-' + str(len(self.section_pages) + 1)
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, 0, False)
            self.notify('TOCEntry', (0, text, self.page, key))
            self.section_pages.append({'title': text, 'page': self.page})

def make_table(lines):
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if all(re.match(r'^:?-+:?$', c.replace(' ', '')) for c in cells):
            continue
        rows.append(cells)
    n = len(rows[0])
    header = rows[0][0].lower()
    if n == 2:
        frac = 0.34
        if 'arquivo' in header or 'elemento' in header: frac = 0.37
        if 'banco' in header or 'regra' in header or 'estado' in header: frac = 0.25
        if 'adr' == header: frac = 0.14
        widths = [WIDTH * frac, WIDTH * (1-frac)]
    elif n == 3:
        widths = [WIDTH * x for x in ([0.12,0.45,0.43] if 'requisito' in header else [0.30,0.34,0.36])]
    else:
        widths = [WIDTH/n]*n
    data = [[Paragraph(rich(cell), STYLES['thead'] if i == 0 else STYLES['table'])
             for cell in row] for i, row in enumerate(rows)]
    table = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),PURPLE),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, colors.HexColor('#F7F8FC')]),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),8), ('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),7), ('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LINEBELOW',(0,0),(-1,0),0.5,PURPLE),
        ('LINEBELOW',(0,1),(-1,-1),0.35,LINE),
    ]))
    return [table, Spacer(1,10)]

CAPTIONS = {
    'architecture': 'Figura 1. Arquitetura de acesso, serviços e propriedade dos dados',
    'frontend': 'Figura 2. Organização dos módulos do frontend',
    'states': 'Figura 3. Estados e transições das inscrições',
    'er': 'Figura 4. Relacionamentos físicos locais dos bancos',
    'sequence': 'Figura 5. Sequência de inscrição paga e notificação',
}

def parse(md):
    lines = clean(md).splitlines()
    result = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith('```'):
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i].rstrip())
                i += 1
            # Plain preformatted text can split across pages without clipping.
            result.append(Preformatted('\n'.join(code), STYLES['code'], maxLineLength=94))
            i += 1
            continue
        if line.startswith('|'):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                table_lines.append(lines[i]); i += 1
            result.extend(make_table(table_lines))
            continue
        match = re.fullmatch(r'\[\[DIAGRAM:(\w+)\]\]', line)
        if match:
            kind = match.group(1)
            fig = diagram(kind, WIDTH)
            result.append(KeepTogether([Paragraph(CAPTIONS[kind], STYLES['caption']), fig, Spacer(1,11)]))
            i += 1
            continue
        if line.startswith('## '):
            result.append(Paragraph(rich(line[3:]), STYLES['h1'])); i += 1
            continue
        if line.startswith('### '):
            result.append(Paragraph(rich(line[4:]), STYLES['h2'])); i += 1
            continue
        bullet = re.match(r'^(?:[-*] |(\d+)[.)] )(.*)', line)
        if bullet:
            marker = bullet.group(1) + '.' if bullet.group(1) else '•'
            result.append(Paragraph(rich(bullet.group(2)), STYLES['bullet'], bulletText=marker))
            i += 1
            continue
        para = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{2,3} |\||```|\[\[|[-*] |\d+[.)] )', lines[i].strip()):
            para.append(lines[i].strip()); i += 1
        result.append(Paragraph(rich(' '.join(para)), STYLES['body']))
    return result

def main():
    doc = ReportDoc(OUT)
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle('TOC', fontName='Arial', fontSize=9.8, leading=13.2,
                                     textColor=INK, leftIndent=0, firstLineIndent=0,
                                     spaceBefore=2.5, spaceAfter=0)]
    toc.dotsMinLevel = 0
    content = (HERE / 'relatorio.md').read_text(encoding='utf-8')
    story = [Cover(), PageBreak(),
             Paragraph('Sumário', ParagraphStyle('ContentsTitle', fontName='Arial-Bold', fontSize=24,
                                                 leading=29, textColor=PURPLE, spaceAfter=20)),
             toc, PageBreak()]
    story.extend(parse(content))
    doc.multiBuild(story)
    (HERE/'sections.json').write_text(json.dumps(doc.section_pages, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'output':str(OUT), 'sections':len(doc.section_pages), 'bytes':OUT.stat().st_size}, ensure_ascii=False))

if __name__ == '__main__':
    main()
