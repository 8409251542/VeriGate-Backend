const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'my_secret_key'; // CHANGE THIS

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Auth Middleware
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${SECRET_KEY}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

app.get('/', (req, res) => {
    res.send('Mail Agent is Running. 🚀');
});

app.post('/send', authenticate, async (req, res) => {
    try {
        const { smtpConfig, mailOptions } = req.body;

        if (!smtpConfig || !mailOptions) {
            return res.status(400).json({ success: false, message: 'Missing config or mail options' });
        }

        console.log(`📧 Sending email to ${mailOptions.to}`);

        // Create Transporter (Local Connection from RDP)
        const transporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure, // true for 465, false for other ports
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.pass,
            },
            tls: {
                rejectUnauthorized: false // Often needed for self-signed or quirky servers
            }
        });

        // Send
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Sent! ID: ${info.messageId}`);

        res.json({
            success: true,
            messageId: info.messageId,
            accepted: info.accepted
        });

    } catch (error) {
        console.error('❌ Send Error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 RDP Mail Agent running on port ${PORT}`);
    console.log(`🔒 Secret Key: ${SECRET_KEY}`);
    console.log(`👉 Usage: POST http://YOUR_RDP_IP:${PORT}/send`);
});
