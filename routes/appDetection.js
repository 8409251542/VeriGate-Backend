const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const FormData = require('form-data');
require('dotenv').config();

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL || 'https://fnnurbqyyhabwmquntlm.supabase.co', process.env.SUPABASE_KEY);

const upload = multer({ dest: 'uploads/' });

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

const PRICE_PER_10K = 10; // USDT

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

        const appTypeId = APP_TYPES[appType];
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

        // Calculate Cost
        // 10 USDT per 10,000 numbers -> (count / 10000) * 10 = count / 1000
        const cost = (count / 10000) * PRICE_PER_10K;

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
        const uploadFilePath = `uploads/temp_${Date.now()}.txt`;
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

        // Save Task to History (Optional but good for tracking)
        await supabase.from('verification_history').insert({
            user_id: userId,
            total_uploaded: count,
            unique_count: count,
            file_path: apiData.DATA.sendID, // Storing sendID temporarily in file_path or create new column
            created_at: new Date(),
            // You might want to add a 'type' column to verification_history to distinguish 'app-detect' from 'numverify'
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
