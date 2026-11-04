export const services = {
  identity: process.env.IDENTITY_URL || 'http://identity:3000',
  events: process.env.EVENTS_URL || 'http://events:8000',
  registrations: process.env.REGISTRATIONS_URL || 'http://registrations:8000',
  payments: process.env.PAYMENTS_URL || 'http://payments:3000',
  notifications: process.env.NOTIFICATIONS_URL || 'http://notifications:8000',
  attendance: process.env.ATTENDANCE_URL || 'http://attendance:8000',
  certificates: process.env.CERTIFICATES_URL || 'http://certificates:8000',
  reporting: process.env.REPORTING_URL || 'http://reporting:8000',
};

