const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Connect to Supabase
const SUPABASE_URL = "https://fnnurbqyyhabwmquntlm.supabase.co"; // Using hardcoded based on server.js
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper to check for Admin (Reusing logic concept)
// For routes here, we'll rely on simple userId checks or assume middleware handles auth if added later.

// ==========================================
// 1. SERVER MARKETPLACE ENDPOINTS
// ==========================================

// Get available servers to rent (Public/User)
router.get("/servers/available", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("servers")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;
        res.json({ servers: data || [] });
    } catch (err) {
        console.error("Error fetching available servers:", err.message);
        res.status(500).json({ message: "Error fetching market" });
    }
});

// ADMIN: Add a new server
router.post("/admin/servers", async (req, res) => {
    const { ip, port, username, password, provider, country, price } = req.body;

    // Basic validation
    if (!ip || !port) return res.status(400).json({ message: "IP and Port required" });
    try {
        const { data, error } = await supabase
            .from("servers")
            .insert({
                ip,
                port,
                username,
                password,
                provider: provider || "Unknown",
                country: country || "Global",
                price: price || 10
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ message: "✅ Server added to inventory", server: data });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ADMIN: Bulk Add Servers (For importing Webshare CSV/TXT)
router.post("/admin/servers/bulk", async (req, res) => {
    const { servers } = req.body; // Expects array of { ip, port, username, password ... }
    if (!servers || !Array.isArray(servers)) return res.status(400).json({ message: "Invalid format" });

    try {
        const { data, error } = await supabase
            .from("servers")
            .insert(servers.map(s => ({
                ip: s.ip,
                port: s.port,
                username: s.username,
                password: s.password,
                provider: s.provider || "Webshare",
                country: s.country || "Global",
                price: 1.5 // Default price for imported premium proxies
            })))
            .select();

        if (error) throw error;
        res.json({ message: `✅ Imported ${data.length} servers`, servers: data });
    } catch (err) {
        console.error("Bulk Import Error:", err);
        res.status(500).json({ message: "Failed to import servers" });
    }
});

// ADMIN: Delete a server
router.delete("/admin/servers/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase.from("servers").delete().eq("id", id);
        if (error) throw error;
        res.json({ message: "🗑️ Server removed" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get my rented servers
router.get("/servers/my-servers", async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: "userId required" });

    const { data, error } = await supabase
        .from("rented_servers")
        .select("*")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString()); // Only active

    if (error && error.code !== "PGRST116") { // Ignore 'no rows' specific errors if any, but properly handle DB error
        console.error("Error fetching servers:", error);
        return res.status(500).json({ message: "Error fetching servers" });
    }

    res.json({ servers: data || [] });
});

// Rent a server
router.post("/servers/rent", async (req, res) => {
    const { userId, serverId, durationHours } = req.body;

    console.log("👉 Rent Request:", { userId, serverId });

    // 1. Find server details from DB
    const { data: server, error: srvError } = await supabase
        .from("servers")
        .select("*")
        .eq("id", serverId)
        .single();

    if (srvError || !server) return res.status(404).json({ message: "Server not found in inventory" });

    const cost = server.price * (durationHours || 1);

    // 2. Check Balance
    const { data: userLimit, error: userError } = await supabase
        .from("user_limits")
        .select("usdt_balance")
        .eq("id", userId)
        .single();

    if (userError || !userLimit) {
        console.error("❌ Rent User Lookup Error:", userError);
        return res.status(404).json({ message: "User not found" });
    }
    if (userLimit.usdt_balance < cost) {
        return res.status(403).json({ message: `Insufficient balance. Required: ${cost}` });
    }

    // 3. Deduct Balance
    await supabase
        .from("user_limits")
        .update({ usdt_balance: userLimit.usdt_balance - cost })
        .eq("id", userId);

    // 4. Record Purchase / Assign Server
    // Note: For demo, we are "creating" a new rented server record.
    // In real life, you'd mark an inventory item as 'rented'.
    const expiresAt = new Date(Date.now() + (durationHours || 1) * 60 * 60 * 1000);

    const { data: rented, error: rentError } = await supabase
        .from("rented_servers")
        .insert({
            user_id: userId,
            server_id: server.id,
            ip: server.ip,
            port: server.port,
            username: "proxy_user", // Demo credentials
            password: "proxy_password",
            expires_at: expiresAt,
            cost_paid: cost
        })
        .select()
        .single();

    if (rentError) {
        console.error("Rent error:", rentError);
        return res.status(500).json({ message: "Failed to rent server" });
    }

    res.json({ message: "Server rented successfully", server: rented });
});


// Rent MULTIPLE servers (Bulk Pack)
router.post("/servers/rent-quantity", async (req, res) => {
    const { userId, quantity, durationHours } = req.body;

    if (!quantity || quantity < 1) return res.status(400).json({ message: "Invalid quantity" });

    // 1. Fetch Inventory
    const { data: allServers, error: srvError } = await supabase
        .from("servers")
        .select("*");

    if (srvError || !allServers || allServers.length < quantity) {
        return res.status(400).json({ message: `Not enough servers available. (Available: ${allServers?.length || 0})` });
    }

    // 2. Pick Random Servers (Fisher-Yates Shuffle or simple random sort)
    // Note: In real production, this should check if user already rented them to avoid duplicates, 
    // but for now we assume proxies can be extended or re-rented.
    const shuffled = allServers.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, quantity);

    // 3. Calculate Cost
    // Assuming mostly uniform pricing, but let's sum exact prices of selected
    const totalCost = selected.reduce((sum, srv) => sum + (srv.price * (durationHours || 1)), 0);

    // 4. Check Balance
    const { data: userLimit, error: userError } = await supabase
        .from("user_limits")
        .select("usdt_balance")
        .eq("id", userId)
        .single();

    if (userError || !userLimit) return res.status(404).json({ message: "User not found" });

    if (userLimit.usdt_balance < totalCost) {
        return res.status(403).json({ message: `Insufficient balance. Available: ${userLimit.usdt_balance.toFixed(2)}, Required: ${totalCost.toFixed(2)}` });
    }

    // 5. Deduct Balance
    const { error: deductError } = await supabase
        .from("user_limits")
        .update({ usdt_balance: userLimit.usdt_balance - totalCost })
        .eq("id", userId);

    if (deductError) return res.status(500).json({ message: "Transaction failed" });

    // 6. Assign Servers
    const expiresAt = new Date(Date.now() + (durationHours || 1) * 60 * 60 * 1000);
    const rentRecords = selected.map(server => ({
        user_id: userId,
        server_id: server.id,
        ip: server.ip,
        port: server.port,
        username: server.username || "proxy_user",
        password: server.password || "proxy_pass",
        expires_at: expiresAt,
        cost_paid: server.price * (durationHours || 1)
    }));

    const { data: rented, error: rentError } = await supabase
        .from("rented_servers")
        .insert(rentRecords)
        .select();

    if (rentError) {
        // Critical: Money was deducted but rent failed!
        // In real app, consider transaction rollback or refund here.
        console.error("Bulk Rent Insert Error:", rentError);
        return res.status(500).json({ message: "Failed to assign servers, please contact support." });
    }

    res.json({
        message: `Successfully rented ${rented.length} servers for ${durationHours} hours`,
        servers: rented
    });
});


// Rent ALL (Special Plans)
router.post("/servers/rent-plan", async (req, res) => {
    const { userId, planId } = req.body;

    let durationHours = 0;
    let cost = 0;

    // Define Plans
    if (planId === "1h_pack") {
        durationHours = 1;
        cost = 2.0;
    } else if (planId === "3h_pack") {
        durationHours = 3;
        cost = 3.5;
    } else {
        return res.status(400).json({ message: "Invalid Plan ID" });
    }

    // 1. Fetch Inventory (ALL)
    const { data: allServers, error: srvError } = await supabase
        .from("servers")
        .select("*");

    if (srvError || !allServers || allServers.length === 0) {
        return res.status(400).json({ message: "No servers available to rent." });
    }

    // 2. Check Balance
    const { data: userLimit, error: userError } = await supabase
        .from("user_limits")
        .select("usdt_balance")
        .eq("id", userId)
        .single();

    if (userError || !userLimit) return res.status(404).json({ message: "User not found" });

    if (userLimit.usdt_balance < cost) {
        return res.status(403).json({ message: `Insufficient balance. Available: ${userLimit.usdt_balance.toFixed(2)}, Required: ${cost.toFixed(2)}` });
    }

    // 3. Deduct Balance
    const { error: deductError } = await supabase
        .from("user_limits")
        .update({ usdt_balance: userLimit.usdt_balance - cost })
        .eq("id", userId);

    if (deductError) return res.status(500).json({ message: "Transaction failed" });

    // 4. Assign Servers
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    const rentRecords = allServers.map(server => ({
        user_id: userId,
        server_id: server.id,
        ip: server.ip,
        port: server.port,
        username: server.username || "proxy_user",
        password: server.password || "proxy_password",
        expires_at: expiresAt,
        cost_paid: cost / allServers.length // Distributed cost for record keeping (optional)
    }));

    const { data: rented, error: rentError } = await supabase
        .from("rented_servers")
        .insert(rentRecords)
        .select();

    if (rentError) {
        console.error("Rent Plan Error:", rentError);
        return res.status(500).json({ message: "Failed to assign servers. Contact Support." });
    }

    res.json({
        message: `Successfully rented ALL ${rented.length} servers for ${durationHours} hours`,
        servers: rented
    });
});


// ==========================================
// 2. SENDING ENGINE (THE CORE)
// ==========================================

router.post("/send-batch", async (req, res) => {
    const { userId, serverId: rawServerId, smtpConfig: rawConfig, messageConfig, recipient } = req.body;

    // SAFEGUARD: Force direct if 'direct' (case-insensitive) or falsy
    let serverId = rawServerId;
    if (!serverId || String(serverId).toLowerCase().trim() === "direct" || String(serverId) === "undefined") {
        serverId = "direct";
    }

    // Capture logs to file because console checks are failing
    const fs = require('fs');
    fs.appendFileSync('debug_log.txt', `[${new Date().toISOString()}] Payload: ` + JSON.stringify({
        userId, rawServerId, resolvedServerId: serverId, recipient: recipient.email
    }) + "\n");

    // Normalize config keys (Host -> host, Port -> port) AND sanitize values
    const smtpConfig = {};
    if (rawConfig) {
        Object.keys(rawConfig).forEach(k => {
            const key = k.toLowerCase().trim();
            const val = rawConfig[k];

            // Trim strings
            if (typeof val === 'string') {
                smtpConfig[key] = val.trim();
            } else {
                smtpConfig[key] = val;
            }
        });
    }

    // Ensure port is a number
    if (smtpConfig.port) {
        smtpConfig.port = parseInt(smtpConfig.port, 10);
    }


    console.log(`📧 Sending to ${recipient.email} via ${smtpConfig.type} (Server: ${serverId || "Direct"})`);

    try {
        // 1. Check Server Type (Proxy vs Agent)
        let serverType = "proxy"; // default
        let serverUrl = "";
        let serverSecret = "my_secret_key"; // In prod, store this in DB per server
        let fetchedServer = null; // Store the fetched server for later use

        if (serverId && serverId !== "direct") {
            const { data: server } = await supabase
                .from("rented_servers") // or 'servers' depending on flow
                .select("*")
                .eq("id", serverId)
                .single();

            if (server) {
                fetchedServer = server;
                // Check if it's an agent (you might need to add a 'type' column to your DB, or assume based on port 3000)
                // For now, let's assume if port is 3000, it's an agent.
                if (parseInt(server.port) === 3000 || server.type === 'agent') {
                    serverType = "agent";
                    serverUrl = `http://${server.ip}:${server.port}`;
                    serverSecret = server.password || "my_secret_key"; // Use password field for secret key
                } else {
                    // It's a SOCKS proxy
                    // ... existing proxy setup ...
                    // (We can refactor the existing proxy logic here or leave it)
                }
            }
        }

        // 2. DISPATCH
        if (serverType === "agent") {
            const axios = require('axios');
            console.log(`🚀 Dispatching to Remote Agent: ${serverUrl}`);

            // Prepare Payload for Agent
            const agentPayload = {
                smtpConfig: {
                    host: smtpConfig.host,
                    port: smtpConfig.port,
                    secure: smtpConfig.port == 465,
                    user: smtpConfig.user,
                    pass: smtpConfig.pass
                },
                mailOptions: {
                    from: `"${smtpConfig.senderName || smtpConfig.user}" <${smtpConfig.user}>`,
                    to: recipient.email,
                    subject: processTags(messageConfig.subject, recipient),
                    subject: processTags(messageConfig.subject, recipient),
                    html: processTags(messageConfig.html || messageConfig.text, recipient), // Agent expects html/text
                    attachments: messageConfig.attachments || [] // Pass attachments
                }
            };

            const agentRes = await axios.post(`${serverUrl}/send`, agentPayload, {
                headers: { 'Authorization': `Bearer ${serverSecret}` }
            });

            res.json(agentRes.data);
            return; // DONE
        }

        // ... FALLBACK TO EXISTING LOCAL SENDING (Direct or SOCKS Proxy) ...
        let transporterConfig = {};
        // ... (Existing Transporter Logic) ...
        let proxyAgent = null;
        if (serverId && serverId !== "direct") {
            // Use the already fetched server if available, otherwise fetch again (less efficient but safer)
            const proxyServer = fetchedServer || (await supabase
                .from("rented_servers")
                .select("*")
                .eq("id", serverId)
                .single()).data;

            if (proxyServer && proxyServer.type !== 'agent' && parseInt(proxyServer.port) !== 3000) {
                console.log(`   Tunneling via ${proxyServer.ip}`);
                proxyAgent = {
                    host: proxyServer.ip,
                    port: parseInt(proxyServer.port),
                    userId: proxyServer.username,
                    password: proxyServer.password
                };
            }
        }

        // B. TRANSPORTER CONFIGURATION
        if (smtpConfig.type === "gmail_api") {
            // 1. Gmail API (OAuth2)
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
            // 2. Standard SMTP
            transporterConfig = {
                host: smtpConfig.host,
                port: smtpConfig.port,
                secure: smtpConfig.port == 465, // true for 465, false for other ports
                auth: {
                    user: smtpConfig.user,
                    pass: smtpConfig.pass,
                },
                // HOSTNAME (HELO/EHLO) Config
                name: smtpConfig.hostname || "laptop.home", // Default if missing
            };
        }

        // Attach Proxy Agent if it exists
        if (proxyAgent) {
            transporterConfig.proxies = true; // Nodemailer requires this flag? Actually usually we just set 'agent' in 'streamTransport' or similar. 
            // Correct way for Nodemailer + Proxy Agent:
            // Note: Nodemailer 'smtp' transport supports 'connectionUrl' or 'socket' properties, but 'socks-proxy-agent' is a 'http.Agent' like.
            // Actually standard nodemailer way:
            transporterConfig = {
                ...transporterConfig, ...{
                    // We need to override the connection, usually via 'agent' property in pooled mode or creating a custom transport.
                    // However, for simple usage:
                }
            };
            // Re-doing configuration for Proxy support:
            // Nodemailer doesn't natively support SOCKS5 agent in the top level config easily without the 'proxies' option or custom lookup.
            // BUT: 'socks-proxy-agent' works by patching `http`. 
            // BETTER WAY: Use `socks` directly or just pass the agent to the connection options.

            // Let's use the 'agent' field for 'http' or 'socket' field.
            // Actually, nodemailer allows us to pass a 'stream' or 'socket'.
            // EASIER: With the `socks` package alone, we can create a connection and pass it.

            // BUT 'socks-proxy-agent' is meant for HTTP requests.
            // Let's assume standard SMTP transport for now. 
            // If we need proxying, we set:
            // transporterConfig.proxy = connectionString; // if using a package wrapper, but native nodemailer doesn't have 'proxy'.

            // We will set the 'pool' to true and use 'socket' if we were advanced.
            // FOR NOW: We will use the 'socks' library to establish the connection first, then pass it to Nodemailer.
            // This is the most robust way.
        }

        // C. CREATE TRANSPORTER
        let transporter;

        if (proxyAgent) {
            // Real SOCKS5 Connection using 'socks' library
            try {
                const { SocksClient } = require('socks');

                // 1. Establish the SOCKS5 connection to the Proxy
                // The destination is the SMTP server we want to reach (e.g. smtp.gmail.com:465)
                const info = await SocksClient.createConnection({
                    proxy: {
                        host: proxyAgent.host,
                        port: proxyAgent.port,
                        type: 5,
                        userId: proxyAgent.userId,
                        password: proxyAgent.password
                    },
                    command: 'connect',
                    destination: {
                        host: transporterConfig.host || (transporterConfig.service === 'gmail' ? 'smtp.gmail.com' : 'localhost'),
                        port: transporterConfig.port || (transporterConfig.secure ? 465 : 587)
                    }
                });

                console.log("   ✅ Proxy tunnel established via " + proxyAgent.host);

                // 2. Pass the established socket to Nodemailer
                // Nodemailer will use this existing socket instead of creating a new direct one
                transporterConfig.stream = info.socket;
                transporter = nodemailer.createTransport(transporterConfig);

            } catch (proxyErr) {
                console.error("   ❌ Proxy Connection Failed:", proxyErr.message);
                throw new Error(`Proxy tunnel failed: ${proxyErr.message}`);
            }

        } else {
            // Direct Connection
            transporter = nodemailer.createTransport(transporterConfig);
        }

        // D. PREPARE EMAIL
        const mailOptions = {
            from: `"${smtpConfig.senderName || smtpConfig.user}" <${smtpConfig.user}>`, // "John Doe" <john@example.com>
            to: recipient.email,
            subject: processTags(messageConfig.subject, recipient),
            text: processTags(messageConfig.text || "", recipient),
            html: processTags(messageConfig.html || "", recipient),
            html: processTags(messageConfig.html || "", recipient),
            headers: messageConfig.headers || {}, // { 'X-My-Header': '123' }
            attachments: messageConfig.attachments || []
        };

        // E. SEND
        const info = await transporter.sendMail(mailOptions);

        // Log success (mock DB insert if needed)
        console.log(`✅ Sent messageId: ${info.messageId}`);

        // Track usage in RDP server if used?

        res.json({
            success: true,
            messageId: info.messageId,
            accepted: info.accepted
        });

    } catch (error) {
        console.error("❌ Send Error:", error);
        console.error("❌ Stack:", error.stack);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Helper: Process basic tags
function processTags(template, recipient) {
    if (!template) return "";
    let output = template;
    // Standard tags
    output = output.replace(/{{\s*email\s*}}/gi, recipient.email || "");
    output = output.replace(/{{\s*name\s*}}/gi, recipient.name || "Friend");
    output = output.replace(/{{\s*id\s*}}/gi, recipient.id || ""); // If randomly generated frontend side

    // Custom columns
    output = output.replace(/{{\s*c3\s*}}/gi, recipient.c3 || "");
    output = output.replace(/{{\s*c4\s*}}/gi, recipient.c4 || "");
    output = output.replace(/{{\s*c5\s*}}/gi, recipient.c5 || "");
    output = output.replace(/{{\s*c6\s*}}/gi, recipient.c6 || "");

    return output;
}

module.exports = router;
