import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.EMAIL_FROM;

/**
 * Sends an email using Resend.
 * @param {string} to - Recipient email address.
 * @param {string} subject - Email subject.
 * @param {string} html - Email content in HTML.
 */
export const sendEmail = async (to, subject, html) => {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent to ${to}`);
  } catch (error) {
    console.error("❌ Resend Email Error:", error);
  }
};
