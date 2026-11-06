"""Real loopback SMTP protocol test; no messages leave this process/machine."""
import email
from email.header import decode_header, make_header
import socketserver
import threading
import unittest
from uuid import uuid4
from app.delivery import Delivery


class LocalSMTP(socketserver.StreamRequestHandler):
    messages = []
    def handle(self):
        self.wfile.write(b'220 localhost QA SMTP\r\n')
        while True:
            line = self.rfile.readline(32768)
            if not line: return
            command = line.split(b' ', 1)[0].strip().upper()
            if command in (b'EHLO', b'HELO', b'MAIL', b'RSET'):
                self.wfile.write(b'250 localhost\r\n')
            elif command == b'RCPT':
                self.wfile.write(b'250 accepted\r\n' if b'@example.test' in line else b'550 QA recipients only\r\n')
            elif command == b'DATA':
                self.wfile.write(b'354 End with dot\r\n'); content = []
                while True:
                    part = self.rfile.readline(32768)
                    if part in (b'.\r\n', b''): break
                    content.append(part)
                self.messages.append(email.message_from_bytes(b''.join(content)))
                self.wfile.write(b'250 stored in test memory\r\n')
            elif command == b'QUIT': self.wfile.write(b'221 bye\r\n'); return
            else: self.wfile.write(b'502 not implemented\r\n')


class SMTPProtocolTests(unittest.TestCase):
    def test_actual_smtp_socket_accepts_utf8_subject_body_and_stable_message_id(self):
        LocalSMTP.messages = []
        with socketserver.ThreadingTCPServer(('127.0.0.1', 0), LocalSMTP) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            try:
                sender = Delivery({'MAIL_MODE': 'smtp', 'SMTP_HOST': '127.0.0.1', 'SMTP_PORT': str(server.server_address[1]),
                                   'MAIL_FROM': 'qa-sender@example.test', 'SMTP_STARTTLS': 'false'})
                identifier = str(uuid4())
                sender.send({'id': identifier, 'to': 'qa-recipient@example.test', 'subject': 'Pagamento recusado — demonstração', 'text': 'Simulação acadêmica: R$ 12,34; nenhuma cobrança real.'})
                self.assertEqual(len(LocalSMTP.messages), 1)
                message = LocalSMTP.messages[0]
                self.assertEqual(message['Message-ID'], '<' + identifier + '@eventhub.local>')
                self.assertEqual(str(make_header(decode_header(message['Subject']))), 'Pagamento recusado — demonstração')
                self.assertIn('Simulação acadêmica', message.get_payload(decode=True).decode(message.get_content_charset()))
                self.assertEqual(message['To'], 'qa-recipient@example.test')
            finally:
                server.shutdown(); thread.join(timeout=3)


if __name__ == '__main__': unittest.main()
