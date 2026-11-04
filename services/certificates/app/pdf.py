"""Real PDF artifact with a machine-readable verification QR code."""
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether


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
    heading = ParagraphStyle("heading", fontName=heading_font, fontSize=25, leading=32,
                             alignment=TA_CENTER, textColor=colors.HexColor("#4f46e5"))
    body = ParagraphStyle("body", fontName=font, fontSize=13, leading=21, alignment=TA_CENTER)
    small = ParagraphStyle("small", fontName=font, fontSize=8, leading=12, alignment=TA_CENTER,
                           wordWrap="CJK")
    e = lambda field: escape(str(certificate[field]))
    duration = duration_label(certificate.get("durationMinutes", certificate["hours"] * 60))
    url = e("verificationUrl")
    qr = QrCodeWidget(certificate["verificationUrl"])
    bounds = qr.getBounds()
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    drawing = Drawing(90, 90, transform=[90 / width, 0, 0, 90 / height, 0, 0])
    drawing.add(qr)
    drawing.hAlign = "CENTER"
    story = [Paragraph("CERTIFICADO DE PARTICIPAÇÃO", heading), Spacer(1, 24),
             Paragraph("Certificamos que <b>" + e("participantName") + "</b> participou da atividade <b>" +
                       e("activityTitle") + "</b>, vinculada ao evento <b>" + e("eventTitle") +
                       "</b>, com carga horária de <b>" + duration + "</b>.", body),
             Spacer(1, 12), Paragraph(e("organizationName"), body),
             Paragraph("Período: " + date_label(certificate["startsAt"]) + " a " + date_label(certificate["endsAt"]), small),
             Paragraph("Emitido em: " + date_label(certificate["issuedAt"]) + " — horário de Fortaleza (UTC-3)", small), Spacer(1, 16),
             KeepTogether([drawing, Paragraph('Validação: <link href="' + url + '">' + url + "</link>", small),
                           Paragraph("Número: " + e("id"), small),
                           Paragraph("SHA-256 do registro: " + e("hash"), small)]),
             Spacer(1, 8), Paragraph("Documento gerado a partir da inscrição confirmada e do registro de presença. "
                                     "A validade atual deve ser consultada pelo QR Code. Este documento não possui assinatura digital ICP-Brasil.", small)]
    document.build(story)
    return output.getvalue()
