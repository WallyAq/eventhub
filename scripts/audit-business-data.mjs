// Read-only diagnostic across service-owned databases. Does not migrate or repair.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const option = (key, fallback) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
const project = option('--project', 'eventhub'), env = option('--env-file', '.env');
const output = option('--output', 'tmp/rules-data-audit.json');
if (!/^[a-z0-9][a-z0-9_-]*$/.test(project)) throw new Error('Invalid compose project');
function query(database, sql) {
  const result = execFileSync('docker', ['compose', '-p', project, '--env-file', env, 'exec', '-T', 'postgres',
    'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'eventhub_admin', '-d', database, '-c',
    `BEGIN READ ONLY; SELECT coalesce(json_agg(a),'[]'::json) FROM (${sql}) a; COMMIT;`], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(result.trim());
}
const users = query('identity_db', `SELECT u.id,u.role,coalesce(array_agg(m.organization_id) FILTER(WHERE m.organization_id IS NOT NULL),'{}') AS organizations
  FROM users u LEFT JOIN organization_members m ON m.user_id=u.id GROUP BY u.id,u.role`);
const events = query('event_db', `SELECT id,organization_id,payload->>'ownerUserId' AS owner_id,payload->>'organizationId' AS payload_organization_id FROM events`);
const registrations = query('registration_db', `SELECT r.id,r.user_id,r.activity_id,r.status,r.price_cents,r.expires_at,
  r.snapshot->>'eventId' AS event_id,r.snapshot->'activity'->>'id' AS snapshot_activity_id,i.event_id AS inventory_event_id,
  p.result AS payment_receipt FROM registrations r JOIN inventories i USING(activity_id)
  LEFT JOIN payment_notification_receipts p ON p.registration_id=r.id`);
const capacity = query('registration_db', `SELECT i.activity_id,i.capacity,count(r.id)::int AS occupied FROM inventories i
  JOIN registrations r ON r.activity_id=i.activity_id AND r.status IN ('CONFIRMED','PENDING_PAYMENT')
  GROUP BY i.activity_id,i.capacity HAVING count(r.id)>i.capacity`);
const payments = query('payment_db', `SELECT registration_id,user_id,status,amount_cents,outcome,provider_mode,provider_status,reservation_expires_at FROM payments`);
const byUser = new Map(users.map(user => [user.id, user]));
const byRegistration = new Map(registrations.map(row => [row.id, row]));
const report = { generatedAt: new Date().toISOString(), composeProject: project, readOnly: true,
  counts: { users: users.length, events: events.length, registrations: registrations.length, payments: payments.length },
  conflicts: {
    participantWithAdministrativeMembership: users.filter(u => u.role === 'PARTICIPANT' && u.organizations.length),
    organizerWithoutExactlyOneInstitution: users.filter(u => u.role === 'ORGANIZER' && u.organizations.length !== 1),
    multipleInstitutionMemberships: users.filter(u => u.organizations.length > 1),
    unknownRoles: users.filter(u => !['PARTICIPANT', 'ORGANIZER'].includes(u.role)),
    eventsWithoutResponsible: events.filter(e => !e.owner_id),
    incompatibleEvents: events.filter(e => e.payload_organization_id !== e.organization_id || (e.owner_id &&
      (!byUser.has(e.owner_id) || byUser.get(e.owner_id).role !== 'ORGANIZER' || !byUser.get(e.owner_id).organizations.includes(e.organization_id)))),
    overCapacity: capacity,
    invalidPaymentReceipts: registrations.filter(r => r.payment_receipt != null && (!['APPROVED','DECLINED','EXPIRED'].includes(r.payment_receipt)
      || r.price_cents <= 0 || (r.payment_receipt === 'APPROVED' && !['CONFIRMED','CANCELLED'].includes(r.status)))),
    inconsistentRegistrations: registrations.filter(r => r.event_id !== r.inventory_event_id || r.snapshot_activity_id !== r.activity_id
      || (r.status === 'PENDING_PAYMENT' && (!r.expires_at || r.price_cents <= 0))
      || (r.status === 'CONFIRMED' && r.price_cents > 0 && r.payment_receipt !== 'APPROVED')
      || byUser.get(r.user_id)?.role !== 'PARTICIPANT'),
    inconsistentPayments: payments.filter(p => { const r = byRegistration.get(p.registration_id); return !r || p.user_id !== r.user_id || p.amount_cents !== r.price_cents
      || !['APPROVED','DECLINED','EXPIRED'].includes(p.outcome) || !['LEGACY','EXTERNAL_SIMULATOR'].includes(p.provider_mode)
      || (p.provider_status != null && !['APPROVED','DECLINED','EXPIRED'].includes(p.provider_status))
      || (p.provider_mode === 'EXTERNAL_SIMULATOR' && !p.reservation_expires_at)
      || (p.status === 'APPROVED' && !['CONFIRMED', 'CANCELLED'].includes(r.status))
      || (r.status === 'CONFIRMED' && p.status !== 'APPROVED'); }),
  },
};
report.conflictCounts = Object.fromEntries(Object.entries(report.conflicts).map(([key, rows]) => [key, rows.length]));
report.requiresDataDecision = Object.values(report.conflictCounts).some(count => count > 0);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ project, counts: report.counts, conflictCounts: report.conflictCounts, requiresDataDecision: report.requiresDataDecision, output }, null, 2));
