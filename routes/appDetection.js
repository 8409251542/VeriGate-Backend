const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const FormData = require('form-data');
// require('dotenv').config();

// Initialize Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fnnurbqyyhabwmquntlm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let supabase;
if (SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.warn("⚠️ appDetection: SUPABASE_KEY is missing.");
    supabase = {
        from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }) }) }), update: () => ({ eq: () => Promise.resolve({ error: { message: "Supabase not configured" } }) }), insert: () => Promise.resolve({ error: { message: "Supabase not configured" } }) })
    };
}

const upload = multer({ dest: '/tmp/' });

// App Type Mapping from "app detection.txt"
const APP_TYPES = {
    "Viber": "7A4A66DB1B7B7777",
    "Zalo": "431039DC0568D3FD",
    "Botim": "E6C1CD22E635B389",
    "Momo": "8F9C50C219F0A753",
    "Signal": "34BAB86C9897A388",
    "Skype": "05BB28449747591E",
    "Snapchat": "AB56BA99E602D53E",
    "Line": "28D47F60DA5B52FC",
    "LinkedIn": "479294A5E232C768",
    "Amazon": "43225FC563E61CCD",
    "WhatsApp": "DE8E6A1F3499B973",
    "Facebook": "4C0F720F3312ED11",
    "Telegram": "C117542A589737A2",
    "Tiktok": "15163739B7ABF4A0",
    "Vk": "06B4A8553F45A5AA",
    "Ios(ss)": "5414E9691D381661",
    "Ios(hc)": "A6A5AD4FE3799ACC",
    "Twitter": "37793CA575B1A088",
    "Band": "67E105CEE89D0630",
    "Rcs": "6A5304366A4FA7DA",
    "Ins": "2A5431403A180C3F",
    "Moniepoint": "63043440C7426539",
    "Coupang": "0C341C9FBB400AED",
    "Line(TW)": "BE0DDD98ADE259BA",
    "Mint": "935070DD7AD94F1C",
    "FBMessage": "B0EDB1FC825A82DC",
    "Microsoft": "52E03A1B05202DD3",
    "Paytm": "F2857CAF00DE8B41",
    "Hh": "FF95420F573EE18C",
    "Sideline": "CEB40A1B4CB1B53B",
    "check24": "D87676F4886C51B7",
    "Gate": "E35ACFDF9D3818E4",
    "RummyCircle": "F99AC658445EF4AA",
    "Cian": "171AB1A35B96A224",
    "Htx": "601542C48B65984C",
    "Magicbricks": "AE14669246504",
    "Flipkart": "7075F7597A20271",
    "Binance": "C45C6F4056742B7A",
    "Bybit": "45A1AB2D8F5DC36E",
    "CoinW": "273656BF37FD74D2",
    "Kucoin": "6B1755703E4CCA29",
    "OKX": "DCA6092CABB61351",
    "Xt": "0B770E957AA8BC66",
    "Bitmart": "C240330073B15769",
    "WS Business": "7C116CFB603BC227",
    "DHL": "8758259A688D28E8",
    "Shopee": "0CD75C4F6C7D412F",
    "GroupMe": "FDBF47DB6455672A"
};

const SERVICE_POINTS = {
    "Number status detection": 3.571,
    "TG status detection": 4.286,
    "TG days detection": 4.286,
    "TG senior detection": 14.285,
    "Number active detection": 5.715,
    "Ws status detection": 0.115,
    "Ws business detection": 0.55,
    "Ws days detection": 2.142,
    "Ws senior detection": 7.143,
    "Ios status dynamics detection": 2.586,
    "Ios status static detection": 2.143,
    "Zalo status detection": 2.143,
    "Zalo senior detection": 11.429,
    "Rcs status detection": 2.857,
    "Line status detection": 7.143,
    "Line senior detection": 10.0,
    "Fb status detection": 0.714,
    "FbEmail status detection": 0.714,
    "Viber status detection": 1.429,
    "Viber days detection": 7.143,
    "Binance status detection": 7.15,
    "BinanceEmail status detection": 29.52,
    "Okx status detection": 10.0,
    "Kucoin status detection": 7.15,
    "KucoinEmail status detection": 7.15,
    "CoinW status detection": 2.857,
    "CoinWEmail status detection": 2.857,
    "Bybit status detection": 7.15,
    "Htx status detection": 5.0,
    "HtxEmail detection": 5.0,
    "LPLFinancialEmail status detection": 7.14,
    "Hh status detection": 1.429,
    "Amazon status detection": 4.286,
    "AmazonEmail status detection": 4.286,
    "ins status detection": 0.714,
    "insEmail status detection": 0.714,
    "Microsoft status detection": 2.857,
    "MicrosoftEmail status detection": 2.857,
    "Twitter status detection": 1.429,
    "TwitterEmail status detection": 1.429,
    "Imo status detection": 20.83,
    "Band status detection": 4.287,
    "Moniepoint status detection": 4.286,
    "Ccoupang status detection": 3.571,
    "Momo status detection": 4.286,
    "Signal status detection": 4.286,
    "Botim status detection": 7.143,
    "Tk status detection": 7.143,
    "Vk status detection": 7.143,
    "Cian status detection": 1.143,
    "RummyCircle status detection": 2.857,
    "Check24 status detection": 1.429,
    "Sideline status detection": 1.429,
    "Linkedln status detection": 7.143,
    "NetflixEmail status detection": 7.14,
    "OutlookEmail verification": 0.714,
    "YahooEmail verification": 0.714,
    "Mail.ruEmail verification": 0.714,
    "Carrier status detection": 5.714,
    "Shopee status detection": 2.142,
    "DHL status detection": 1.429,
    "GroupMe status detection": 2.142,
    "FB Messager status detection": 2.857,
    "Paytm status detection": 4.286,
    "Flipkart status detection": 1.15,
    "Magicbricks status detection": 4.286
};

// Map user-friendly names to API keys
const NAME_TO_KEY = {
    "Viber status detection": "Viber",
    "Zalo status detection": "Zalo",
    "Botim status detection": "Botim",
    "Momo status detection": "Momo",
    "Signal status detection": "Signal",
    "Line status detection": "Line",
    "Linkedln status detection": "LinkedIn",
    "Amazon status detection": "Amazon",
    "Fb status detection": "Facebook",
    "TG status detection": "Telegram",
    "Vk status detection": "Vk",
    "Twitter status detection": "Twitter",
    "Band status detection": "Band",
    "Rcs status detection": "Rcs",
    "ins status detection": "Ins",
    "Moniepoint status detection": "Moniepoint",
    "Ccoupang status detection": "Coupang",
    "Microsoft status detection": "Microsoft",
    "Paytm status detection": "Paytm",
    "Hh status detection": "Hh",
    "Sideline status detection": "Sideline",
    "Check24 status detection": "check24",
    "RummyCircle status detection": "RummyCircle",
    "Cian status detection": "Cian",
    "Htx status detection": "Htx",
    "Magicbricks status detection": "Magicbricks",
    "Flipkart status detection": "Flipkart",
    "Binance status detection": "Binance",
    "Bybit status detection": "Bybit",
    "CoinW status detection": "CoinW",
    "Kucoin status detection": "Kucoin",
    "Okx status detection": "OKX",
    "Shopee status detection": "Shopee",
    "DHL status detection": "DHL",
    "GroupMe status detection": "GroupMe",
    "FB Messager status detection": "FBMessage",
    "Ios status dynamics detection": "Ios(hc)",
    "Ios status static detection": "Ios(ss)"
};

const PRICE_PER_10K = 12.5; // USDT

// Helper to parse file and get numbers
async function parseFile(filePath, ext) {
    let numbers = [];
    if (ext === 'csv') {
        numbers = await new Promise((resolve, reject) => {
            const arr = [];
            fs.createReadStream(filePath)
                .pipe(csv({ headers: false }))
                .on('data', (row) => {
                    let phone = row[Object.keys(row)[0]];
                    if (phone) arr.push(phone.toString().trim());
                })
                .on('end', () => resolve(arr))
                .on('error', reject);
        });
    } else if (ext === 'xlsx' || ext === 'xls') {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        numbers = sheet.map(row => row[0]).filter(Boolean).map(n => n.toString().trim());
    } else if (ext === 'txt') {
        const content = fs.readFileSync(filePath, 'utf8');
        numbers = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    }
    return numbers;
}

// POST /api/app-detect/upload
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { userId, appType } = req.body;
        const file = req.file;

        if (!file || !userId || !appType) {
            return res.status(400).json({ message: 'Missing file, userId, or appType' });
        }

        const apiKey = NAME_TO_KEY[appType] || appType;
        const appTypeId = APP_TYPES[apiKey];
        if (!appTypeId) {
            return res.status(400).json({ message: 'Invalid App Type' });
        }

        const ext = file.originalname.split('.').pop().toLowerCase();
        const numbers = await parseFile(file.path, ext);
        const uniqueNumbers = [...new Set(numbers)]; // Dedup
        const count = uniqueNumbers.length;

        if (count < 2000) {
            return res.status(400).json({ message: 'File must contain at least 2000 valid numbers' });
        }

        // Calculate Cost Dynamically
        // Formula: (Points / 2.587) * 12.5 per 10k numbers
        const points = SERVICE_POINTS[appType] || 2.587; // Default to base points if not found
        const costPer10k = (points / 2.587) * 12.5;
        const cost = (count / 10000) * costPer10k;

        // Check Balance
        const { data: userLimit, error: limitError } = await supabase
            .from('user_limits')
            .select('usdt_balance')
            .eq('id', userId)
            .single();

        if (limitError || !userLimit) {
            return res.status(404).json({ message: 'User not found' });
        }

        if ((userLimit.usdt_balance || 0) < cost) {
            fs.unlinkSync(file.path); // Clean up
            return res.status(403).json({
                message: `Insufficient balance. Request Cost: $${cost.toFixed(4)}, Available: $${userLimit.usdt_balance.toFixed(4)}`
            });
        }

        // Create Text File for API Upload (One number per line)
        const uploadContent = uniqueNumbers.join('\n');
        const uploadFilePath = `/tmp/temp_${Date.now()}.txt`;
        fs.writeFileSync(uploadFilePath, uploadContent);

        // Upload to External API
        const formData = new FormData();
        formData.append('account', process.env.APP_DETECT_ACCOUNT);
        formData.append('pass', process.env.APP_DETECT_PASS);
        formData.append('type', appTypeId);
        formData.append('file', fs.createReadStream(uploadFilePath));

        const apiRes = await axios.post('http://i.ihmjc.com/api/UploadDx.ashx', formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        // Cleanup temp files
        fs.unlinkSync(file.path);
        fs.unlinkSync(uploadFilePath);

        const apiData = apiRes.data;
        console.log('External API Response:', apiData);

        if (apiData.RES !== "100") {
            return res.status(500).json({ message: 'External API Error', error: apiData.ERR });
        }

        // Deduct Balance ONLY if API success
        const newBalance = userLimit.usdt_balance - cost;
        await supabase
            .from('user_limits')
            .update({ usdt_balance: newBalance })
            .eq('id', userId);

        // Save Task to History (Encoded into file_path due to missing schema columns)
        await supabase.from('verification_history').insert({
            user_id: userId,
            total_uploaded: count,
            unique_count: count,
            file_path: `${appType}|${apiData.DATA.sendID}`, // Format: APP_TYPE|SEND_ID
            created_at: new Date(),
        });

        res.json({
            message: 'File uploaded successfully',
            sendID: apiData.DATA.sendID,
            deductedCost: cost,
            remainingBalance: newBalance,
            count: count
        });

    } catch (error) {
        console.error('App Detect Upload Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});


// POST /api/app-detect/status
router.post('/status', async (req, res) => {
    try {
        const { sendID } = req.body;
        if (!sendID) return res.status(400).json({ message: 'Missing sendID' });

        const params = new URLSearchParams();
        params.append('account', process.env.APP_DETECT_ACCOUNT);
        params.append('pass', process.env.APP_DETECT_PASS);
        params.append('sendID', sendID);

        // API says POST
        const apiRes = await axios.post('http://i.ihmjc.com/api/Query.ashx', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        res.json(apiRes.data);
    } catch (error) {
        res.status(500).json({ message: 'Error checking status', error: error.message });
    }
});

// POST /api/app-detect/download
router.post('/download', async (req, res) => {
    try {
        const { sendID, type } = req.body; // type: 1=zip, 2=active, 3=inactive
        if (!sendID || !type) return res.status(400).json({ message: 'Missing sendID or type' });

        const params = new URLSearchParams();
        params.append('account', process.env.APP_DETECT_ACCOUNT);
        params.append('pass', process.env.APP_DETECT_PASS);
        params.append('sendID', sendID);
        params.append('type', type);

        const apiRes = await axios.post('http://i.ihmjc.com/api/Download.ashx', params.toString(), {
            responseType: 'stream',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Pipe the file to client
        res.setHeader('Content-Disposition', `attachment; filename="result_${sendID}_${type}.txt"`);
        apiRes.data.pipe(res);

    } catch (error) {
        res.status(500).json({ message: 'Error downloading file', error: error.message });
    }
});

module.exports = router;
