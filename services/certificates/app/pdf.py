"""Real PDF artifact with a machine-readable verification QR code."""
from datetime import datetime, timedelta, timezone
import base64
import re
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepInFrame, Image, Table, TableStyle


def date_label(value):
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        raise ValueError("Certificate dates must include a timezone")
    return stamp.astimezone(timezone(timedelta(hours=-3))).strftime("%d/%m/%Y às %H:%M")


def duration_label(minutes):
    seconds = max(0, round(float(minutes) * 60))
    hours, remaining = divmod(seconds, 3600)
    minutes, seconds = divmod(remaining, 60)
    parts = [f"{value} {unit}" for value, unit in ((hours, "h"), (minutes, "min"), (seconds, "s")) if value]
    return " ".join(parts) or "menos de 1 s"


def render(certificate):
    normal = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    bold = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    font, heading_font = "Helvetica", "Helvetica-Bold"
    if normal.exists() and bold.exists():
        if "EventHub" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("EventHub", str(normal)))
            pdfmetrics.registerFont(TTFont("EventHub-Bold", str(bold)))
            pdfmetrics.registerFontFamily("EventHub", normal="EventHub", bold="EventHub-Bold",
                                           italic="EventHub", boldItalic="EventHub-Bold")
        font, heading_font = "EventHub", "EventHub-Bold"
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=52, leftMargin=52,
                                 topMargin=34, bottomMargin=30, title="Certificado EventHub",
                                 author="EventHub")
    template = certificate.get("certificateTemplate", {})
    speaker = certificate.get("certificateKind") == "SPEAKER"
    heading = ParagraphStyle("heading", fontName=heading_font, fontSize=22, leading=28,
                             alignment=TA_CENTER, textColor=colors.HexColor(template.get("accentColor", "#4f46e5")))
    body = ParagraphStyle("body", fontName=font, fontSize=12, leading=18, alignment=TA_CENTER)
    small = ParagraphStyle("small", fontName=font, fontSize=8, leading=12, alignment=TA_CENTER,
                           wordWrap="CJK")
    e = lambda field: escape(str(certificate[field]))
    duration = duration_label(certificate.get("durationMinutes", certificate["hours"] * 60))
    url = e("verificationUrl")
    qr = QrCodeWidget(certificate["verificationUrl"])
    bounds = qr.getBounds()
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    drawing = Drawing(76, 76, transform=[76 / width, 0, 0, 76 / height, 0, 0])
    drawing.add(qr)
    drawing.hAlign = "CENTER"
    default_body = "Certificamos que {{name}} " + ("atuou como palestrante/ministrante na" if speaker else "participou da") + " atividade {{activity}}, vinculada ao evento {{event}}, com carga horária de {{hours}}."
    values = {"name": certificate["participantName"], "activity": certificate["activityTitle"],
              "event": certificate["eventTitle"], "hours": duration, "organization": certificate["organizationName"]}
    content = re.sub(r"\{\{(.*?)\}\}", lambda match: "<b>" + escape(str(values.get(match[1], ""))) + "</b>",
                     escape(template.get("speakerBody" if speaker else "body", default_body)))
    title = template.get("speakerTitle" if speaker else "title", "CERTIFICADO DE PALESTRANTE" if speaker else "CERTIFICADO DE PARTICIPAÇÃO")
    story = [Paragraph(escape(title), heading), Spacer(1, 16),
             Paragraph(content, body),
             Spacer(1, 12), Paragraph(e("organizationName"), body),
             Paragraph("Período: " + date_label(certificate["startsAt"]) + " a " + date_label(certificate["endsAt"]), small),
             Paragraph("Emitido em: " + date_label(certificate["issuedAt"]) + " - horário de Fortaleza (UTC-3)", small)]
    signatories = []
    for person in template.get("signatories", []):
        cell = []
        if person.get("image"):
            image = Image(BytesIO(base64.b64decode(person["image"].split(",", 1)[1])))
            image._restrictSize(150, 36)
            image.hAlign = "CENTER"
            cell.append(image)
        cell += [Paragraph(escape(person["name"]), small), Paragraph(escape(person["role"]), small)]
        signatories.append(cell)
    if signatories:
        table = Table([signatories], colWidths=[document.width / len(signatories)] * len(signatories))
        table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
        story += [Spacer(1, 8), table]
    story += [Spacer(1, 12),
             drawing, Paragraph('Validação: <link href="' + url + '">' + url + "</link>", small),
                           Paragraph("Número: " + e("id"), small),
                           Paragraph("SHA-256 do registro: " + e("hash"), small),
             Spacer(1, 8), Paragraph(("Documento de atuação como palestrante/ministrante em atividade encerrada. " if speaker else "Documento gerado a partir da inscrição confirmada e do registro de presença. ") +
                                     "A validade atual deve ser consultada pelo QR Code. Este documento não possui assinatura digital ICP-Brasil.", small)]
    def background(canvas, doc):
        canvas.saveState()
        if template.get("background"):
            canvas.setFillAlpha(0.15)
            canvas.drawImage(ImageReader(BytesIO(base64.b64decode(template["background"].split(",", 1)[1]))), 0, 0,
                             width=landscape(A4)[0], height=landscape(A4)[1], mask="auto")
        canvas.restoreState()
    document.build([KeepInFrame(document.width - 12, document.height - 12, story, mode="shrink")],
                   onFirstPage=background, onLaterPages=background)
    return output.getvalue()
