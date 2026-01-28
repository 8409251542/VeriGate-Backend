const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
require('dotenv').config();

const ACCOUNT = process.env.APP_DETECT_ACCOUNT || 'VIPShelby';
const PASS = process.env.APP_DETECT_PASS || 'VIPShelby';

async function checkBalance(password, label) {
    console.log(`\nTesting ${label} Password: ${password}`);
    try {
        const params = new URLSearchParams();
        params.append('account', ACCOUNT);
        params.append('pass', password);

        // Try Balance Endpoint
        const res = await axios.post('http://i.ihmjc.com/api/Balance.ashx', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log(`[${label}] Response: ${JSON.stringify(res.data)}`);
        if (res.data.RES === '100') {
            console.log(`✅ SUCCESS! The API requires ${label} password.`);
            return true;
        }
    } catch (err) {
        console.error(`[${label}] Error:`, err.message);
    }
    return false;
}

(async () => {
    console.log("--- Starting API Auth Diagnostic ---");
    console.log("Target: http://i.ihmjc.com/api/Balance.ashx");
    console.log("Account:", ACCOUNT);

    // 1. Try Plain Text
    let success = await checkBalance(PASS, "PLAIN TEXT");

    // 2. Try MD5 (Lower case)
    if (!success) {
        const md5Pass = crypto.createHash('md5').update(PASS).digest('hex').toLowerCase();
        success = await checkBalance(md5Pass, "MD5 (lowercase)");
    }

    // 3. Try MD5 (Upper case)
    if (!success) {
        const md5PassUpper = crypto.createHash('md5').update(PASS).digest('hex').toUpperCase();
        success = await checkBalance(md5PassUpper, "MD5 (uppercase)");
    }

})();
