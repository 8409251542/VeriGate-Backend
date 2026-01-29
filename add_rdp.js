const axios = require('axios');

const IP = '20.84.56.107';
const PORT = 3000;
const SECRET = 'localhost';
const BACKEND_URL = 'http://localhost:5000/api/mymail/admin/servers';

// const fs = require('fs');

function log(msg) {
    console.log(msg);
}

(async () => {
    log("--- RDP Agent Integration Helper ---");

    // 1. Verify RDP Agent Connectivity
    log(`\n1. Checking Agent at http://${IP}:${PORT}...`);
    try {
        const health = await axios.get(`http://${IP}:${PORT}/`, { timeout: 5000 });
        log(`✅ Agent is UP: "${health.data}"`);
    } catch (err) {
        log(`❌ Agent Unreachable: ${err.message}`);
        log("⚠️ Proceeding to add anyway (User might start it later)...");
    }

    // 2. Add to Backend Inventory
    log(`\n2. Adding to Backend Inventory...`);
    try {
        const payload = {
            ip: IP,
            port: PORT,
            username: 'admin',
            password: SECRET,
            provider: 'User RDP',
            country: 'Unknown',
            price: 10,
            type: 'agent'
        };

        const res = await axios.post(BACKEND_URL, payload);
        log(`✅ Server Added! ID: ${res.data.server?.id || '?'}`);
        log("Response: " + JSON.stringify(res.data));

    } catch (err) {
        log(`❌ Verified usage failed: ${err.message}`);
        if (err.code === 'ECONNREFUSED') {
            log("   -> Is your Backend Server running on port 5000?");
        }
    }
})();
