// The payment receipt as a soft copy: a one-page A4 PDF and an HTML email,
// matching the receipt patients see in My appointments (src/ui/ReceiptDialog.jsx).

const PDFDocument = require("pdfkit");
const config = require("../config");

const BRAND = "#2f5d3a";
const INK = "#1f2a24";
const MUTED = "#5f6b64";
const LINE = "#d9ddd6";

// "8 Nov 2026"
function formatDay(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(dateString || "");
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// "28 Nov 2026, 2:15 PM" in the clinic's time zone.
function formatIssued(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date
      .toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: config.timeZone(),
      })
      .replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

// "800.00" with Indian digit grouping ("1,20,000.00").
function formatAmount(amount) {
  return (Number(amount) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Everything the receipt shows, in one place for both formats.
function receiptFields(appointment) {
  const receipt = appointment.receipt || {};
  return {
    number: receipt.number || "",
    issued: formatIssued(receipt.issuedAt),
    method: receipt.method || "Cash",
    issuedBy: receipt.issuedBy || "",
    amount: formatAmount(receipt.amount ?? appointment.fee),
    patientName: appointment.patientName || "",
    patientEmail: appointment.patientEmail || "",
    doctorName: appointment.doctorName || "",
    specialty: appointment.specialty || "",
    visit: `${formatDay(appointment.appointmentDate)} at ${appointment.appointmentTime || ""}`,
  };
}

// ---------------------------------------------------------------- PDF

// Resolves with the PDF as a Buffer.
function buildReceiptPdf(appointment) {
  const r = receiptFields(appointment);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 56,
      info: {
        Title: `MediBook+ payment receipt ${r.number}`,
        Author: "MediBook+",
        Subject: "Payment receipt",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const half = width / 2;

    const rule = (y, color = LINE, weight = 1) =>
      doc.save().moveTo(left, y).lineTo(right, y).lineWidth(weight).strokeColor(color).stroke().restore();

    const label = (text, x, y, w) =>
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(text.toUpperCase(), x, y, { width: w, characterSpacing: 0.6 });

    // brand bar
    doc.rect(0, 0, doc.page.width, 8).fill(BRAND);

    // header: brand and PAID stamp
    let y = 56;
    doc.circle(left + 7, y + 9, 7).fill(BRAND);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text("MediBook+", left + 22, y, { lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Online doctor appointments", left + 22, y + 22);

    const stampW = 64;
    doc.roundedRect(right - stampW, y + 2, stampW, 24, 12).lineWidth(1.2).strokeColor(BRAND).stroke();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND).text("PAID", right - stampW, y + 9, { width: stampW, align: "center", characterSpacing: 1.5 });

    // title
    y += 66;
    doc.font("Helvetica-Bold").fontSize(26).fillColor(INK).text("Payment receipt", left, y);
    y += 44;
    rule(y);

    // receipt number and date
    y += 16;
    label("Receipt no.", left, y, half);
    label("Issued", left + half, y, half);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(r.number, left, y + 14, { width: half });
    doc.font("Helvetica").fontSize(12).fillColor(INK).text(r.issued, left + half, y + 14, { width: half });

    // billed to / visit
    y += 54;
    label("Billed to", left, y, half);
    label("Visit", left + half, y, half);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(r.patientName, left, y + 14, { width: half - 16 });
    doc.font("Helvetica").fontSize(10.5).fillColor(MUTED).text(r.patientEmail, left, doc.y + 3, { width: half - 16 });
    const leftEnd = doc.y;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(r.doctorName, left + half, y + 14, { width: half });
    doc.font("Helvetica").fontSize(10.5).fillColor(MUTED).text(r.specialty, left + half, doc.y + 3, { width: half });
    doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(r.visit, left + half, doc.y + 3, { width: half });
    y = Math.max(leftEnd, doc.y) + 28;

    // line items
    const amountW = 140;
    doc.rect(left, y, width, 26).fill("#eef1ec");
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(MUTED);
    doc.text("DESCRIPTION", left + 12, y + 9, { width: width - amountW - 24, characterSpacing: 0.6 });
    doc.text("AMOUNT", right - amountW - 12, y + 9, { width: amountW, align: "right", characterSpacing: 0.6 });

    y += 38;
    doc.font("Helvetica").fontSize(12).fillColor(INK);
    doc.text("Consultation fee", left + 12, y, { width: width - amountW - 24 });
    doc.text(`INR ${r.amount}`, right - amountW - 12, y, { width: amountW, align: "right" });

    y += 30;
    rule(y);
    y += 14;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK);
    doc.text("Total paid", left + 12, y, { width: width - amountW - 24 });
    doc.text(`INR ${r.amount}`, right - amountW - 12, y, { width: amountW, align: "right" });
    y += 26;
    rule(y, INK, 1.2);

    // payment details
    y += 22;
    label("Paid by", left, y, half);
    if (r.issuedBy) label("Issued by", left + half, y, half);
    doc.font("Helvetica").fontSize(12).fillColor(INK).text(r.method, left, y + 14, { width: half });
    if (r.issuedBy) doc.text(r.issuedBy, left + half, y + 14, { width: half });

    // footer
    const footY = doc.page.height - doc.page.margins.bottom - 40;
    rule(footY);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text("A computer-generated receipt from MediBook+. No signature is required.", left, footY + 12, { width });
    doc.text("Questions about this receipt? Reply to this email or contact the clinic.", left, doc.y + 2, { width });

    doc.end();
  });
}

// ---------------------------------------------------------------- EMAIL

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function receiptEmail(appointment) {
  const r = receiptFields(appointment);
  const e = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, escapeHtml(v)]));

  const subject = `Your MediBook+ payment receipt ${r.number}`;

  const text = `Hello ${r.patientName},

Thank you for visiting MediBook+. Your appointment with ${r.doctorName} on ${r.visit} is complete, and this is your payment receipt. The PDF copy is attached.

Receipt no.: ${r.number}
Issued: ${r.issued}
Doctor: ${r.doctorName} (${r.specialty})
Visit: ${r.visit}
Consultation fee: Rs. ${r.amount}
Total paid: Rs. ${r.amount}
Paid by: ${r.method}${r.issuedBy ? `\nIssued by: ${r.issuedBy}` : ""}

You can also view and print this receipt any time in My appointments.

We hope you are feeling better!
MediBook+`;

  const row = (labelText, value, strong = false) => `
      <tr>
        <td style="padding:6px 0;color:${MUTED};font-size:13px">${labelText}</td>
        <td style="padding:6px 0;text-align:right;font-size:14px;${strong ? "font-weight:700;" : ""}color:${INK}">${value}</td>
      </tr>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:${INK}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${LINE}">
    <tr><td style="height:6px;background:${BRAND}"></td></tr>
    <tr><td style="padding:28px 28px 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:20px;font-weight:700">MediBook+</td>
        <td style="text-align:right"><span style="display:inline-block;padding:5px 14px;border:1px solid ${BRAND};border-radius:999px;color:${BRAND};font-size:12px;font-weight:700;letter-spacing:1px">PAID</span></td>
      </tr></table>
      <h1 style="margin:22px 0 6px;font-size:24px">Payment receipt</h1>
      <p style="margin:0;color:${MUTED};font-size:14px;line-height:1.5">Hello ${e.patientName}, thank you for visiting MediBook+. Your appointment is complete and the PDF copy of this receipt is attached.</p>
    </td></tr>
    <tr><td style="padding:16px 28px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE}">
        ${row("Receipt no.", e.number, true)}
        ${row("Issued", e.issued)}
        ${row("Doctor", `${e.doctorName}<br><span style="color:${MUTED};font-size:12px">${e.specialty}</span>`)}
        ${row("Visit", e.visit)}
        ${row("Billed to", `${e.patientName}<br><span style="color:${MUTED};font-size:12px">${e.patientEmail}</span>`)}
      </table>
    </td></tr>
    <tr><td style="padding:8px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};border-bottom:2px solid ${INK}">
        ${row("Consultation fee", `&#8377;${e.amount}`)}
        ${row("<strong style=\"color:" + INK + ";font-size:15px\">Total paid</strong>", `<span style="font-size:17px">&#8377;${e.amount}</span>`, true)}
      </table>
    </td></tr>
    <tr><td style="padding:8px 28px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row("Paid by", e.method)}
        ${r.issuedBy ? row("Issued by", e.issuedBy) : ""}
      </table>
      <p style="margin:18px 0 0;color:${MUTED};font-size:12px;line-height:1.5">You can view and print this receipt any time in <strong>My appointments</strong>. This is a computer-generated receipt; no signature is required.</p>
    </td></tr>
  </table>
  <p style="max-width:560px;margin:14px auto 0;text-align:center;color:${MUTED};font-size:12px">We hope you are feeling better! &middot; MediBook+</p>
</body></html>`;

  return { subject, text, html };
}

// Email + PDF attachment, ready for sendMail().
async function receiptMessage(appointment) {
  const pdf = await buildReceiptPdf(appointment);
  const number = appointment.receipt?.number || "receipt";

  return {
    to: appointment.patientEmail,
    ...receiptEmail(appointment),
    attachments: [
      {
        filename: `MediBook-Receipt-${number}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  };
}

module.exports = { buildReceiptPdf, receiptEmail, receiptMessage };
