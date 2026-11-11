from pathlib import Path
import hashlib
import json
import re
import subprocess
from html import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, Preformatted, Flowable
)
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import fitz
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
WORK = Path(__file__).resolve().parent
OUT = ROOT / "output/pdf/EventHub_Estado_Atual_2026-11-11.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
FONTDIR = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Body", str(FONTDIR / "segoeui.ttf")))
pdfmetrics.registerFont(TTFont("Body-Bold", str(FONTDIR / "segoeuib.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold")
pdfmetrics.registerFont(TTFont("Mono", str(FONTDIR / "consola.ttf")))

NAVY = colors.HexColor("#14213D")
PURPLE = colors.HexColor("#5A44D6")
TEAL = colors.HexColor("#087E8B")
INK = colors.HexColor("#25304A")
MUTED = colors.HexColor("#65718A")
PALE = colors.HexColor("#F3F1FC")
LIGHT = colors.HexColor("#F3F6FA")
LINE = colors.HexColor("#DFE4ED")
WHITE = colors.white
W, H = A4
CW = W - 88

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="BodyTextEH", fontName="Body", fontSize=9.2, leading=14,
                         textColor=INK, spaceAfter=8, allowWidows=0, allowOrphans=0))
styles.add(ParagraphStyle(name="SmallEH", parent=styles["BodyTextEH"], fontSize=8.1, leading=11.8,
                         textColor=MUTED, spaceAfter=5))
styles.add(ParagraphStyle(name="CellEH", parent=styles["BodyTextEH"], fontSize=8.1, leading=11.4,
                         spaceAfter=0))
styles.add(ParagraphStyle(name="CellHeadEH", parent=styles["CellEH"], fontName="Body-Bold",
                         textColor=WHITE))
styles.add(ParagraphStyle(name="H1EH", fontName="Body-Bold", fontSize=23, leading=28,
                         textColor=NAVY, spaceAfter=14, keepWithNext=True))
styles.add(ParagraphStyle(name="H2EH", fontName="Body-Bold", fontSize=12.5, leading=17,
                         textColor=PURPLE, spaceBefore=9, spaceAfter=7, keepWithNext=True))
styles.add(ParagraphStyle(name="EyebrowEH", fontName="Body-Bold", fontSize=8.5, leading=12,
                         textColor=PURPLE, spaceAfter=8))
styles.add(ParagraphStyle(name="CoverEH", fontName="Body-Bold", fontSize=36, leading=42,
                         textColor=NAVY, spaceAfter=16))
styles.add(ParagraphStyle(name="CoverSubEH", parent=styles["BodyTextEH"], fontSize=14, leading=21,
                         textColor=MUTED, spaceAfter=16))
styles.add(ParagraphStyle(name="CodeEH", fontName="Mono", fontSize=7.8, leading=11.6,
                         textColor=INK, spaceAfter=8))
styles.add(ParagraphStyle(name="RefEH", parent=styles["SmallEH"], fontSize=7.7, leading=11,
                         wordWrap="CJK", textColor=INK))

story = []
page_titles = []
source_files = set()

def p(text, style="BodyTextEH"):
    return Paragraph(text, styles[style])

def add(text, style="BodyTextEH"):
    story.append(p(text, style))

def h2(text):
    add(text, "H2EH")

def refs(ids):
    add("Evidências: " + "  ".join("[" + i + "]" for i in ids) + ". Consulte o catálogo ao final.", "SmallEH")

def bullet(text):
    t = Table([[p("-", "CellEH"), p(text)]], colWidths=[12, CW - 12])
    t.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"),
                           ("LEFTPADDING", (0,0), (-1,-1), 0),
                           ("RIGHTPADDING", (0,0), (-1,-1), 0),
                           ("TOPPADDING", (0,0), (-1,-1), 0),
                           ("BOTTOMPADDING", (0,0), (-1,-1), 0)]))
    story.append(t)

def note(title, text):
    t = Table([[p(title, "EyebrowEH")], [p(text)]], colWidths=[CW])
    t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), PALE),
                           ("BOX", (0,0), (-1,-1), .6, LINE),
                           ("LEFTPADDING", (0,0), (-1,-1), 12),
                           ("RIGHTPADDING", (0,0), (-1,-1), 12),
                           ("TOPPADDING", (0,0), (-1,0), 9),
                           ("BOTTOMPADDING", (0,0), (-1,0), 0),
                           ("TOPPADDING", (0,1), (-1,1), 0),
                           ("BOTTOMPADDING", (0,1), (-1,1), 4)]))
    story.append(t)
    story.append(Spacer(1, 10))

def table(headers, rows, widths):
    data = [[p(escape(x), "CellHeadEH") for x in headers]]
    for row in rows:
        data.append([p(x, "CellEH") for x in row])
    t = Table(data, colWidths=[CW * x for x in widths], repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LINEBELOW", (0,0), (-1,0), .7, NAVY),
    ]
    for n in range(1, len(data)):
        commands += [("BACKGROUND", (0,n), (-1,n), LIGHT if n % 2 else WHITE),
                     ("LINEBELOW", (0,n), (-1,n), .4, LINE)]
    t.setStyle(TableStyle(commands))
    story.append(t)
    story.append(Spacer(1, 8))

def section(number, title, subtitle=None):
    if story:
        story.append(PageBreak())
    page_titles.append(title)
    add("EVENTHUB  |  " + number, "EyebrowEH")
    add(title, "H1EH")
    if subtitle:
        add(subtitle, "SmallEH")

class Architecture(Flowable):
    def __init__(self):
        Flowable.__init__(self)
        self.width, self.height = CW, 174
    def draw(self):
        c = self.canv
        def box(x,y,w,h,text,fill=LIGHT):
            c.setFillColor(fill); c.setStrokeColor(LINE)
            c.roundRect(x,y,w,h,6,fill=1,stroke=1)
            c.setFillColor(INK); c.setFont("Body-Bold",8)
            c.drawCentredString(x+w/2,y+h/2-3,text)
        def arrow(x1,y1,x2,y2):
            c.setStrokeColor(PURPLE); c.setFillColor(PURPLE); c.setLineWidth(.8)
            c.line(x1,y1,x2,y2)
            path=c.beginPath();path.moveTo(x2,y2);path.lineTo(x2-3,y2+5);path.lineTo(x2+3,y2+5);path.close()
            c.drawPath(path,fill=1,stroke=0)
        box(0,136,145,30,"Navegador / React",PALE)
        box(182,136,145,30,"Nginx / Gateway",PALE)
        c.setStrokeColor(PURPLE);c.line(145,151,182,151)
        c.setFont("Body",7);c.setFillColor(MUTED);c.drawString(151,158,"HTTP")
        box(364,136,143,30,"APIs REST / JSON",PALE)
        c.line(327,151,364,151)
        labels=["Identity","Events","Registrations","Payments","Attendance","Certificates","Notifications","Reporting","Payment Provider"]
        for i,label in enumerate(labels):
            x=(i%3)*173; y=93-(i//3)*36
            box(x,y,161,27,label)
        c.setFont("Body",7.7); c.setFillColor(MUTED)
        c.drawString(0,4,"PostgreSQL: 9 bancos lógicos  |  RabbitMQ: eventos e processamento assíncrono")

class StateFlow(Flowable):
    def __init__(self):
        Flowable.__init__(self); self.width=CW; self.height=100
    def draw(self):
        c=self.canv
        items=[("CONFIRMED",0,60,TEAL),("PENDING_PAYMENT",173,60,PURPLE),("WAITLISTED",346,60,PURPLE),
               ("CANCELLED",86,12,MUTED),("EXPIRED",260,12,MUTED)]
        for text,x,y,color in items:
            c.setFillColor(LIGHT);c.setStrokeColor(LINE);c.roundRect(x,y,161,27,5,fill=1,stroke=1)
            c.setFillColor(color);c.setFont("Body-Bold",8.2);c.drawCentredString(x+80.5,y+10,text)
        c.setStrokeColor(PURPLE);c.line(173,74,161,74);c.line(346,74,334,74)
        c.line(254,60,254,44);c.line(167,44,340,44);c.line(167,44,167,39);c.line(340,44,340,39)

def header_footer(c, doc):
    c.saveState()
    c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(44,H-35,W-44,H-35)
    c.setFillColor(PURPLE);c.setFont("Body-Bold",8);c.drawString(44,H-24,"EVENTHUB")
    c.setFillColor(MUTED);c.setFont("Body",7.6);c.drawRightString(W-44,H-24,"Relatório do estado atual | 11/11/2026")
    c.line(44,36,W-44,36)
    c.setFont("Body",7.2);c.drawString(44,24,"Código, regras de produto e evidências com alcance explícito")
    c.drawRightString(W-44,24,f"{doc.page:02d}")
    c.restoreState()

# 01 - Capa e diagnóstico.
page_titles.append("Relatório do estado atual")
story.append(Spacer(1, 35))
add("PROJETO ACADÊMICO  |  11 DE NOVEMBRO DE 2026", "EyebrowEH")
add("EventHub<br/>Estado atual<br/>do projeto", "CoverEH")
add("Funcionalidades, arquitetura, regras de negócio e evidências de validação.", "CoverSubEH")
story.append(Spacer(1, 10))
table(["8 domínios", "9 bancos", "14 contêineres"],
      [["Serviços de negócio implementados, mais um provedor simulado.",
        "Bancos lógicos com propriedade por serviço, em uma instância PostgreSQL.",
        "Em execução e saudáveis na consulta local desta elaboração."]],
      [.333,.333,.334])
note("DIAGNÓSTICO", "O projeto possui implementação integrada de eventos, inscrições, pagamentos simulados, "
     "notificações, presença, certificados por atividade e indicadores. A instituição é a conta organizadora "
     "que cria e gerencia seus próprios eventos. Os testes integrados são executados em ambiente separado.")
add("Base da análise: código e arquivos do workspace, documentação operacional e registros de QA disponíveis. "
    "Referência Git: <b>ab70979</b>, com alterações locais preexistentes; o relatório descreve o workspace, "
    "não apenas o conteúdo desse commit.", "SmallEH")
add("Escopo desta emissão: criação deste relatório; nenhuma alteração na implementação, nas regras, "
    "nos dados da aplicação ou no ambiente de testes. Novas consultas realizadas: saúde e prontidão da "
    "aplicação local, inventário de contêineres e leitura das fontes.", "SmallEH")
add("Prontidão observada: /api/health e /api/status responderam HTTP 200; os oito serviços do agregador "
    "retornaram ready. Isso confirma disponibilidade básica, sem substituir os testes de negócio.", "SmallEH")

section("01", "Escopo e regras oficiais", "Decisões confirmadas pelo responsável nesta conversa prevalecem sobre a redação antiga.")
add("O EventHub é uma plataforma web para descoberta e administração de eventos acadêmicos e profissionais. "
    "Integra a experiência do participante ao cadastro institucional, programação, controle de vagas, pagamento "
    "simulado, comunicação, presença e comprovação de participação.")
table(["Regra atual", "Interpretação adotada neste relatório"], [
    ["Conta participante", "Consulta eventos, realiza inscrições e acompanha seus próprios registros e certificados."],
    ["Conta institucional", "A própria instituição se cadastra como organizadora, cria e gerencia seus eventos."],
    ["Perfis exclusivos", "PARTICIPANT e ORGANIZER são perfis distintos; a área de login deve corresponder ao perfil persistido."],
    ["Instituição fixa", "A conta organizadora possui uma instituição; seu contexto não é alterado por seleção de área ou edição de perfil."],
    ["Próprios eventos", "O servidor valida perfil, instituição e responsável do evento. O controle não depende apenas de botões na interface."],
    ["Certificado por atividade", "Pode ser emitido após a atividade terminar, com inscrição confirmada e presença válida correspondente."],
], [.28,.72])
h2("Fora do escopo funcional confirmado")
add("Convite, admissão e administração de uma equipe de contas organizadoras não são exigidos pelo modelo "
    "institucional atual. A capacidade técnica remanescente de múltiplos vínculos no esquema ou em fixtures "
    "não transforma equipe em funcionalidade obrigatória.")
h2("O que não é uma pendência")
add("Perfis separados, uma instituição por conta, gestão dos próprios eventos e certificado após a atividade "
    "são comportamentos corretos. Não devem ser classificados como falhas por divergirem do relatório antigo.")
refs(["R01","R02","R03","R04","R05"])

section("02", "Arquitetura e serviços", "Oito serviços de domínio, um simulador de provedor e infraestrutura compartilhada.")
story.append(Architecture())
story.append(Spacer(1,10))
table(["Serviço", "Responsabilidade", "Banco próprio"], [
    ["Identity", "Contas, autenticação, instituição e sessões.", "identity_db"],
    ["Events", "Eventos, programação, palestrantes e avisos.", "event_db"],
    ["Registrations", "Inventário, reservas, inscrições, espera e outbox.", "registration_db"],
    ["Payments", "Transações simuladas e reconciliação.", "payment_db"],
    ["Payment Provider", "Provedor HTTP simulado e idempotente.", "provider_db"],
    ["Attendance", "Check-in, presença e resolução de credenciais.", "attendance_db"],
    ["Certificates", "Emissão, modelos, verificação e PDF.", "certificate_db"],
    ["Notifications", "Entregas, tentativas, falhas e deduplicação.", "notification_db"],
    ["Reporting", "Projeções e indicadores para a instituição.", "reporting_db"],
], [.22,.53,.25])
add("Nginx publica o frontend e encaminha /api ao gateway. As chamadas internas utilizam HTTP entre serviços. "
    "RabbitMQ recebe eventos persistidos em outbox; Notifications e Reporting não participam da transação "
    "obrigatória de confirmação da inscrição.", "SmallEH")
add("A composição possui 14 contêineres: nove aplicações de serviço, gateway, frontend, Nginx, PostgreSQL e "
    "RabbitMQ. Os nove bancos são lógicos; não representam nove servidores físicos.", "SmallEH")
refs(["R06","R07","R08"])

section("03", "Tecnologias e organização")
table(["Camada", "Tecnologias declaradas nos arquivos atuais"], [
    ["Frontend", "React 19, TypeScript 5.9, Vite 7, React Router 7, Context API e CSS."],
    ["QR e navegação automatizada", "qrcode, @zxing/browser e Playwright/Chromium."],
    ["Backend Node.js", "Node 24, Express 5, pg, jose, express-rate-limit; Nodemailer no Identity."],
    ["Backend Python", "Python 3.13 nos contêineres, FastAPI, Uvicorn, Pydantic e Psycopg."],
    ["PDF e mensageria", "ReportLab/Pillow para certificados; Pika para RabbitMQ."],
    ["Infraestrutura", "Docker Compose, Nginx, PostgreSQL 17 e RabbitMQ 4."],
], [.29,.71])
h2("Estrutura principal")
tree = """eventhub/
  frontend/       páginas, componentes, autenticação, clientes HTTP e estilos
  gateway/        entrada de APIs, verificação, proxy e diagnóstico
  services/       oito domínios e payment-provider
  infra/          Nginx e provisionamento PostgreSQL
  scripts/        preparação, QA, auditoria, backup e promoção local
  tests/          testes unitários e integração
  docs/           regras, arquitetura, contratos e operação
  output/         relatórios e evidências visuais
  tmp/            ambientes auxiliares e registros locais"""
story.append(Preformatted(tree, styles["CodeEH"]))
add("No frontend, rotas ficam em App.tsx; sessão em auth/; telas em pages/; componentes compartilhados em "
    "components/; integrações em services/. Identity separa rotas, serviços, repositórios e segurança. "
    "Os serviços Python concentram regras de domínio em módulos próprios e validam contratos com Pydantic.")
add("O acesso a dados usa SQL parametrizado, sem ORM identificado nos serviços examinados. "
    "Cada aplicação possui manifesto de dependências e Dockerfile.", "SmallEH")
refs(["R06","R08","R09"])

section("04", "Identidade e conta institucional")
h2("Cadastro e acesso")
add("O participante informa nome, e-mail e senha; CPF e telefone pessoais são opcionais. O cadastro institucional "
    "inclui CNPJ, razão social, nome de uso, natureza e telefone. A criação de conta, instituição e vínculo inicial "
    "é transacional. Internamente, o sistema mantém usuário ORGANIZER, organizationId e ownerUserId, embora "
    "a experiência de produto seja a de uma conta institucional.")
table(["Proteção", "Comportamento atual"], [
    ["Senha", "Mínimo de oito caracteres; armazenamento com scrypt, salt aleatório e comparação apropriada."],
    ["Token", "JWT RS256, emissor/audiência definidos e duração de uma hora."],
    ["Área de entrada", "Login incompatível com o perfil retorna 403 account_area_mismatch, sem token."],
    ["Sessão", "Cache local com prazo absoluto, revalidação no Identity e sincronização entre abas."],
    ["Revogação", "Hash de token revogado e versão de credenciais no banco; mudanças de senha invalidam credenciais anteriores."],
    ["Autorização", "Recursos conferidos no servidor; campos ou IDs manipulados não concedem outro perfil ou instituição."],
], [.27,.73])
h2("Perfil, senha e recuperação")
add("Há edição de nome, CPF e telefone, troca autenticada de senha e redefinição por token aleatório de uso único. "
    "O token de recuperação tem hash persistido e validade de 30 minutos. A resposta pública é genérica. "
    "A interface encerra a sessão após troca autenticada de senha.")
add("Existe fluxo de troca de e-mail no backend com confirmação; o perfil pessoal atual apresenta e-mail como "
    "somente leitura. Não é descrito aqui como fluxo completo já disponível na interface.", "SmallEH")
refs(["R01","R02","R10","R11"])

section("05", "Eventos, atividades e catálogo")
h2("Gestão institucional")
add("A instituição cria o evento, define informações gerais, modalidade, local ou transmissão, período, "
    "palestrantes e atividades. Salva rascunho, revisa, publica e pode cancelar. As operações gerenciadas "
    "validam a instituição e a responsabilidade do evento no servidor.")
table(["Elemento", "Comportamento implementado"], [
    ["Evento", "Título, descrição, categoria, modalidade, período, local, transmissão e dados de apresentação."],
    ["Atividade", "Título, descrição, tipo, responsável/palestrante, datas, local e capacidade."],
    ["Preço", "Gratuidade ou valor em centavos; opções de lote, categoria e janela de venda."],
    ["Espera", "Pode ser habilitada por atividade. Lotação com espera desabilitada resulta em recusa."],
    ["Programação", "Datas de atividade validadas em relação ao evento; palestrante deve corresponder à programação."],
    ["Após publicação", "Capacidade, preço e programação ficam fixos; PUT completo só altera rascunhos."],
], [.25,.75])
h2("Atualizações e descoberta")
add("Informações públicas de evento publicado podem ser atualizadas por contrato específico, com avisos "
    "aos inscritos. Esse caminho não muda vagas, preço ou período das atividades.")
add("O catálogo exibe os eventos elegíveis, com busca por nome/instituição, filtros e paginação no cliente. "
    "As páginas de catálogo e detalhes exigem conta participante; a API de leitura de eventos e disponibilidade "
    "possui acesso público. A instituição usa uma rota própria de prévia gerenciada.")
add("Disponibilidade é consultada no servidor e atualizada periodicamente; o navegador não decide a "
    "ocupação. Paginação e filtros do catálogo no servidor permanecem uma evolução.", "SmallEH")
refs(["R03","R12","R13","R14"])

section("06", "Inscrições e controle de vagas")
add("A inscrição é por atividade. Registrations consulta os dados autorizados, seleciona o preço válido e "
    "decide a ocupação em transação. Chave idempotente, índice de inscrição ativa e lock do inventário "
    "evitam repetição da operação e concorrência sem controle.")
story.append(StateFlow())
table(["Situação", "Resultado"], [
    ["Gratuita com vaga", "Inscrição CONFIRMED diretamente."],
    ["Paga com vaga", "Reserva PENDING_PAYMENT com prazo de pagamento."],
    ["Lotação e espera habilitada", "WAITLISTED, sem ocupar vaga efetiva."],
    ["Lotação e espera desabilitada", "Recusa da solicitação; não é criada reserva excedente."],
    ["Cancelamento ou recusa", "Estado terminal; vaga pode promover o próximo da fila."],
    ["Prazo vencido", "EXPIRED; aprovação tardia não reabre a inscrição."],
], [.4,.6])
h2("Políticas atuais")
add("O TTL padrão é <b>900 segundos</b>, configurável. A espera é FIFO por data e ID; promoção gratuita confirma "
    "e promoção paga inicia novo prazo. Cancelamento de inscrição confirmada é permitido antes do início "
    "da atividade. Cancelamento do evento é conciliado nas inscrições com consistência eventual.")
add("A expiração usa thread própria e somente PostgreSQL, sem depender de Events ou RabbitMQ. "
    "Promoção de espera e publicação de mensagens ocorrem em outro ciclo. Constraints e revisão do "
    "inventário reforçam a proteção em diferentes níveis de isolamento do banco.", "SmallEH")
refs(["R04","R15"])

section("07", "Pagamentos e notificações")
h2("Pagamento acadêmico")
add("Payments e Payment Provider simulam aprovação, recusa e expiração. Não há captura de cartão, "
    "cobrança bancária ou liquidação financeira real. Formatos como PIX/cartão na interface pertencem "
    "à demonstração e são apresentados como simulados.")
table(["Etapa", "Tratamento"], [
    ["1. Reserva", "Registrations mantém a vaga paga em PENDING_PAYMENT."],
    ["2. Decisão", "Payments/provedor persistem a decisão com idempotência."],
    ["3. Aplicação", "Callback interno protegido confronta inscrição, decisão e prazo."],
    ["4. Confirmação", "Aprovação válida produz CONFIRMED; recusa/expiração liberam a reserva."],
    ["5. Recuperação", "Transação pendente é reconciliada após falha temporária de dependência."],
], [.26,.74])
h2("Comunicação assíncrona")
add("Inscrição e outbox são gravadas atomicamente. O publisher envia mensagens duráveis e confirmadas "
    "ao RabbitMQ. Notifications registra tentativas, deduplica mensagens concluídas e utiliza retry/fila de "
    "falhas. Events possui outbox própria para avisos de atualização e cancelamento.")
add("O modo padrão é mailbox local; há suporte configurável a SMTP. Falha na notificação não desfaz a "
    "inscrição. Como SMTP e banco não compartilham transação, uma falha após aceitação do e-mail pode "
    "permitir envio repetido. Não há promessa de entrega exatamente uma vez.")
note("ALCANCE DA EVIDÊNCIA", "Código SMTP existente não comprova recebimento externo. Os registros de "
     "inscrição durante falha e persistência de outbox não comprovam, isoladamente, drenagem integral "
     "das filas após a recuperação.")
refs(["R16","R17","R18"])

section("08", "Presença e certificados")
h2("Check-in")
add("Attendance registra presença única por inscrição. Valida autorização institucional, evento publicado, "
    "inscrição confirmada e atividade correspondente antes de responder ou gravar. Há check-in manual e "
    "resolução de credencial assinada; a interface lê QR pela câmera, por imagem ou conteúdo informado.")
add("A janela implementada vai do início da atividade até 24 horas após seu término. Repetir uma "
    "requisição autorizada retorna o registro existente; a unicidade no banco protege concorrência.")
h2("Certificado por atividade")
table(["Condição cumulativa", "Regra atual"], [
    ["Evento", "Deve permanecer publicado."],
    ["Inscrição", "Deve estar confirmada."],
    ["Conclusão", "A atividade correspondente deve ter terminado."],
    ["Presença", "IDs da inscrição, pessoa, evento e atividade devem corresponder."],
    ["Janela de check-in", "Registro dentro da janela de presença implementada."],
    ["Integridade", "Emissão única por inscrição, snapshot e hash; verificação de validade e acesso."],
], [.31,.69])
add("A emissão do participante é solicitada por POST. Há download em PDF, QR/código de verificação e "
    "consulta pública que evita expor CPF, telefone e e-mail. O término da atividade é o critério correto, "
    "mesmo quando o evento tem outras atividades ainda em andamento.")
add("Também há personalização de textos, cores, fundo e signatários; certificados de palestrantes têm "
    "automação específica. Imagens de assinatura são elementos visuais, não certificação ICP-Brasil.", "SmallEH")
refs(["R05","R19","R20"])

section("09", "Interface e APIs principais")
table(["Área / rota", "Uso atual"], [
    ["/ e /acesso", "Página de apresentação e escolha da área de acesso."],
    ["/participante/login e /participante/cadastro", "Entrada e cadastro de participante."],
    ["/organizacao/login e /organizacao/cadastro", "Entrada e cadastro institucional."],
    ["/recuperar-senha e /redefinir-senha", "Solicitação e aplicação da redefinição."],
    ["/eventos e /eventos/:id", "Catálogo e detalhes para participante autenticado."],
    ["/organizacao/eventos e /novo", "Listagem institucional e criação de evento."],
    ["/organizacao/eventos/:id/gestao", "Inscrições, atividades, presença e certificados."],
    ["/organizacao/painel", "Indicadores institucionais e por evento."],
    ["/eventos/:eventId/inscricao", "Checkout e seleção de atividades."],
    ["/pagamento/:id e /minhas-inscricoes", "Pagamento simulado e acompanhamento pessoal."],
    ["/perfil e /organizacao/perfil", "Dados da conta e da instituição."],
    ["/diagnostico", "Prontidão básica agregada dos serviços."],
], [.51,.49])
h2("Contratos expostos pelo gateway")
add("Sob /api: autenticação e perfil; GET/POST/PUT de eventos; publicação/cancelamento; disponibilidade; "
    "inscrições e cancelamento; pagamentos; presença; certificados e downloads; relatórios e CSV. "
    "Os contratos internos de callback e consulta de serviço não são publicados no gateway.")
add("Exemplos: POST /registrations com Idempotency-Key; POST /payments/:id; POST /attendance/check-ins; "
    "POST /certificates; GET /reports/events/:id. Listagens operacionais do organizador possuem paginação "
    "no servidor; busca por nome/e-mail nessa tela limita-se à página carregada.", "SmallEH")
refs(["R13","R14","R21"])

section("10", "Dados, indicadores e observabilidade")
h2("Propriedade e armazenamento")
add("Os serviços mantêm seus próprios bancos e usuários. Referências externas são identificadores lógicos, "
    "obtidos e verificados por APIs; não há chaves estrangeiras entre bancos de serviços. Eventos, atividades "
    "e palestrantes são armazenados no JSONB do evento. Inventário, inscrições, pagamentos, presença, "
    "certificados e projeções possuem estruturas próprias.")
add("Identity, Events, Registrations e Payments possuem migrações versionadas com verificações. "
    "Preflights recusam dados legados ambíguos; nenhuma instituição ou responsável deve ser inferido "
    "automaticamente para contornar conflito.")
h2("Relatórios institucionais")
table(["Indicador", "Interpretação"], [
    ["Inscrições", "Contagens por estado, atividade e dia; inscrições gratuitas e pagas."],
    ["Ocupação", "Confirmadas mais reservas vigentes; capacidade, vagas e anomalia explícita."],
    ["Presença", "Totais relacionados às inscrições e atividades do evento."],
    ["Receita simulada", "Preços de inscrições confirmadas; não representa dinheiro liquidado."],
    ["Transações", "Estados efetivos de Payments separados da decisão do provedor."],
    ["Falha financeira", "Fonte indisponível é sinalizada; não é convertida em falso zero."],
    ["Exportação", "CSV autorizado, com tratamento de valores que possam virar fórmulas."],
], [.28,.72])
h2("Rastreabilidade")
add("Request ID e correlation ID percorrem HTTP, snapshot, pagamento, outbox e consumidores. Logs "
    "estruturados e ferramenta de rastreamento ajudam a localizar a operação. Reporting reconcilia "
    "projeções por APIs; seus dados são eventualmente consistentes, sem transação global.")
refs(["R06","R07","R15","R18","R22"])

section("11", "Ambientes de aplicação e testes", "A separação informada pelo usuário é tratada explicitamente.")
table(["Ambiente", "Configuração documentada", "Finalidade"], [
    ["Aplicação local", "Compose eventhub; HTTP 8080.", "Uso e demonstração do sistema."],
    ["QA integrado", "Compose eventhub-rules-qa; HTTP 18080; arquivo de ambiente, chaves, credenciais e volumes próprios.", "Fixtures, concorrência, falhas, migrações e testes com APIs/bancos reais."],
    ["Unitário/domínio", "Node e Python dedicado, com dependências simuladas.", "Regras e fronteiras isoladas, sem depender de todos os serviços."],
    ["Interface interceptada", "Chromium/Playwright e respostas /api simuladas.", "Contratos enviados, navegação e comportamento visual."],
], [.24,.43,.33])
note("COMO LER OS RESULTADOS", "A ausência de uma execução de testes no ambiente da aplicação não "
     "significa ausência de testes. Os resultados pertencem ao ambiente e à revisão em que foram executados. "
     "Nesta emissão não foi iniciada nenhuma nova suíte, nem foram criadas fixtures ou interrompidos serviços.")
h2("Consulta local feita nesta elaboração")
add("A aplicação respondeu HTTP 200 em /api/health e /api/status. O agregador retornou ready para Identity, "
    "Events, Registrations, Payments, Notifications, Attendance, Certificates e Reporting. O inventário "
    "Docker local apresentou 14 contêineres em execução e saudáveis.")
add("O provedor simulado não aparece no agregador dos oito domínios, mas seu contêiner estava saudável. "
    "Esses dados comprovam prontidão básica; não são substitutos da suíte integrada de QA.")
add("O QA documentado utiliza TTL de reserva de 120 segundos; o padrão do produto é 900 segundos. "
    "O estado de execução do QA não foi alterado ou inferido a partir da saúde do ambiente local.", "SmallEH")
refs(["R08","R23","R24"])

section("12", "Resultados e alcance dos testes")
h2("Verificação isolada observada nesta conversa")
add("Durante a análise técnica anterior à geração deste documento, foram executados 41 testes isolados, "
    "com zero falhas. Não são uma execução no ambiente de uso da aplicação e não foram repetidos nesta emissão.")
table(["Suíte", "Aprovados", "Fronteira verificada"], [
    ["Identity", "8", "Perfil, área de login, instituição, JWT e sessão."],
    ["Events", "6", "Instituição, responsabilidade e dados públicos."],
    ["Attendance", "5", "Elegibilidade e autorização de presença."],
    ["Certificates", "10", "Conclusão de atividade, presença, IDs e integridade."],
    ["Reporting", "10", "Indicadores, indisponibilidade, autorização e CSV."],
    ["Notifications", "2", "Limites de tentativa e retry/ACK."],
    ["Total", "41", "Todos aprovados; dependências simuladas nas fronteiras."],
], [.27,.16,.57])
add("A análise anterior também executou TypeScript com --noEmit e --incremental false, com saída zero. "
    "Isso verifica tipos; não equivale a gerar o bundle de produção ou testar o navegador.")
h2("Interface automatizada")
add("A suíte atual de frontend possui 14 casos efetivos. As APIs são interceptadas; ela cobre recusa de "
    "área incorreta, revalidação da sessão, cache adulterado, indisponibilidade de identidade, instituição "
    "fixa, prévia, pagamento/gratuidade e indicadores. Não demonstra, isoladamente, persistência ou "
    "concorrência reais.")
add("A documentação registra build e execução aprovados dessa suíte em validações anteriores. "
    "Esses resultados são preservados como evidência histórica e não apresentados como nova execução.")
refs(["R25","R26","R27"])

section("13", "Evidências do QA separado", "Registros de 10 e 11 de novembro de 2026 encontrados no workspace.")
table(["Verificação", "Registro disponível", "Limite"], [
    ["Negócio HTTP", "8 PASS / 0 FAIL; 97,6 s; log presente.", "Sete cenários mais agrupador; APIs e persistência QA."],
    ["Migrações/legado", "4 PASS / 0 FAIL; 30,5 s; log presente.", "Três cenários mais agrupador; schemas QA descartáveis."],
    ["Recuperação de pagamento", "3 PASS / 0 FAIL; 11,57 s; log presente.", "Dois cenários mais agrupador; provedor e callbacks QA."],
    ["Isolamento de capacidade", "5 PASS documentados; fonte atual presente.", "Quatro cenários mais agrupador; resultado documentado."],
    ["UI com APIs reais", "7 verificações, 16 capturas, errors=[].", "Desktop/mobile no QA 18080; registro de 10/11."],
    ["Login por área, 11/11", "8 Identity, 14 UI e 4 testes integrados documentados; JSON QA presente.", "Ajuste específico; não é repetição de todas as integrações."],
    ["Backup local em clones QA", "Nove bancos restaurados; manifesto disponível.", "Restauração técnica e tabelas; não prova consistência global em atividade."],
], [.28,.36,.36])
add("O total de 73 aprovados na documentação de 10/11 é histórico e inclui agrupadores. Não são 73 testes "
    "integrados nem 73 cenários independentes. Não se somam os resultados de 11/11 a esse total como "
    "se fossem casos novos, pois há repetição/substituição de verificações.")
add("A evidência de login informa origem 18080, quatro capturas em 1440/390 px e ausência de erros "
    "JavaScript registrados. Os outros testes integrados anteriores não foram repetidos para esse ajuste.")
add("Fontes ou evidências antigas ausentes deste checkout não provam inexistência no ambiente de testes "
    "separado. A rastreabilidade da entrega deve associar revisão, ambiente, comando e resultado.", "SmallEH")
refs(["R18","R27","R28","R29"])

section("14", "Execução e operação")
h2("Preparação de ambiente novo")
add("A configuração atual exige credenciais para nove bancos, RabbitMQ, JWT, chave interna e chave do "
    "provedor simulado. O roteiro abaixo descreve os arquivos disponíveis; não foi executado para esta emissão.")
commands = """# Em um ambiente novo, preparar .env a partir do exemplo.
node scripts/init-backend-config.mjs
node scripts/init-identity-keys.mjs
node scripts/init-internal-key.mjs
docker compose up --build -d --wait --wait-timeout 600
docker compose ps
# Consultar http://127.0.0.1:8080/api/status"""
story.append(Preformatted(commands, styles["CodeEH"]))
add("Os scripts preservam valores já preenchidos. Uma instalação com volume existente pode exigir "
    "provisionamento dos novos bancos e revisão do plano de migração; alterar .env não muda automaticamente "
    "senhas de usuários PostgreSQL já criados. A preparação de QA é própria, via init-rules-qa.mjs.")
h2("Persistência e recuperação")
add("Volumes preservam PostgreSQL e RabbitMQ. O runbook documenta diagnóstico, backup, restauração, "
    "migrações e reversão. Registros históricos mostram promoção de imagens validadas em QA ao stack local; "
    "a revisão binária completa não foi novamente comparada nesta elaboração.")
add("Backups sequenciais dos bancos requerem estratégia para consistência entre serviços e mensagens. "
    "O registro de restauração técnica não substitui conferência de linhas, invariantes, papéis e filas.")
h2("Limites operacionais")
add("A publicação configurada é 127.0.0.1:8080. Não foi comprovado destino remoto, túnel público ou "
    "operação de alta disponibilidade. Alguns GETs de domínio executam manutenção/reconciliação; por "
    "isso as novas consultas desta emissão ficaram restritas a saúde e prontidão.")
refs(["R08","R23","R24","R30"])

section("15", "Limitações e próximos passos")
table(["Situação atual", "Encaminhamento recomendado"], [
    ["Pagamentos e receitas simulados", "Manter identificação acadêmica; integração financeira real depende de escopo posterior."],
    ["SMTP configurável, entrega externa não demonstrada", "Validar envio/recebimento e recuperação completa quando esse modo for utilizado."],
    ["Carga e alta disponibilidade não comprovadas", "Definir base, recursos e critérios antes de ensaio; o alvo 20x da documentação não foi medido."],
    ["Consistência eventual de projeções e comunicação", "Observar backlog, falhas e recuperação; não prometer atomicidade entre serviços."],
    ["Listagens públicas/pessoais com paginação no cliente", "Avaliar paginação e filtros no servidor conforme volume real."],
    ["Terminologia antiga de equipes e certificados", "Atualizar documentação para conta institucional e certificado por atividade; não alterar regras corretas."],
    ["Roteiros e evidências em revisões diferentes", "Consolidar comandos, referências e resultados associados à versão de entrega e ao QA."],
    ["ADRs/README citados no documento antigo", "Revisar documentação entregue; ausência local não é prova de ausência de testes externos."],
], [.46,.54])
h2("Ajustes de apresentação e entrega")
add("A homepage contém nota 4.9 e 1.400+ avaliações sem fonte identificada no código. Esses números "
    "devem ter evidência ou identificação demonstrativa. Há textos antigos que ainda descrevem gestão de "
    "equipe. A organização de dependências e artefatos rastreados em tmp também merece revisão.")
note("DIAGNÓSTICO FINAL", "O estado atual é de um protótipo acadêmico integrado, com os oito domínios "
     "implementados, testes documentados em QA separado e ambiente local pronto na consulta realizada. "
     "As regras institucionais e a certificação por atividade estão aceitas. O próximo foco é consolidar "
     "documentação, evidências e validações operacionais ainda não demonstradas.")
refs(["R18","R23","R27","R31"])

references = [
 ("R01","Regra de produto","Confirmações do usuário nesta conversa, em 11/11/2026: instituição é a conta organizadora; perfis exclusivos; instituição fixa; equipe fora do escopo; certificado por atividade."),
 ("R02","Identidade","services/identity/src/users/service.js:48-109; users/repository.js:9-25. Cadastro, login, área, perfil e senha."),
 ("R03","Eventos e autorização","services/events/app/domain.py:38-49, 51-163, 211-273. Instituição, responsabilidade, atividades e transições."),
 ("R04","Inscrição e estados","services/registrations/app/domain.py:44-55, 126-142, 184-255, 417-450, 507-538."),
 ("R05","Certificação por atividade","services/certificates/app/domain.py:61-88, 143-240. Elegibilidade, emissão, verificação e download."),
 ("R06","Desenho arquitetural","docs/architecture/business-capabilities.md:3-21. Parte da terminologia de equipes é anterior à confirmação atual do produto."),
 ("R07","Propriedade dos bancos","infra/db/01-init.sh:17-25. Nove bancos lógicos e usuários por serviço."),
 ("R08","Composição e prontidão","compose.yaml; gateway/src/routes/health.js:3-19; frontend/src/pages/EnvironmentPage.tsx:23-48. Consulta desta emissão: 14 contêineres saudáveis e HTTP 200/ready."),
 ("R09","Manifests e builds","frontend/package.json; gateway/package.json; services/identity/package.json; services/payments/package.json; requirements.txt e Dockerfile dos serviços."),
 ("R10","Segurança e sessões","services/identity/src/security/passwords.js:5-19; tokens.js:9-35; sessions.js:7-18."),
 ("R11","Recuperação e frontend de sessão","services/identity/src/routes/recovery.js:13-53; frontend/src/auth/session.ts:19-42; AuthContext.tsx:41-80; PasswordSection.tsx:20."),
 ("R12","Atualização pública","services/events/app/announcements.py:47-82; frontend/src/components/events/PublicEventInformation.tsx."),
 ("R13","Rotas de interface","frontend/src/App.tsx:26-55; páginas de catálogo, editor, checkout, inscrições, dashboards e perfis."),
 ("R14","Rotas de API","gateway/src/routes/business.js:35-71; gateway/src/routes/identity.js."),
 ("R15","Integridade de vagas","services/registrations/app/migrations/001_registration_integrity.sql e 002_capacity_isolation.sql; domain.py:126-142, 519-538."),
 ("R16","Pagamento simulado","services/payments/src/payments.js:24-130; provider.js:3-22; services/payment-provider/src/app.js:35-54."),
 ("R17","Consumo e entrega","services/notifications/app/consumer.py:32-77; delivery.py:59-75, 123-150."),
 ("R18","Registro de implementação e limites","docs/validation/implementation-summary.md:60-115. Resultados históricos, revisão de login, limites de SMTP, backup, carga e produção remota."),
 ("R19","Presença","services/attendance/app/domain.py:65-100, 117-146; frontend/src/components/events/QrCheckInDialog.tsx."),
 ("R20","PDF, modelos e palestrantes","services/certificates/app/pdf.py:36-107; templates.py:20-145; speakers.py:44-95."),
 ("R21","Fluxos de interface","frontend/src/pages/registrations/CheckoutPage.tsx:180-220; MyRegistrationsPage.tsx:161-176; events/OrganizerEventPage.tsx:54-76."),
 ("R22","Indicadores","services/reporting/app/domain.py:43-55, 175-291; frontend/src/pages/organization/DashboardPage.tsx."),
 ("R23","Operação e QA","docs/deployment/business-rules-runbook.md:42-77; scripts/init-rules-qa.mjs:1-21."),
 ("R24","Configuração atual","scripts/init-backend-config.mjs; init-identity-keys.mjs; init-internal-key.mjs; .env.example. Valores secretos não foram consultados ou reproduzidos."),
 ("R25","Testes isolados atuais","tests/unit/identity-access.test.mjs; tests/unit/test_event_access.py; services/{attendance,certificates,reporting,notifications}/test/test_rules.py. Execução anterior nesta conversa: 41 PASS."),
 ("R26","Testes de interface","frontend/tests/README.md; frontend/tests/access-flows.test.mjs:44-49, 96-248. Quatorze casos com interceptação de APIs."),
 ("R27","Resumo histórico de validação","docs/validation/domain-rules-results.md:3-23; docs/validation/implementation-summary.md:64-102. O total histórico de 73 inclui agrupadores."),
 ("R28","Logs integrados disponíveis","tmp/rules-qa/integration-results.log; access-migrations-results.log; payment-recovery-results.log. Evidências de execuções anteriores no QA."),
 ("R29","Evidências de navegação","output/visual-audit/2026-11-10/live/verification.json; output/visual-audit/2026-11-11/login-area/verification.json. Origem QA 18080."),
 ("R30","Backup e implantação local","scripts/backup-local-verified.mjs; promote-local-validated.mjs; verify-local-deployment.mjs; manifesto de backup e registros referidos no runbook. Não executados nesta emissão."),
 ("R31","Apresentação e escopo documental","frontend/src/pages/HomePage.tsx:11; components/auth/TermsDialog.tsx:8-12; docs/requirements-matrix.md. Revisão de terminologia necessária.")
]

section("16", "Catálogo de evidências", "Caminhos relativos à raiz eventhub; linhas são da revisão inspecionada.")
add("As referências identificam a origem das afirmações. Código inspecionado, teste isolado, registro "
    "histórico e consulta de prontidão têm alcances diferentes. Este documento não converte um deles "
    "em comprovação irrestrita dos demais.", "SmallEH")
for rid,title,desc in references[:16]:
    story.append(p(f'<b>[{rid}] {escape(title)}</b><br/>{escape(desc)}', "RefEH"))
    story.append(Spacer(1,6))

section("17", "Catálogo de evidências", "Continuação.")
for rid,title,desc in references[16:]:
    story.append(p(f'<b>[{rid}] {escape(title)}</b><br/>{escape(desc)}', "RefEH"))
    story.append(Spacer(1,6))
story.append(Spacer(1,12))
note("PRESERVAÇÃO", "O relatório antigo e a implementação foram preservados. Esta emissão cria um novo "
     "documento de estado atual e seus auxiliares de renderização. Não foram realizadas correções "
     "automáticas, migrações, novos testes integrados ou alterações de dados.")

doc = SimpleDocTemplate(
    str(OUT), pagesize=A4, rightMargin=44, leftMargin=44, topMargin=54, bottomMargin=49,
    title="EventHub - Relatório do Estado Atual - 11/11/2026",
    author="EventHub | Relatório técnico",
    subject="Estado atual do código, regras institucionais e evidências de QA separado",
    pageCompression=1,
)
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)

# Verificação automática e renderização do artefato recém-criado.
pdf = fitz.open(OUT)
qa = {"pages":len(pdf), "expected_pages":len(page_titles), "page_titles":page_titles,
      "out_of_bounds":[], "empty_pages":[], "text_characters":0, "file_bytes":OUT.stat().st_size}
for n,page in enumerate(pdf):
    text=page.get_text()
    qa["text_characters"] += len(text)
    if len(text.strip())<100:
        qa["empty_pages"].append(n+1)
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for ln in b["lines"]:
            for span in ln["spans"]:
                x0,y0,x1,y1=span["bbox"]
                if x0<0 or y0<0 or x1>W+1 or y1>H+1:
                    qa["out_of_bounds"].append({"page":n+1,"text":span["text"],"bbox":span["bbox"]})
    pix=page.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
    pix.save(WORK/f"page-{n+1:02d}.png")
    if n==0:
        qa["first_page_excerpt"]=text[:500]
for start in range(0,len(pdf),6):
    thumbs=[]
    for n in range(start,min(start+6,len(pdf))):
        im=Image.open(WORK/f"page-{n+1:02d}.png").convert("RGB")
        im.thumbnail((300,425))
        tile=Image.new("RGB",(320,453),"#e7eaf0")
        tile.paste(im,((320-im.width)//2,8))
        ImageDraw.Draw(tile).text((12,434),f"Pagina {n+1}",fill="#25304a")
        thumbs.append(tile)
    sheet=Image.new("RGB",(960,906),"#e7eaf0")
    for k,im in enumerate(thumbs):
        sheet.paste(im,((k%3)*320,(k//3)*453))
    sheet.save(WORK/f"contact-{start//6+1}.png")
qa["sha256"]=hashlib.sha256(OUT.read_bytes()).hexdigest()
(WORK/"qa.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(qa,ensure_ascii=False,indent=2))
if qa["out_of_bounds"] or qa["empty_pages"] or qa["pages"] != qa["expected_pages"]:
    raise SystemExit("PDF QA requires review")
