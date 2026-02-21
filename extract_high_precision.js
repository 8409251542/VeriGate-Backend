const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const dataDir = path.join(__dirname, 'uploads/verified-data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));

const mapping = {};

console.log(`Found ${files.length} files to process...`);

files.forEach(file => {
    const csvPath = path.join(dataDir, file);
    const csvData = fs.readFileSync(csvPath, 'utf8');

    console.log(`Processing ${file}...`);

    Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            results.data.forEach(row => {
                let cp = row.country_prefix ? row.country_prefix.replace('+', '') : '';
                const num = row.local_format || '';
                const carrier = row.carrier || '';
                const type = row.line_type || 'unknown';

                // If country_prefix is missing, try to derive it from international_format or number
                if (!cp) {
                    const intl = row.international_format || '';
                    const fullNum = row.number || '';
                    const target = intl || fullNum;

                    if (target && num) {
                        const cleanTarget = target.replace('+', '');
                        if (cleanTarget.endsWith(num)) {
                            cp = cleanTarget.replace(num, '');
                        }
                    }
                }

                // We need at least country prefix and number
                if (!cp || !num) return;

                // Precision Logic:
                // US (+1) -> 6 digits (NPA-NXX)
                // Others -> 4 digits
                let prefixLen = (cp === '1') ? 6 : 4;
                const prefix = num.substring(0, prefixLen);

                if (!mapping[cp]) mapping[cp] = {};
                if (!mapping[cp][prefix]) {
                    mapping[cp][prefix] = {
                        carriers: {},
                        types: {}
                    };
                }

                // If carrier is empty but type is landline, we still record it
                // We'll filter "Unknown" out during the selection phase if there are better options
                const carrierKey = carrier || "Unknown";
                mapping[cp][prefix].carriers[carrierKey] = (mapping[cp][prefix].carriers[carrierKey] || 0) + 1;
                mapping[cp][prefix].types[type] = (mapping[cp][prefix].types[type] || 0) + 1;
            });
        }
    });
});

console.log('Finalizing mapping...');

// Finalize mapping by picking the most frequent
const finalMapping = {};
for (const cp in mapping) {
    finalMapping[cp] = {};
    for (const prefix in mapping[cp]) {
        const carriers = mapping[cp][prefix].carriers;
        const types = mapping[cp][prefix].types;

        // Selection Logic:
        // 1. Pick the most frequent type
        const type = Object.keys(types).reduce((a, b) => types[a] > types[b] ? a : b);

        // 2. Pick the most frequent carrier, BUT prefer non-"Unknown" if available
        let carrier = "Unknown";
        const sortedCarriers = Object.keys(carriers).sort((a, b) => carriers[b] - carriers[a]);

        const nonUnknown = sortedCarriers.filter(c => c !== "Unknown" && c !== "");
        if (nonUnknown.length > 0) {
            carrier = nonUnknown[0];
        } else {
            carrier = sortedCarriers[0] || "Unknown";
        }

        finalMapping[cp][prefix] = { carrier, type };
    }
}

fs.writeFileSync('utils/mapping.json', JSON.stringify(finalMapping, null, 2), 'utf8');
console.log('High-precision mapping (including landlines) saved to utils/mapping.json');
