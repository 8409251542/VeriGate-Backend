const axios = require('axios');

const API_URL = "http://localhost:5000/api/mymail";
// UUID seen in previous logs
const TARGET_USER_ID = "7c6558da-5a92-4e1b-9271-586d126c034c";

// const fs = require('fs');
function log(msg) {
    console.log(msg);
}

(async () => {
    log(`--- Checking Rentals for User: ${TARGET_USER_ID} ---`);
    log(`Endpoint: ${API_URL}/servers/my-servers`);

    try {
        const res = await axios.get(`${API_URL}/servers/my-servers?userId=${TARGET_USER_ID}`);
        log("\n✅ API Response Status: " + res.status);
        if (res.data.servers && res.data.servers.length > 0) {
            log(`🎉 Found ${res.data.servers.length} Active Servers:`);
            log(JSON.stringify(res.data.servers, null, 2));
        } else {
            log("⚠️ No active servers found in response (servers array is empty).");
            log("Response Data: " + JSON.stringify(res.data));
        }
    } catch (err) {
        log("❌ API Error: " + err.message);
        if (err.response) {
            log("   Status: " + err.response.status);
            log("   Data: " + JSON.stringify(err.response.data));
        }
        if (err.code === 'ECONNREFUSED') {
            log("   -> Backend Server seems DOWN!");
        }
    }
})();
