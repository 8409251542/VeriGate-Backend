const nodemailer = require("nodemailer");
const { SocksClient } = require("socks");

/**
 * Process tags in the template
 */
function processTags(template, recipient) {
    if (!template) return "";
    let output = template;
    // Standard tags
    output = output.replace(/{{\s*email\s*}}/gi, recipient.email || "");
    output = output.replace(/{{\s*name\s*}}/gi, recipient.name || "Friend");
    output = output.replace(/{{\s*id\s*}}/gi, recipient.id || "");

    // Custom columns
    output = output.replace(/{{\s*c3\s*}}/gi, recipient.c3 || "");
    output = output.replace(/{{\s*c4\s*}}/gi, recipient.c4 || "");
    output = output.replace(/{{\s*c5\s*}}/gi, recipient.c5 || "");
    output = output.replace(/{{\s*c6\s*}}/gi, recipient.c6 || "");

    return output;
}

/**
 * Send an email
 * @param {Object} options
 * @param {Object} options.smtpConfig - SMTP/Gmail credentials
 * @param {Object} options.recipient - Recipient object { email, name, ... }
 * @param {Object} options.messageConfig - { subject, text, html, attachments }
 * @param {Object} [options.proxyConfig] - Optional SOCKS5 proxy { host, port, userId, password }
 */
async function sendEmail({ smtpConfig, recipient, messageConfig, proxyConfig }) {
    let transporterConfig = {};

    // 1. Configure Transporter
    if (smtpConfig.type === "gmail_api") {
        transporterConfig = {
            service: "gmail",
            auth: {
                type: "OAuth2",
                user: smtpConfig.user,
                clientId: smtpConfig.clientId,
                clientSecret: smtpConfig.clientSecret,
                refreshToken: smtpConfig.refreshToken,
            },
        };
    } else {
        transporterConfig = {
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.port == 465, // true for 465, false for other ports
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.pass,
            },
            name: smtpConfig.hostname || "laptop.home",
        };
    }

    // 2. Setup Proxy if needed
    if (proxyConfig) {
        try {
            const info = await SocksClient.createConnection({
                proxy: {
                    host: proxyConfig.host,
                    port: proxyConfig.port,
                    type: 5,
                    userId: proxyConfig.username, // SocksClient uses userId instead of username
                    password: proxyConfig.password,
                },
                command: "connect",
                destination: {
                    host:
                        transporterConfig.host ||
                        (transporterConfig.service === "gmail"
                            ? "smtp.gmail.com"
                            : "localhost"),
                    port:
                        transporterConfig.port || (transporterConfig.secure ? 465 : 587),
                },
            });
            console.log("   ✅ Proxy tunnel established via " + proxyConfig.host);
            transporterConfig.stream = info.socket;
        } catch (proxyErr) {
            console.error("   ❌ Proxy Connection Failed:", proxyErr.message);
            throw new Error(`Proxy tunnel failed: ${proxyErr.message}`);
        }
    }

    // 3. Create Transporter
    const transporter = nodemailer.createTransport(transporterConfig);

    // 4. Prepare Mail Options
    const mailOptions = {
        from: `"${smtpConfig.senderName || smtpConfig.user}" <${smtpConfig.user}>`,
        to: recipient.email,
        subject: processTags(messageConfig.subject, recipient),
        text: processTags(messageConfig.text || "", recipient),
        html: processTags(messageConfig.html || "", recipient),
        headers: messageConfig.headers || {},
        attachments: messageConfig.attachments || [],
    };

    // 5. Send
    const info = await transporter.sendMail(mailOptions);
    return info;
}

module.exports = { sendEmail, processTags };
