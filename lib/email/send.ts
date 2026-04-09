import { resend, EMAIL_FROM } from './resend';
import { prisma } from '@/lib/prisma';

export async function sendEmail(to: string, template: { subject: string; html: string }) {
  let success = false;
  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: template.subject,
      html: template.html,
    });
    console.log(`📧 Email sent to ${to}: ${template.subject}`);
    success = true;

    // Log to CRM activity
    await logEmailToCrm(to, template.subject, 'sent');

    return result;
  } catch (err) {
    console.error(`📧 Failed to send email to ${to}:`, err);
    await logEmailToCrm(to, template.subject, 'failed');
    return null;
  }
}

async function logEmailToCrm(email: string, subject: string, status: 'sent' | 'failed') {
  try {
    // Find CRM customer by email
    const customer = await prisma.crmCustomer.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (customer) {
      await prisma.crmActivity.create({
        data: {
          customerId: customer.id,
          type: 'email',
          content: `${status === 'sent' ? '✉️ Sent' : '❌ Failed'}: ${subject}`,
          createdBy: 'System',
        },
      });
    }
  } catch {
    // Don't let CRM logging break email sending
  }
}
