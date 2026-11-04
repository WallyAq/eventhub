"""Native vector diagrams for the EventHub final report.

This module is deliberately independent of application source code.
The report builder registers Arial, Arial-Bold and Consolas before rendering.
"""

from math import atan2, cos, sin, pi

from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Flowable


PURPLE = colors.HexColor("#5147D8")
INK = colors.HexColor("#26314B")
MUTED = colors.HexColor("#667087")
LIGHT = colors.HexColor("#F2F0FF")
LINE = colors.HexColor("#D9D6EF")
GREEN = colors.HexColor("#E9F6EF")
AMBER = colors.HexColor("#FFF4DC")
GREY = colors.HexColor("#F3F5F9")
WHITE = colors.white


class EventHubDiagram(Flowable):
    def __init__(self, kind, width):
        Flowable.__init__(self)
        self.kind = kind
        self.width = width
        self.height = {
            "architecture": 602,
            "frontend": 390,
            "states": 610,
            "er": 572,
            "sequence": 636,
        }[kind]

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        getattr(self, "_" + self.kind)()

    def text(self, x, y, label, size=9, bold=False, color=INK, align="left"):
        c = self.canv
        c.setFillColor(color)
        c.setFont("Arial-Bold" if bold else "Arial", size)
        if align == "center":
            c.drawCentredString(x, y, label)
        elif align == "right":
            c.drawRightString(x, y, label)
        else:
            c.drawString(x, y, label)

    def lines(self, x, y, label, width, size=9, leading=12, bold=False,
              color=INK, align="left"):
        font = "Arial-Bold" if bold else "Arial"
        result = []
        for paragraph in label.split("\n"):
            words = paragraph.split()
            line = ""
            for word in words:
                proposed = (line + " " + word).strip()
                if line and stringWidth(proposed, font, size) > width:
                    result.append(line)
                    line = word
                else:
                    line = proposed
            result.append(line)
        for index, value in enumerate(result):
            self.text(x, y - index * leading, value, size, bold, color, align)
        return len(result) * leading

    def box(self, x, y, w, h, label="", fill=LIGHT, border=LINE, size=9,
            bold=False, radius=7, color=INK):
        c = self.canv
        c.setFillColor(fill)
        c.setStrokeColor(border)
        c.setLineWidth(0.8)
        c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
        if label:
            explicit = label.split("\n")
            leading = size + 3
            baseline = y + h / 2 + (len(explicit) - 1) * leading / 2 - size * .35
            for line in explicit:
                self.text(x + w / 2, baseline, line, size, bold, color, "center")
                baseline -= leading

    def arrow(self, points, color=PURPLE, dashed=False, head=True, width=1):
        c = self.canv
        c.setStrokeColor(color)
        c.setFillColor(color)
        c.setLineWidth(width)
        c.setDash(3, 2) if dashed else c.setDash()
        path = c.beginPath()
        path.moveTo(*points[0])
        for point in points[1:]:
            path.lineTo(*point)
        c.drawPath(path)
        c.setDash()
        if head and len(points) > 1:
            x, y = points[-1]
            px, py = points[-2]
            angle = atan2(y - py, x - px)
            a = 4.5
            p = c.beginPath()
            p.moveTo(x, y)
            p.lineTo(x - a * cos(angle - pi / 7), y - a * sin(angle - pi / 7))
            p.lineTo(x - a * cos(angle + pi / 7), y - a * sin(angle + pi / 7))
            p.close()
            c.drawPath(p, fill=1, stroke=0)

    def badge(self, x, y, value):
        c = self.canv
        c.setFillColor(WHITE)
        c.setStrokeColor(PURPLE)
        c.setLineWidth(.8)
        c.circle(x, y, 7.3, fill=1, stroke=1)
        self.text(x, y - 2.5, str(value), 7.3, True, PURPLE, "center")

    def _architecture(self):
        w = self.width
        center = w / 2
        self.box(center - 78, 560, 156, 29, "Usuário", bold=True)
        self.box(center - 78, 509, 156, 29, "Cloudflare Tunnel")
        self.box(center - 78, 458, 156, 29, "Nginx", bold=True)
        self.arrow([(center, 560), (center, 538)])
        self.arrow([(center, 509), (center, 487)])
        fw, gw = 151, 151
        fx, gx = 20, w - 171
        self.box(fx, 397, fw, 35, "Frontend React", bold=True)
        self.box(gx, 397, gw, 35, "API Gateway", bold=True)
        self.arrow([(center - 38, 458), (center - 38, 445), (fx + fw / 2, 445), (fx + fw / 2, 432)])
        self.arrow([(center + 38, 458), (center + 38, 445), (gx + gw / 2, 445), (gx + gw / 2, 432)])
        self.text(fx + fw / 2, 448, "/", 7.8, color=MUTED, align="center")
        self.text(gx + gw / 2, 448, "/api", 7.8, color=MUTED, align="center")
        self.arrow([(fx + fw, 414), (gx, 414)])
        self.text(center, 422, "REST / JSON", 7.7, color=MUTED, align="center")

        margin, gap = 6, 8
        cardw = (w - 2 * margin - 4 * gap) / 5
        xs = [margin + index * (cardw + gap) for index in range(5)]
        cy, ch = 267, 99
        # External API traffic goes to the four exposed domain services.
        junction_y = 382
        self.arrow([(gx + gw / 2, 397), (gx + gw / 2, junction_y)], head=False)
        self.arrow([(xs[0] + cardw / 2, junction_y), (gx + gw / 2, junction_y)], head=False)
        for index in range(4):
            cx = xs[index] + cardw / 2
            self.arrow([(cx, junction_y), (cx, cy + ch)])
        names = ["Identity", "Event", "Registration", "Payment", "Notification"]
        stacks = ["Node.js", "FastAPI", "FastAPI", "Node.js", "FastAPI"]
        dbs = ["identity_db", "event_db", "registration_db", "payment_db", "notification_db"]
        for index, (name, stack, db) in enumerate(zip(names, stacks, dbs)):
            x = xs[index]
            self.box(x, cy, cardw, ch, fill=WHITE)
            self.text(x + cardw / 2, cy + 80, name, 8.5, True, align="center")
            self.text(x + cardw / 2, cy + 66, "Service", 7.8, color=MUTED, align="center")
            self.text(x + cardw / 2, cy + 51, stack, 7.6, color=MUTED, align="center")
            self.arrow([(x + cardw / 2, cy + 44), (x + cardw / 2, cy + 34)], width=.7)
            self.box(x + 4, cy + 8, cardw - 8, 24, db, fill=LIGHT, size=6.8, radius=4)

        r_center = xs[2] + cardw / 2
        n_center = xs[4] + cardw / 2
        self.box(center - 56, 195, 112, 34, "RabbitMQ", fill=AMBER, bold=True)
        self.arrow([(r_center, cy), (r_center, 247), (center, 247), (center, 229)])
        self.arrow([(center + 56, 212), (n_center, 212), (n_center, cy)])
        self.text(center - 68, 239, "Outbox", 8, color=MUTED)
        self.text(n_center - 2, 237, "consumo", 7.7, color=MUTED, align="right")

        self.box(6, 121, w - 12, 57, fill=GREY)
        self.text(17, 162, "HTTP interno direto", 8.8, True)
        self.lines(17, 147,
                   "Event consulta Identity; Registration consulta Identity e Event.\n"
                   "Payment consulta Identity e Registration para aplicar o resultado.",
                   w - 34, 8.1, 12)
        self.box(6, 67, w - 12, 40, fill=LIGHT)
        self.text(center, 91, "Uma instância PostgreSQL, cinco bancos lógicos", 8.8, True, align="center")
        self.text(center, 77, "Credenciais próprias; sem SQL entre serviços.", 8.1, color=MUTED, align="center")
        self.box(6, 7, w - 12, 46, fill=WHITE)
        self.text(17, 37, "Domínios modelados para evolução", 8.8, True)
        self.text(17, 21, "Attendance  |  Certificate  |  Reporting", 9, color=PURPLE)

    def _frontend(self):
        w = self.width
        center = w / 2
        self.box(center - 90, 345, 180, 32, "main.tsx", bold=True)
        self.box(center - 90, 289, 180, 32, "App.tsx e rotas", bold=True)
        self.box(center - 90, 233, 180, 32, "AuthProvider", bold=True)
        self.arrow([(center, 345), (center, 321)])
        self.arrow([(center, 289), (center, 265)])
        gap, margin = 12, 6
        cw = (w - 2 * margin - 3 * gap) / 4
        xs = [margin + index * (cw + gap) for index in range(4)]
        self.arrow([(center, 233), (center, 215)], head=False)
        self.arrow([(xs[0] + cw / 2, 215), (xs[-1] + cw / 2, 215)], head=False)
        labels = ["Login e\ncadastro", "Perfis e\norganizações", "Catálogo e\ngestão de eventos", "Inscrições e\npagamento"]
        for x, label in zip(xs, labels):
            self.arrow([(x + cw / 2, 215), (x + cw / 2, 196)])
            self.box(x, 146, cw, 50, label, size=8.5)
            self.arrow([(x + cw / 2, 146), (x + cw / 2, 125)], head=False)
        self.arrow([(xs[0] + cw / 2, 125), (xs[-1] + cw / 2, 125)], head=False)
        self.arrow([(center, 125), (center, 105)])
        self.box(center - 120, 71, 240, 34, "Clientes HTTP e tipos de contrato", bold=True)
        self.arrow([(center, 71), (center, 47)])
        self.box(center - 90, 15, 180, 32, "APIs do Gateway", fill=WHITE, bold=True)

    def _states(self):
        w = self.width
        # Numbered edges keep the states readable. The full transition legend
        # below the graph is part of the diagram, not a substitute for an edge.
        scale = w / 475
        c = self.canv
        c.saveState()
        c.scale(scale, 1)
        c.setFillColor(PURPLE)
        c.circle(237.5, 582, 5, fill=1, stroke=0)
        self.box(8, 482, 143, 42, "CONFIRMED", fill=GREEN, size=9.5, bold=True)
        self.box(167, 379, 143, 42, "PENDING_PAYMENT", fill=AMBER, size=8.6, bold=True)
        self.box(326, 482, 143, 42, "WAITLISTED", size=9.5, bold=True)
        self.box(75, 275, 143, 42, "CANCELLED", fill=GREY, size=9.5, bold=True)
        self.box(280, 275, 143, 42, "EXPIRED", fill=GREY, size=9.5, bold=True)
        # Direct entry paths.
        self.arrow([(237.5, 577), (237.5, 555), (79.5, 555), (79.5, 524)])
        self.badge(110, 555, 1)
        self.arrow([(237.5, 577), (237.5, 421)])
        self.badge(237.5, 461, 2)
        self.arrow([(237.5, 577), (237.5, 555), (397.5, 555), (397.5, 524)])
        self.badge(366, 555, 3)
        # Promotion and payment transitions.
        self.arrow([(326, 503), (315, 503), (315, 538), (160, 538), (160, 503), (151, 503)])
        self.badge(238, 538, 4)
        self.arrow([(397.5, 482), (397.5, 451), (288, 451), (288, 421)])
        self.badge(350, 451, 5)
        self.arrow([(167, 400), (79.5, 400), (79.5, 482)])
        self.badge(79.5, 445, 6)
        self.arrow([(310, 400), (351.5, 400), (351.5, 317)])
        self.badge(351.5, 355, 7)
        self.arrow([(238.5, 379), (238.5, 345), (180, 345), (180, 317)])
        self.badge(213, 345, 8)
        self.arrow([(8, 503), (2, 503), (2, 296), (75, 296)])
        self.badge(40, 296, 9)
        self.arrow([(469, 503), (474, 503), (474, 252), (146.5, 252), (146.5, 275)])
        self.badge(440, 252, 10)
        # Both terminal states end the registration lifecycle.
        for x in (146.5, 351.5):
            self.arrow([(x, 275), (x, 230)])
            c.setFillColor(WHITE)
            c.setStrokeColor(PURPLE)
            c.circle(x, 222, 6.5, fill=1, stroke=1)
            c.setFillColor(PURPLE)
            c.circle(x, 222, 3.5, fill=1, stroke=0)
        c.restoreState()
        self.text(8, 192, "Transições", 10, True)
        legends = [
            (1, "Gratuita com vaga"), (2, "Paga com vaga"),
            (3, "Sem vaga"), (4, "Promoção em atividade gratuita"),
            (5, "Promoção em atividade paga"), (6, "Aprovação dentro do prazo"),
            (7, "Prazo vencido"), (8, "Recusa ou cancelamento"),
            (9, "Cancelamento de inscrição confirmada"), (10, "Cancelamento na lista de espera"),
        ]
        for index, (number, label) in enumerate(legends):
            col = index // 5
            row = index % 5
            x = 16 + col * (w / 2)
            y = 168 - row * 27
            self.badge(x, y, number)
            self.lines(x + 13, y - 2.5, label, w / 2 - 42, 8.3, 10.5)
        self.text(8, 20, "Ocupam vaga: CONFIRMED e PENDING_PAYMENT.", 8.2, True, color=PURPLE)
        self.text(8, 6, "WAITLISTED, CANCELLED e EXPIRED não ocupam vaga.", 8.2, color=MUTED)

    def entity(self, x, y, w, title, fields):
        rowh, header = 12, 25
        h = header + len(fields) * rowh + 8
        self.box(x, y, w, h, fill=WHITE, radius=5)
        c = self.canv
        c.setFillColor(LIGHT)
        c.roundRect(x + .5, y + h - header, w - 1, header - .5, 4.5, fill=1, stroke=0)
        self.text(x + 9, y + h - 16, title, 8.6, True, color=PURPLE)
        c.setFont("Consolas", 7.8)
        c.setFillColor(INK)
        for index, field in enumerate(fields):
            c.drawString(x + 9, y + h - header - 13 - index * rowh, field)
        return h

    def _er(self):
        w = self.width
        gap, margin = 28, 8
        ew = (w - 2 * margin - gap) / 2
        left, right = margin, margin + ew + gap
        self.text(8, 556, "IDENTITY_DB", 10, True, color=PURPLE)
        self.text(w - 8, 556, "PK = chave primária  |  FK = chave estrangeira  |  UK = única", 6.8, color=MUTED, align="right")
        users = ["uuid id PK", "string name", "string email UK", "string password_hash", "string role", "string cpf", "string phone", "boolean marketing_opt_in", "datetime terms_accepted_at", "datetime created_at", "datetime updated_at"]
        orgs = ["uuid id PK", "string name", "string description", "string cnpj UK", "string legal_name", "string entity_type", "string phone", "string email", "datetime created_at", "datetime updated_at"]
        self.entity(left, 367, ew, "USERS", users)
        self.entity(right, 379, ew, "ORGANIZATIONS", orgs)
        self.entity(left, 250, ew, "PASSWORD_RESETS", ["string token_hash PK", "uuid user_id FK", "datetime expires_at"])
        self.entity(right, 238, ew, "ORGANIZATION_MEMBERS", ["uuid organization_id PK FK", "uuid user_id PK FK", "string role", "datetime created_at"])
        self.arrow([(left + ew / 2, 367), (left + ew / 2, 319)])
        self.text(left + ew / 2 + 5, 346, "1 solicita N", 7.8, color=MUTED)
        self.arrow([(right + ew / 2, 379), (right + ew / 2, 319)])
        self.text(right + ew / 2 + 5, 346, "1 possui N", 7.8, color=MUTED)
        middle = left + ew + gap / 2
        self.arrow([(left + ew, 391), (middle, 391), (middle, 278), (right, 278)])
        self.text(middle - 6, 338, "1", 8, True, color=PURPLE, align="right")
        self.text(middle + 4, 285, "N", 8, True, color=PURPLE)
        self.text(8, 217, "REGISTRATION_DB", 10, True, color=PURPLE)
        self.entity(left, 90, ew, "INVENTORIES", ["uuid activity_id PK", "uuid event_id", "int capacity"])
        self.entity(right, 20, ew, "REGISTRATIONS", ["uuid id PK", "uuid activity_id FK", "uuid user_id", "string request_key", "string status", "int price_cents", "datetime expires_at", "json snapshot", "datetime created_at"])
        self.arrow([(left + ew, 125), (right, 125)])
        self.text(middle, 139, "1 : N", 7.3, True, color=PURPLE, align="center")
        self.text(8, 3, "Somente relacionamentos físicos locais; demais vínculos por APIs e eventos.", 8, color=MUTED)

    def _sequence(self):
        w = self.width
        phases = [
            ("1. Inscrição e reserva", [
                ("Participante", "Frontend", "Solicitar inscrição"),
                ("Frontend", "Gateway", "POST /registrations"),
                ("Gateway", "Registration", "Encaminhar solicitação"),
                ("Registration", "Event", "Consultar evento e atividade"),
                ("Event", "Registration", "Retornar capacidade, preço e programação"),
                ("Registration", "Registration", "Reservar vaga sob transação"),
                ("Registration", "Frontend", "Retornar PENDING_PAYMENT e prazo"),
            ]),
            ("2. Pagamento e conciliação", [
                ("Participante", "Frontend", "Aprovar a simulação"),
                ("Frontend", "Gateway", "POST /payments/:id"),
                ("Gateway", "Payment", "Encaminhar decisão"),
                ("Payment", "Payment", "Persistir a decisão em PENDING"),
                ("Payment", "Registration", "Aplicar o resultado do pagamento"),
                ("Registration", "Registration", "Validar prazo, confirmar e registrar outbox"),
                ("Registration", "Payment", "Retornar CONFIRMED"),
                ("Payment", "Payment", "Registrar APPROVED"),
                ("Payment", "Frontend", "Apresentar o resultado"),
            ]),
            ("3. Notificação assíncrona", [
                ("Registration", "RabbitMQ", "Publicar o evento da outbox"),
                ("RabbitMQ", "Notification", "Entregar a mensagem"),
                ("Notification", "Notification", "Deduplicar e registrar a entrega simulada"),
            ]),
        ]
        y = 628
        number = 0
        for heading, rows in phases:
            self.box(0, y - 25, w, 25, fill=LIGHT, radius=5)
            self.text(10, y - 16.5, heading, 9.4, True, color=PURPLE)
            y -= 33
            for source, target, description in rows:
                number += 1
                h = 23
                self.box(0, y - h, w, h, fill=WHITE, border=LINE, radius=3)
                self.badge(13, y - h / 2, number)
                self.text(27, y - 16, source, 7.9, True)
                self.arrow([(100, y - 12.5), (115, y - 12.5)], width=.75)
                self.text(121, y - 16, target, 7.9, True)
                self.lines(212, y - 11, description, w - 222, 8.1, 10)
                y -= h + 2
            y -= 8
        self.text(0, 5, "A notificação ocorre após a confirmação e não bloqueia o resultado da inscrição.", 8.1, color=MUTED)


def diagram(kind, width):
    """Return a page-ready vector Flowable for the requested report diagram."""
    return EventHubDiagram(kind, width)
