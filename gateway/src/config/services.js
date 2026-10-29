export const services = {
  identity: process.env.IDENTITY_URL || 'http://identity:3000',
  events: process.env.EVENTS_URL || 'http://events:8000',
  registrations: process.env.REGISTRATIONS_URL || 'http://registrations:8000',
  payments: process.env.PAYMENTS_URL || 'http://payments:3000',
  notifications: process.env.NOTIFICATIONS_URL || 'http://notifications:8000',
};

