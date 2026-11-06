// Optional email notifications.
// Emails are sent only when SMTP settings are present in .env.
// If SMTP is not configured, sendMail() safely skips email sending.

const nodemailer = require("nodemailer");

let transporter = null;

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

// Escape special characters before inserting text into HTML.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (!isConfigured()) {
    return { skipped: true };
  }

  try {
    const safeHtml =
      html ||
      `<p>${escapeHtml(text || "").replace(/\n/g, "<br/>")}</p>`;

    await getTransporter().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: text || "",
      html: safeHtml,
    });

    return { sent: true };
  } catch (error) {
    console.error("Email error:", error.message);

    return { error: error.message };
  }
}

module.exports = {
  sendMail,
  isConfigured,
};