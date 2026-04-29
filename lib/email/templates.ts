const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 24px;
  color: #1E293B;
`;

const headerStyle = `
  text-align: center;
  margin-bottom: 32px;
`;

const logoStyle = `
  font-size: 24px;
  font-weight: 800;
  color: #1E293B;
  text-decoration: none;
`;

const buttonStyle = `
  display: inline-block;
  padding: 14px 32px;
  background: #6C8AFF;
  color: white;
  text-decoration: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 15px;
`;

const greenButtonStyle = `
  display: inline-block;
  padding: 14px 32px;
  background: #059669;
  color: white;
  text-decoration: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 15px;
`;

const redButtonStyle = `
  display: inline-block;
  padding: 14px 32px;
  background: #dc2626;
  color: white;
  text-decoration: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 15px;
`;

const cardStyle = `
  background: #F8FAFF;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
`;

const footerStyle = `
  text-align: center;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #EDF1F8;
  color: #94A3B8;
  font-size: 13px;
`;

function wrap(content: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0; padding:0; background:#f5f7fa;">
      <div style="${baseStyle}">
        <div style="${headerStyle}">
          <a href="${SITE_URL}" style="${logoStyle}">VisaTrips<sup style="font-size:10px; color:#6C8AFF;">®</sup></a>
        </div>
        ${content}
        <div style="${footerStyle}">
          <p>© ${new Date().getFullYear()} VisaTrips. All rights reserved.</p>
          <p><a href="${SITE_URL}/privacy" style="color:#94A3B8;">Privacy Policy</a> · <a href="${SITE_URL}/terms" style="color:#94A3B8;">Terms of Service</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/** Order confirmation — sent after payment */
export function orderConfirmationEmail(data: {
  name: string;
  orderNumber: string;
  destination: string;
  visaType: string;
  total: number;
  travelers: number;
}) {
  return {
    subject: `Order Confirmed — #${data.orderNumber}`,
    html: wrap(`
      <h1 style="font-size:24px; margin-bottom:8px;">Your order is confirmed!</h1>
      <p style="color:#94A3B8; margin-bottom:24px;">Thank you, ${data.name}. Here are your order details.</p>

      <div style="${cardStyle}">
        <table style="width:100%; font-size:14px;" cellpadding="6">
          <tr><td style="color:#94A3B8;">Order #</td><td style="text-align:right; font-weight:600;">${data.orderNumber}</td></tr>
          <tr><td style="color:#94A3B8;">Destination</td><td style="text-align:right;">${data.destination}</td></tr>
          <tr><td style="color:#94A3B8;">Visa Type</td><td style="text-align:right;">${data.visaType}</td></tr>
          <tr><td style="color:#94A3B8;">Travelers</td><td style="text-align:right;">${data.travelers}</td></tr>
          <tr><td style="color:#94A3B8; border-top:1px solid #EDF1F8; padding-top:12px;">Total</td><td style="text-align:right; font-weight:700; font-size:18px; color:#6C8AFF; border-top:1px solid #EDF1F8; padding-top:12px;">$${data.total} USD</td></tr>
        </table>
      </div>

      <p style="margin:24px 0;">Next step: complete your application to submit your visa request.</p>

      <div style="text-align:center; margin:32px 0;">
        <a href="${SITE_URL}/login" style="${buttonStyle}">Finish Your Application</a>
      </div>

      <p style="font-size:13px; color:#94A3B8;">You can check your application status anytime by logging in with your email and order number.</p>
    `),
  };
}

/** Application needs correction — sent when admin flags fields */
export function correctionNeededEmail(data: {
  name: string;
  orderNumber: string;
  specialistNotes: string;
  flaggedFields: string[];
}) {
  const fieldList = data.flaggedFields.length > 0
    ? `<ul style="margin:12px 0;">${data.flaggedFields.map(f => `<li style="padding:4px 0;">${f}</li>`).join('')}</ul>`
    : '';

  return {
    subject: `Action Required — Order #${data.orderNumber} Needs Correction`,
    html: wrap(`
      <h1 style="font-size:24px; margin-bottom:8px; color:#dc2626;">Your application needs correction</h1>
      <p style="color:#94A3B8; margin-bottom:24px;">Hi ${data.name}, our team found issues with your visa application.</p>

      ${data.specialistNotes ? `
        <div style="${cardStyle} border-left: 4px solid #dc2626;">
          <p style="font-weight:600; margin-bottom:8px;">Specialist's Note:</p>
          <p style="margin:0;">${data.specialistNotes}</p>
        </div>
      ` : ''}

      ${fieldList ? `
        <div style="margin:20px 0;">
          <p style="font-weight:600;">Fields that need attention:</p>
          ${fieldList}
        </div>
      ` : ''}

      <div style="text-align:center; margin:32px 0;">
        <a href="${SITE_URL}/login" style="${redButtonStyle}">Fix Your Application</a>
      </div>

      <p style="font-size:13px; color:#94A3B8;">Log in with your email and order number #${data.orderNumber} to make corrections.</p>
    `),
  };
}

/** eVisa ready — sent when admin uploads the approved eVisa */
export function evisaReadyEmail(data: {
  name: string;
  orderNumber: string;
  destination: string;
}) {
  return {
    subject: `Your ${data.destination} eVisa is Ready! — Order #${data.orderNumber}`,
    html: wrap(`
      <div style="text-align:center; margin-bottom:24px;">
        <span style="font-size:48px;">✅</span>
      </div>
      <h1 style="font-size:24px; margin-bottom:8px; text-align:center; color:#059669;">Your eVisa has been approved!</h1>
      <p style="color:#94A3B8; text-align:center; margin-bottom:24px;">Congratulations, ${data.name}! Your ${data.destination} eVisa is ready to download.</p>

      <div style="${cardStyle}">
        <table style="width:100%; font-size:14px;" cellpadding="6">
          <tr><td style="color:#94A3B8;">Order #</td><td style="text-align:right; font-weight:600;">${data.orderNumber}</td></tr>
          <tr><td style="color:#94A3B8;">Destination</td><td style="text-align:right;">${data.destination}</td></tr>
          <tr><td style="color:#94A3B8;">Status</td><td style="text-align:right; color:#059669; font-weight:700;">APPROVED</td></tr>
        </table>
      </div>

      <div style="text-align:center; margin:32px 0;">
        <a href="${SITE_URL}/login" style="${greenButtonStyle}">Download Your eVisa</a>
      </div>

      <p style="font-size:13px; color:#94A3B8;">We recommend printing a copy of your eVisa to carry with you when traveling.</p>
    `),
  };
}

/** Status update — generic status change notification */
export function statusUpdateEmail(data: {
  name: string;
  orderNumber: string;
  status: string;
}) {
  const statusLabels: Record<string, string> = {
    UNFINISHED:       'Unfinished',
    PROCESSING:       'Processing',
    SUBMITTED:        'Submitted',
    COMPLETED:        'Completed',
    NEEDS_CORRECTION: 'Needs Correction',
    ON_HOLD:          'On Hold',
    REJECTED:         'Rejected',
    REFUNDED:         'Refunded',
    PENDING:          'Pending',
    UNDER_REVIEW:     'Under Review',
    APPROVED:         'Approved',
  };

  return {
    subject: `Status Update — Order #${data.orderNumber}`,
    html: wrap(`
      <h1 style="font-size:24px; margin-bottom:8px;">Application Status Update</h1>
      <p style="color:#94A3B8; margin-bottom:24px;">Hi ${data.name}, your visa application status has been updated.</p>

      <div style="${cardStyle} text-align:center;">
        <p style="color:#94A3B8; margin-bottom:8px;">Order #${data.orderNumber}</p>
        <p style="font-size:20px; font-weight:700; margin:0;">${statusLabels[data.status] || data.status}</p>
      </div>

      <div style="text-align:center; margin:32px 0;">
        <a href="${SITE_URL}/login" style="${buttonStyle}">View Application Status</a>
      </div>
    `),
  };
}

/** Finish application reminder */
export function finishReminderEmail(data: {
  name: string;
  orderNumber: string;
}) {
  return {
    subject: `Complete Your Visa Application — Order #${data.orderNumber}`,
    html: wrap(`
      <h1 style="font-size:24px; margin-bottom:8px;">Don't forget to finish your application!</h1>
      <p style="color:#94A3B8; margin-bottom:24px;">Hi ${data.name}, your visa application is almost complete. Please finish the remaining steps to submit it for processing.</p>

      <div style="text-align:center; margin:32px 0;">
        <a href="${SITE_URL}/login" style="${buttonStyle}">Continue Your Application</a>
      </div>

      <p style="font-size:13px; color:#94A3B8;">Log in with your email and order number #${data.orderNumber}.</p>
    `),
  };
}

/**
 * Abandoned-application reminder — nudges pre-payment drop-offs back to /apply.
 *
 * Session data lives in sessionStorage (per-tab, ephemeral) so we can't deep-link
 * them back to their exact step. The CTA just drops them at /apply where they
 * start over — low friction since abandoned users usually quit early anyway.
 */
export function abandonedReminderEmail(data: {
  name: string;
  destination?: string | null;
  reminderIndex: number; // 1, 2, or 3 — useful for admins reading the source
}) {
  const dest = data.destination ? ` ${data.destination}` : '';
  return {
    subject: `Still interested in your${dest} visa?`,
    html: wrap(`
      <h1 style="font-size:24px; margin-bottom:8px;">We saved your spot!</h1>
      <p style="color:#94A3B8; margin-bottom:24px;">Hi ${data.name || 'there'}, you started a${dest} visa application with VisaTrips but didn't finish. It only takes a few minutes to pick up where you left off.</p>

      <div style="text-align:center; margin:32px 0;">
        <a href="${SITE_URL}/apply" style="${buttonStyle}">Finish My Application</a>
      </div>

      <p style="font-size:13px; color:#94A3B8;">If you're no longer interested, you can safely ignore this email — we'll stop reminding you after a few attempts.</p>
    `),
  };
}

/** Application submitted — sent once we have an Application ID from the gov site */
export function applicationSubmittedEmail(data: {
  name: string;
  orderNumber: string;
  applicationId: string;
  destination: string;
}) {
  return {
    subject: `Application Submitted — #${data.orderNumber}`,
    html: wrap(`
      <div style="text-align:center; margin-bottom:24px;">
        <span style="font-size:48px;">📨</span>
      </div>
      <h1 style="font-size:24px; margin-bottom:8px; text-align:center;">Your application is in!</h1>
      <p style="color:#94A3B8; text-align:center; margin-bottom:24px;">Hi ${data.name}, we've successfully submitted your ${data.destination} visa application. Now we wait for approval.</p>

      <div style="${cardStyle}">
        <table style="width:100%; font-size:14px;" cellpadding="6">
          <tr><td style="color:#94A3B8;">Order #</td><td style="text-align:right; font-weight:600;">${data.orderNumber}</td></tr>
          <tr><td style="color:#94A3B8;">Destination</td><td style="text-align:right;">${data.destination}</td></tr>
          <tr><td style="color:#94A3B8;">Application ID</td><td style="text-align:right; font-weight:700; font-family:monospace; color:#6C8AFF;">${data.applicationId}</td></tr>
        </table>
      </div>

      <p style="margin:24px 0;">Processing typically takes 2–4 business days. We'll email you the moment your eVisa is approved.</p>

      <div style="text-align:center; margin:32px 0;">
        <a href="${SITE_URL}/login" style="${buttonStyle}">View Application Status</a>
      </div>

      <p style="font-size:13px; color:#94A3B8;">Keep your Application ID handy — you can use it on the Indian Government portal to check processing status directly.</p>
    `),
  };
}

/** Auto-closed — sent when a customer never completes their application after 3 reminders */
export function autoClosedEmail(data: {
  name: string;
  orderNumber: string;
}) {
  return {
    subject: `Order Closed — #${data.orderNumber}`,
    html: wrap(`
      <h1 style="font-size:24px; margin-bottom:8px;">Your order has been closed</h1>
      <p style="color:#94A3B8; margin-bottom:24px;">Hi ${data.name}, we noticed your visa application at VisaTrips was never completed despite our reminders.</p>

      <div style="${cardStyle}">
        <p style="margin:0;">Order #${data.orderNumber} has been marked as closed. If you still need your visa, please reach out and we'll help you pick up where you left off.</p>
      </div>

      <div style="text-align:center; margin:32px 0;">
        <a href="${SITE_URL}/contact" style="${buttonStyle}">Contact Support</a>
      </div>

      <p style="font-size:13px; color:#94A3B8;">This is a courtesy notice. You can still log back in with order #${data.orderNumber} if you'd like to complete your application.</p>
    `),
  };
}
