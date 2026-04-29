/**
 * Renderer that builds our standard VisaTrips email HTML from a simple
 * structured payload — so admins can tweak text/buttons without touching HTML.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 24px;
  color: #1E293B;
`;

const headerStyle = `text-align: center; margin-bottom: 32px;`;
const logoStyle   = `font-size: 24px; font-weight: 800; color: #1E293B; text-decoration: none;`;

const footerStyle = `
  text-align: center; margin-top: 40px; padding-top: 20px;
  border-top: 1px solid #EDF1F8; color: #94A3B8; font-size: 13px;
`;

const BUTTON_COLORS: Record<string, string> = {
  blue:   '#6C8AFF',
  green:  '#059669',
  red:    '#dc2626',
  amber:  '#f59e0b',
  slate:  '#475569',
  black:  '#1E293B',
};

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3,8})$/;

/** Accept either a named preset ("blue") or any hex ("#8b5cf6"). */
function resolveColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (HEX_COLOR_RE.test(color)) return color;
  return BUTTON_COLORS[color] || fallback;
}

function buttonStyle(color: string | undefined) {
  const bg = resolveColor(color, BUTTON_COLORS.blue);
  return `
    display: inline-block; padding: 14px 32px;
    background: ${bg};
    color: white; text-decoration: none;
    border-radius: 12px; font-weight: 600; font-size: 15px;
  `;
}

const cardStyle = `
  background: #F8FAFF; border-radius: 12px; padding: 20px; margin: 20px 0;
`;

function escapeHtml(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Replace {var} placeholders with values.
 */
export function interpolate(template: string, vars: Record<string, any>): string {
  return (template || '').replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * A structured email — admins only edit these fields, we handle the HTML.
 */
export interface StructuredEmail {
  /** Big emoji/icon shown above the heading (optional, e.g. "✅") */
  icon?: string;
  /** Icon color (hex, default inherits) */
  iconColor?: string;
  /** Main heading */
  heading: string;
  /** Color of the heading ('default' | 'green' | 'red' | 'amber') */
  headingColor?: string;
  /** Intro paragraph below heading */
  subheading?: string;
  /** Additional body paragraphs (one per entry) */
  paragraphs?: string[];
  /** Optional card/box with key-value rows (e.g. order summary) */
  card?: { title?: string; rows: Array<{ label: string; value: string; highlight?: boolean }> };
  /** Call-to-action button */
  button?: { text: string; url?: string; color?: 'blue' | 'green' | 'red' | 'amber' | 'slate' | 'black' };
  /**
   * Optional prominent highlight box — a colored card with a big value
   * rendered below the info card. Used for things like a welcome PIN so it
   * stands out from the rest of the email.
   */
  highlightBox?: {
    /** Small caption above the big value (e.g. "Your Account PIN"). */
    label?: string;
    /** Big value (e.g. the PIN itself). */
    value: string;
    /** One-line description below (e.g. "Use this PIN to log in..."). */
    description?: string;
    /** Color theme. Defaults to green. */
    color?: 'green' | 'blue' | 'amber' | 'red';
  };
  /** Small gray footnote text at the bottom */
  footnote?: string;
}

/**
 * Render structured email → full HTML using VisaTrips branded styles.
 * Variables in any text field get interpolated ({name}, {orderNumber}, etc.).
 */
export function renderStructured(data: StructuredEmail, vars: Record<string, any> = {}): string {
  const headingColors: Record<string, string> = {
    default: '#1E293B',
    green:   '#059669',
    red:     '#dc2626',
    amber:   '#d97706',
    blue:    '#6C8AFF',
  };
  // headingColor can be a named preset OR any hex (e.g. "#8b5cf6").
  const hColor = (data.headingColor && HEX_COLOR_RE.test(data.headingColor))
    ? data.headingColor
    : headingColors[data.headingColor || 'default'];
  const btnUrl = data.button?.url
    ? (data.button.url.startsWith('http') ? data.button.url : `${SITE_URL}${data.button.url.startsWith('/') ? '' : '/'}${data.button.url}`)
    : `${SITE_URL}/login`;

  const iconHtml = data.icon
    ? `<div style="text-align:center; margin-bottom:24px;"><span style="font-size:48px; ${data.iconColor ? `color:${data.iconColor};` : ''}">${escapeHtml(interpolate(data.icon, vars))}</span></div>`
    : '';

  const subheadingHtml = data.subheading
    ? `<p style="color:#94A3B8; margin-bottom:24px; text-align:center;">${escapeHtml(interpolate(data.subheading, vars))}</p>`
    : '';

  const paragraphsHtml = (data.paragraphs || [])
    .map(p => `<p style="margin:16px 0;">${escapeHtml(interpolate(p, vars))}</p>`)
    .join('');

  const cardHtml = data.card && data.card.rows && data.card.rows.length > 0
    ? `<div style="${cardStyle}">
        ${data.card.title ? `<p style="font-weight:600; margin-bottom:12px;">${escapeHtml(interpolate(data.card.title, vars))}</p>` : ''}
        <table style="width:100%; font-size:14px;" cellpadding="6">
          ${data.card.rows.map((r, i) => `
            <tr${r.highlight ? ' style="border-top:1px solid #EDF1F8;"' : ''}>
              <td style="color:#94A3B8;${r.highlight ? 'padding-top:12px;' : ''}">${escapeHtml(interpolate(r.label, vars))}</td>
              <td style="text-align:right;${r.highlight ? 'font-weight:700; font-size:18px; color:#6C8AFF; padding-top:12px;' : 'font-weight:600;'}">${escapeHtml(interpolate(r.value, vars))}</td>
            </tr>
          `).join('')}
        </table>
      </div>`
    : '';

  const buttonHtml = data.button?.text
    ? `<div style="text-align:center; margin:32px 0;">
         <a href="${escapeHtml(interpolate(btnUrl, vars))}" style="${buttonStyle(data.button.color || 'blue')}">${escapeHtml(interpolate(data.button.text, vars))}</a>
       </div>`
    : '';

  const footnoteHtml = data.footnote
    ? `<p style="font-size:13px; color:#94A3B8;">${escapeHtml(interpolate(data.footnote, vars))}</p>`
    : '';

  // Prominent highlight box (e.g. for displaying a welcome PIN)
  const HIGHLIGHT_THEMES: Record<string, { bg: string; border: string; fg: string; label: string }> = {
    green:  { bg: '#F0FDF4', border: '#86EFAC', fg: '#059669', label: '#065F46' },
    blue:   { bg: '#EFF6FF', border: '#BFDBFE', fg: '#2563EB', label: '#1E40AF' },
    amber:  { bg: '#FEF3C7', border: '#FCD34D', fg: '#B45309', label: '#92400E' },
    red:    { bg: '#FEF2F2', border: '#FCA5A5', fg: '#DC2626', label: '#991B1B' },
  };
  const highlightHtml = data.highlightBox
    ? (() => {
        const t = HIGHLIGHT_THEMES[data.highlightBox.color || 'green'];
        return `<div style="background:${t.bg}; border:2px solid ${t.border}; border-radius:12px; padding:20px; margin:20px 0; text-align:center;">
          ${data.highlightBox.label ? `<p style="font-weight:700; font-size:14px; color:${t.label}; margin:0 0 8px;">${escapeHtml(interpolate(data.highlightBox.label, vars))}</p>` : ''}
          <p style="font-size:32px; font-weight:800; letter-spacing:8px; color:${t.fg}; margin:0;">${escapeHtml(interpolate(data.highlightBox.value, vars))}</p>
          ${data.highlightBox.description ? `<p style="font-size:12px; color:${t.label}; margin:8px 0 0;">${escapeHtml(interpolate(data.highlightBox.description, vars))}</p>` : ''}
        </div>`;
      })()
    : '';

  const content = `
    ${iconHtml}
    <h1 style="font-size:24px; margin-bottom:8px; text-align:center; color:${hColor};">${escapeHtml(interpolate(data.heading, vars))}</h1>
    ${subheadingHtml}
    ${paragraphsHtml}
    ${cardHtml}
    ${highlightHtml}
    ${buttonHtml}
    ${footnoteHtml}
  `;

  return `<!DOCTYPE html>
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
    </html>`;
}

/**
 * Default structured templates — admins can edit these via Simple mode.
 */
export const STRUCTURED_DEFAULTS: Record<string, { subject: string; structured: StructuredEmail }> = {
  confirmation: {
    subject: 'Order Confirmed — #{orderNumber}',
    structured: {
      heading: 'Your order is confirmed!',
      subheading: 'Thank you, {name}. Here are your order details.',
      card: {
        rows: [
          { label: 'Order #',     value: '{orderNumber}' },
          { label: 'Destination', value: '{destination}' },
          { label: 'Visa Type',   value: '{visaType}' },
          { label: 'Travelers',   value: '{travelers}' },
          { label: 'Total',       value: '${total} USD', highlight: true },
        ],
      },
      paragraphs: ['Next step: complete your application to submit your visa request.'],
      button: { text: 'Finish Your Application', url: '/login', color: 'blue' },
      footnote: 'You can check your application status anytime by logging in with your email and order number.',
    },
  },
  reminder: {
    subject: 'Complete Your Visa Application — Order #{orderNumber}',
    structured: {
      heading: "Don't forget to finish your application!",
      subheading: 'Hi {name}, your visa application is almost complete. Please finish the remaining steps to submit it for processing.',
      button: { text: 'Continue Your Application', url: '/login', color: 'blue' },
      footnote: 'Log in with your email and order number #{orderNumber}.',
    },
  },
  correction: {
    subject: 'Action Required — Order #{orderNumber} Needs Correction',
    structured: {
      heading: 'Your application needs correction',
      headingColor: 'red',
      subheading: 'Hi {name}, our team found issues with your visa application.',
      paragraphs: ["Specialist's Note:", '{specialistNotes}'],
      button: { text: 'Fix Your Application', url: '/login', color: 'red' },
      footnote: 'Log in with your email and order number #{orderNumber} to make corrections.',
    },
  },
  submitted: {
    subject: 'Application Submitted — #{orderNumber}',
    structured: {
      icon: '📨',
      heading: 'Your application is in!',
      subheading: "Hi {name}, we've successfully submitted your {destination} visa application. Now we wait for approval.",
      card: {
        rows: [
          { label: 'Order #',        value: '{orderNumber}' },
          { label: 'Destination',    value: '{destination}' },
          { label: 'Application ID', value: '{applicationId}', highlight: true },
        ],
      },
      paragraphs: ["Processing typically takes 2–4 business days. We'll email you the moment your eVisa is approved."],
      button: { text: 'View Application Status', url: '/login', color: 'blue' },
      footnote: 'Keep your Application ID handy — you can use it on the Indian Government portal to check processing status directly.',
    },
  },
  status: {
    subject: 'Status Update — Order #{orderNumber}',
    structured: {
      heading: 'Application Status Update',
      subheading: 'Hi {name}, your visa application status has been updated.',
      card: {
        rows: [
          { label: 'Order #', value: '{orderNumber}' },
          { label: 'Status',  value: '{status}', highlight: true },
        ],
      },
      button: { text: 'View Application Status', url: '/login', color: 'blue' },
    },
  },
  evisa: {
    subject: 'Your {destination} eVisa is Ready! — Order #{orderNumber}',
    structured: {
      icon: '✅',
      heading: 'Your eVisa has been approved!',
      headingColor: 'green',
      subheading: 'Congratulations, {name}! Your {destination} eVisa is ready to download.',
      card: {
        rows: [
          { label: 'Order #',     value: '{orderNumber}' },
          { label: 'Destination', value: '{destination}' },
          { label: 'Status',      value: 'APPROVED', highlight: true },
        ],
      },
      button: { text: 'Download Your eVisa', url: '/login', color: 'green' },
      footnote: 'We recommend printing a copy of your eVisa to carry with you when traveling.',
    },
  },
  autoClosed: {
    subject: 'Order Closed — #{orderNumber}',
    structured: {
      heading: 'Your order has been closed',
      subheading: 'Hi {name}, we noticed your visa application at VisaTrips was never completed despite our reminders.',
      card: { rows: [{ label: 'Status', value: 'Order #{orderNumber} has been marked as closed. If you still need your visa, please reach out and we will help you pick up where you left off.' }] },
      button: { text: 'Contact Support', url: '/contact', color: 'blue' },
      footnote: "This is a courtesy notice. You can still log back in with order #{orderNumber} if you'd like to complete your application.",
    },
  },
  pin: {
    subject: 'Your VisaTrips PIN',
    structured: {
      heading: 'Your PIN Recovery',
      subheading: 'You requested your account PIN. Here it is:',
      highlightBox: {
        label: 'YOUR ACCOUNT PIN',
        value: '{pin}',
        color: 'green',
        description: 'Use this PIN with your email to log in.',
      },
      button: { text: 'Log In Now', url: '/login', color: 'blue' },
      footnote: "If you didn't request this, you can safely ignore this email.",
    },
  },
  welcome: {
    subject: 'Order Confirmed — #{orderNumber} | Your Account PIN',
    structured: {
      heading: 'Your order is confirmed!',
      subheading: 'Thank you, {name}. Here are your order details.',
      card: {
        rows: [
          { label: 'Order #',     value: '{orderNumber}' },
          { label: 'Destination', value: '{destination}' },
          { label: 'Visa Type',   value: '{visaType}' },
          { label: 'Travelers',   value: '{travelers}' },
          { label: 'Total',       value: '${total} USD', highlight: true },
        ],
      },
      highlightBox: {
        label: 'YOUR ACCOUNT PIN',
        value: '{pin}',
        color: 'green',
        description: "Use this PIN with your email to log in and check your application status.",
      },
      paragraphs: ["Keep your PIN safe — you'll need it to access your account."],
      button: { text: 'Check Your Status', url: '/login', color: 'blue' },
      footnote: 'Next step: complete your application to submit your visa request.',
    },
  },
};
