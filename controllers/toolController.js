const axios = require("axios");
const XLSX = require("xlsx");
const supabase = require("../config/supabase");
const { sendEmail } = require("../utils/emailSender"); // Reusing existing util
const { generateRandomInvoice, generateInvoiceHTML } = require("../utils/invoice");
const { buildZipFromRows, normalizeVoxeraRows } = require("../utils/report");

const generateInvoice = async (req, res) => {
  try {
    const {
      userId, companyName, phoneNumber, supportPhone, date, amount,
      transactionId, invoiceNumber, logoUrl, emailTo, smtpConfig,
      emailSubject, emailBody
    } = req.body;

    if (!userId || !companyName || !phoneNumber || amount == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const invoiceCost = 2;
    const { data: userData } = await supabase.from("user_limits").select("usdt_balance").eq("id", userId).maybeSingle();

    if (!userData || userData.usdt_balance < invoiceCost) {
      return res.status(403).json({ message: "Insufficient balance" });
    }

    const numericAmount = parseFloat(String(amount).replace(/[^\d.]/g, ""));
    const amountDisplay = `$${(isNaN(numericAmount) ? 0 : numericAmount).toFixed(2)}`;

    const finalInvoiceNumber = invoiceNumber || generateRandomInvoice();
    const finalTransactionId = transactionId || `TRX-${Math.floor(100000000 + Math.random() * 900000000)}`;

    const invoiceHTML = generateInvoiceHTML({
      companyName: companyName || "PAY PAL",
      phoneNumber: phoneNumber || "+1 858 426 0634",
      supportPhone: supportPhone || "+1 800 123 4567",
      date: date || new Date().toISOString().split("T")[0],
      amount: amountDisplay,
      transactionId: finalTransactionId,
      invoiceNumber: finalInvoiceNumber,
      logoUrl: logoUrl || "https://upload.wikimedia.org/wikipedia/commons/b/b7/PayPal_Logo_Icon_2014.svg",
    });

    const hcti_user_id = process.env.HCTI_USER_ID;
    const hcti_api_key = process.env.HCTI_API_KEY;

    const hctiRes = await axios.post('https://hcti.io/v1/image', {
      html: invoiceHTML,
      selector: "#invoice-root",
      ms_delay: 500
    }, {
      auth: { username: hcti_user_id, password: hcti_api_key }
    });

    const imgRes = await axios.get(hctiRes.data.url, { responseType: 'arraybuffer' });
    const screenshotBuffer = Buffer.from(imgRes.data);

    const fileName = `invoice_${Date.now()}_${userId}.jpg`;
    await supabase.storage.from("Invoice").upload(fileName, screenshotBuffer, { contentType: "image/jpeg", upsert: true });

    const { data: publicData } = supabase.storage.from("Invoice").getPublicUrl(fileName);
    const downloadUrl = publicData.publicUrl;

    const newBalance = userData.usdt_balance - invoiceCost;
    await supabase.from("user_limits").update({ usdt_balance: newBalance }).eq("id", userId);

    await supabase.from("invoice_history").insert([{
      user_id: userId,
      company_name: companyName,
      amount: numericAmount,
      file_path: downloadUrl,
      usdt_used: invoiceCost,
      created_at: new Date(),
    }]);

    let emailStatus = "skipped";
    if (emailTo && smtpConfig) {
      try {
        await sendEmail({
          smtpConfig,
          recipient: { email: emailTo, name: "Customer" },
          messageConfig: {
            subject: emailSubject || `Invoice ${finalInvoiceNumber} from ${companyName}`,
            text: emailBody || `Please find attached your invoice for ${amountDisplay}.`,
            html: `<p>${emailBody || `Please find attached your invoice for <strong>${amountDisplay}</strong>.`}</p>`,
            attachments: [{
              filename: `Invoice-${finalInvoiceNumber}.jpg`,
              content: screenshotBuffer.toString("base64"),
              encoding: "base64"
            }, ...(req.body.attachments || [])]
          }
        });
        emailStatus = "sent";
      } catch (mailErr) {
        emailStatus = "failed: " + mailErr.message;
      }
    }

    res.json({
      message: "✅ Invoice generated" + (emailStatus === "sent" ? " & Email Sent" : ""),
      downloadUrl, amount: amountDisplay, usdt_used: invoiceCost,
      remaining_balance: newBalance, email_status: emailStatus
    });

  } catch (err) {
    res.status(500).json({ message: "Invoice generation failed", error: err.message });
  }
};

const generateReport = async (req, res) => {
  try {
    const { userId, reportDate } = req.body;
    if (!req.file || !reportDate) return res.status(400).json({ message: "File and date required" });

    const reportCost = 3.5;
    const { data: userData } = await supabase.from("user_limits").select("usdt_balance").eq("id", userId).maybeSingle();

    if (!userData || userData.usdt_balance < reportCost) return res.status(403).json({ message: "Insufficient balance" });

    await supabase.from("user_limits").update({ usdt_balance: userData.usdt_balance - reportCost }).eq("id", userId);

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ error: "No rows found" });

    // Normalize rows if they are in Voxera CDR format
    const normalizedRows = normalizeVoxeraRows(rows);
    const zipBuffer = await buildZipFromRows(normalizedRows, reportDate);
    const fileName = `buyer_reports_${Date.now()}.zip`;

    await supabase.storage.from("reports").upload(fileName, zipBuffer, { contentType: "application/zip", upsert: true });

    const { data: publicData } = supabase.storage.from("reports").getPublicUrl(fileName);
    const downloadUrl = publicData.publicUrl;

    await supabase.from("report_history").insert([{
      user_id: userId, file_name: fileName, file_path: downloadUrl,
      usdt_used: reportCost, created_at: new Date(),
    }]);

    res.json({ message: "✅ Report generated successfully", downloadUrl });
  } catch (err) {
    res.status(500).json({ message: "Report generation failed", error: err.message });
  }
};

const deductImageCost = async (req, res) => {
  try {
    const { userId, amount = 2, toolName = "AI Image Gen" } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const { data: userData } = await supabase.from("user_limits").select("usdt_balance").eq("id", userId).maybeSingle();

    if (!userData || userData.usdt_balance < amount) return res.status(403).json({ message: "Insufficient balance" });

    const newBalance = userData.usdt_balance - amount;
    await supabase.from("user_limits").update({ usdt_balance: newBalance }).eq("id", userId);

    await supabase.from("invoice_history").insert([{
      user_id: userId, company_name: toolName, amount: 0, usdt_used: amount, created_at: new Date()
    }]);

    res.json({ success: true, newBalance });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const serveTool = async (req, res) => {
  const path = require("path");
  const fs = require("fs");
  try {
    const toolName = req.params.toolName;
    const toolsDir = path.join(__dirname, "..", "protected_tools");
    const filePath = path.join(toolsDir, toolName);

    if (!filePath.startsWith(toolsDir)) return res.status(403).send("Access denied");

    if (!fs.existsSync(filePath)) return res.status(404).send("Tool not found");

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send("Server error");
  }
};

module.exports = {
  generateInvoice,
  generateReport,
  deductImageCost,
  serveTool
};
