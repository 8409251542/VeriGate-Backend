const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

// Configuration
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Defaults to dry run for safety, set to false to write
const MAPPING_FILE_PATH = path.join(__dirname, 'mapping.json');

async function main() {
    console.log(`[Merge] Starting data merge process... (DRY_RUN = ${DRY_RUN})`);

    // 1. Load existing mapping.json
    let existingMapping = {};
    if (fs.existsSync(MAPPING_FILE_PATH)) {
        console.log(`[Merge] Loading existing mapping.json from ${MAPPING_FILE_PATH}...`);
        const start = Date.now();
        existingMapping = JSON.parse(fs.readFileSync(MAPPING_FILE_PATH, 'utf8'));
        console.log(`[Merge] Loaded existing mapping in ${((Date.now() - start) / 1000).toFixed(2)}s`);
    } else {
        console.warn(`[Merge] WARNING: Existing mapping.json not found. A new mapping file will be generated.`);
    }

    // 2. Identify new CSV files in the same directory
    const files = fs.readdirSync(__dirname).filter(f => f.startsWith('converted-') && f.endsWith('.csv'));
    console.log(`[Merge] Found ${files.length} new CSV files in utils folder:`, files);

    if (files.length === 0) {
        console.log('[Merge] No new CSV files to process. Exiting.');
        return;
    }

    // Aggregated structure: { cp: { prefix: { carriers: { name: count }, types: { name: count } } } }
    const newAgg = {};
    let totalRowsProcessed = 0;
    let totalInvalidRows = 0;

    // 3. Process each CSV file
    for (const file of files) {
        const filePath = path.join(__dirname, file);
        console.log(`[Merge] Reading ${file}...`);
        const fileContent = fs.readFileSync(filePath, 'utf8');

        console.log(`[Merge] Parsing ${file} with PapaParse...`);
        const parsed = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true
        });

        console.log(`[Merge] Aggregating ${parsed.data.length} rows from ${file}...`);

        parsed.data.forEach((row, idx) => {
            totalRowsProcessed++;
            const e164 = (row.e164 || '').trim();
            if (!e164) {
                totalInvalidRows++;
                return;
            }

            // Parse with libphonenumber-js
            const phoneNumber = parsePhoneNumberFromString(e164);
            if (!phoneNumber || !phoneNumber.isValid()) {
                totalInvalidRows++;
                return;
            }

            const cp = phoneNumber.countryCallingCode;
            const nationalNumber = phoneNumber.nationalNumber;

            // Prefix Logic: US/Canada (+1) -> 6 digits, Others -> 4 digits
            const prefixLen = (cp === '1') ? 6 : 4;
            if (nationalNumber.length < prefixLen) {
                totalInvalidRows++;
                return;
            }

            const prefix = nationalNumber.substring(0, prefixLen);

            // Standardize carrier name
            let carrier = String(row.carrier || '').trim();
            if (!carrier) carrier = 'Unknown';

            // Standardize line type
            let type = String(row.type || 'unknown').trim().toLowerCase();
            if (type === 'fixed_line' || type === 'fixed_line_or_mobile') {
                type = 'landline';
            }

            // Initialize aggregation objects
            if (!newAgg[cp]) newAgg[cp] = {};
            if (!newAgg[cp][prefix]) {
                newAgg[cp][prefix] = {
                    carriers: {},
                    types: {}
                };
            }

            newAgg[cp][prefix].carriers[carrier] = (newAgg[cp][prefix].carriers[carrier] || 0) + 1;
            newAgg[cp][prefix].types[type] = (newAgg[cp][prefix].types[type] || 0) + 1;
        });
    }

    console.log(`\n[Merge] Statistics after parsing CSVs:`);
    console.log(`  - Total raw CSV rows processed: ${totalRowsProcessed}`);
    console.log(`  - Total invalid / skipped rows: ${totalInvalidRows}`);

    // 4. Resolve aggregated new mappings using selection logic
    const newResolvedMapping = {};
    let totalResolvedPrefixes = 0;

    for (const cp in newAgg) {
        newResolvedMapping[cp] = {};
        for (const prefix in newAgg[cp]) {
            totalResolvedPrefixes++;
            const carriers = newAgg[cp][prefix].carriers;
            const types = newAgg[cp][prefix].types;

            // Selection Logic:
            // 1. Pick the most frequent type
            const type = Object.keys(types).reduce((a, b) => types[a] > types[b] ? a : b);

            // 2. Pick the most frequent carrier, BUT prefer non-"Unknown" if available
            let carrier = "Unknown";
            const sortedCarriers = Object.keys(carriers).sort((a, b) => carriers[b] - carriers[a]);
            const nonUnknown = sortedCarriers.filter(c => c.toLowerCase() !== "unknown" && c !== "");
            if (nonUnknown.length > 0) {
                carrier = nonUnknown[0];
            } else {
                carrier = sortedCarriers[0] || "Unknown";
            }

            newResolvedMapping[cp][prefix] = { carrier, type };
        }
    }

    console.log(`  - Total unique prefixes resolved: ${totalResolvedPrefixes}`);

    // 5. Merge into existing mapping
    let mergedCount = 0;
    let newCount = 0;

    for (const cp in newResolvedMapping) {
        if (!existingMapping[cp]) {
            existingMapping[cp] = {};
        }

        for (const prefix in newResolvedMapping[cp]) {
            if (existingMapping[cp][prefix]) {
                mergedCount++;
            } else {
                newCount++;
            }
            existingMapping[cp][prefix] = newResolvedMapping[cp][prefix];
        }
    }

    console.log(`\n[Merge] Merge Results:`);
    console.log(`  - Overwritten existing prefixes: ${mergedCount}`);
    console.log(`  - Added completely new prefixes: ${newCount}`);

    // Print some examples for validation
    console.log(`\n[Merge] Validation Examples from Merged Data:`);
    let samplePrinted = 0;
    for (const cp in newResolvedMapping) {
        const prefixes = Object.keys(newResolvedMapping[cp]);
        for (let i = 0; i < Math.min(prefixes.length, 5); i++) {
            const prefix = prefixes[i];
            console.log(`  - Country +${cp}, Prefix ${prefix} -> Carrier: "${existingMapping[cp][prefix].carrier}", Type: "${existingMapping[cp][prefix].type}"`);
            samplePrinted++;
        }
    }

    // 6. Save or dry-run finish
    if (DRY_RUN) {
        console.log(`\n[Merge] DRY_RUN is active. mapping.json was NOT modified.`);
        console.log(`[Merge] To write changes, execute this script with DRY_RUN=false env variable.`);
    } else {
        console.log(`\n[Merge] Writing updated mapping to ${MAPPING_FILE_PATH}...`);
        const startWrite = Date.now();
        fs.writeFileSync(MAPPING_FILE_PATH, JSON.stringify(existingMapping, null, 2), 'utf8');
        console.log(`[Merge] High-precision mapping successfully updated and saved in ${((Date.now() - startWrite) / 1000).toFixed(2)}s!`);
    }
}

main().catch(err => {
    console.error(`[Merge] FATAL ERROR during merge:`, err);
    process.exit(1);
});
