const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { getCarrierInfo } = require("./carrierLookup");

function formatPhone(phone, defaultCountryCode) {
    if (!phone) return null;
    phone = phone.replace(/\D/g, ""); // remove non-digits

    // If exactly 10 digits → assume selected country code
    if (phone.length === 10) {
      return `${defaultCountryCode}${phone}`;
    }

    // If already has 11–13 digits → ensure it starts with +
    if (phone.length >= 11 && phone.length <= 13) {
      return phone.startsWith("+") ? phone : `+${phone}`;
    }

    return null; // invalid
}

const localVerify = (phone, defaultCC) => {
    try {
      const phoneNumber = parsePhoneNumberFromString(phone);
      if (!phoneNumber || !phoneNumber.isValid()) {
        console.log(`[localVerify] FAILED validation for: ${phone}`);
        return null;
      }
  
      const cc = phoneNumber.countryCallingCode;
      const carrierData = getCarrierInfo(cc, phoneNumber.number);
  
      return {
        valid: true,
        number: phoneNumber.number,
        local_format: phoneNumber.formatNational(),
        international_format: phoneNumber.formatInternational(),
        country_prefix: cc,
        country_code: phoneNumber.country,
        carrier: carrierData.carrier,
        line_type: carrierData.type,
        is_local_fallback: true
      };
    } catch (e) {
      console.error(`[localVerify] CRASH for ${phone}:`, e.message);
      return null;
    }
};

module.exports = {
    formatPhone,
    localVerify
};
