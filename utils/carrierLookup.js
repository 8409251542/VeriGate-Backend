/**
 * Manual Carrier Lookup Utility
 * Maps phone number prefixes to carriers and line types.
 * Powered by high-precision NPANXX data (150k+ records).
 */

const fs = require('fs');
const path = require('path');

let carrierPrefixes = {};

try {
    const mappingPath = path.join(__dirname, 'mapping.json');
    if (fs.existsSync(mappingPath)) {
        carrierPrefixes = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        console.log(`[CarrierLookup] High-precision mapping loaded for countries: ${Object.keys(carrierPrefixes).join(', ')}`);
    } else {
        console.warn("[CarrierLookup] Mapping file not found, local carrier lookup will be limited.");
    }
} catch (err) {
    console.error("[CarrierLookup] Error loading mapping data:", err);
}

/**
 * Get carrier info from number (E.164 format)
 */
function getCarrierInfo(countryCode, fullNumber) {
    const prefixes = carrierPrefixes[countryCode] || {};
    const cleanedNum = fullNumber.replace("+" + countryCode, "");

    // US (+1) uses 6-digit (NPA-NXX) precision
    // International usually uses 4-digit prefixes
    // Try matching longest prefix first
    for (let len = 6; len >= 1; len--) {
        const prefix = cleanedNum.substring(0, len);
        if (prefixes[prefix]) {
            return prefixes[prefix];
        }
    }

    return { carrier: "Unknown Carrier", type: "mobile" }; // Default
}

module.exports = { getCarrierInfo };
