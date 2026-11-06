const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function providerPayment(row, requestId = '', request = fetch, env = process.env) {
  if (!env.PAYMENT_PROVIDER_URL || !env.PAYMENT_PROVIDER_API_KEY) throw new Error('Provider configuration unavailable');
  const creating = !row.provider_id;
  const response = await request(env.PAYMENT_PROVIDER_URL.replace(/\/$/, '') + '/v1/payments' + (creating ? '' : '/' + row.provider_id), {
    method: creating ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { authorization: 'Bearer ' + env.PAYMENT_PROVIDER_API_KEY, 'content-type': 'application/json',
      'idempotency-key': row.registration_id, ...(requestId ? { 'x-request-id': requestId } : {}) },
    body: creating ? JSON.stringify({ reference: row.registration_id, amountCents: row.amount_cents, currency: 'BRL',
      expiresAt: new Date(row.reservation_expires_at).toISOString(), simulation: { outcome: row.outcome } }) : undefined,
  });
  if (!response.ok) throw new Error('Provider unavailable or rejected request');
  const { payment } = await response.json();
  if (!payment || !uuid.test(payment.id || '') || (row.provider_id && payment.id !== row.provider_id) || payment.reference !== row.registration_id ||
      payment.amountCents !== row.amount_cents || payment.currency !== 'BRL' || payment.simulated !== true ||
      !['APPROVED','DECLINED','EXPIRED'].includes(payment.status) || !Number.isFinite(Date.parse(payment.expiresAt)) ||
      Date.parse(payment.expiresAt) !== new Date(row.reservation_expires_at).getTime()) throw new Error('Inconsistent provider response');
  return payment;
}
