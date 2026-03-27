const XLSX = require("xlsx");
const JSZip = require("jszip");
const { formatDateSlug, excelSerialToDate, formatDateTime } = require("./date");

function buyerFirstWord(buyer) {
  if (buyer === undefined || buyer === null) return "unknown";
  const s = String(buyer).trim();
  if (!s || s === "0") return "unknown";
  return s.split(/\s+/)[0];
}

function last4Digits(value) {
  const digits = String(value).replace(/\D+/g, "");
  if (!digits) return "";
  return digits.length > 4 ? digits.slice(-4) : digits;
}

function sanitizeCampaignName(camp) {
  if (camp === undefined || camp === null) return "unknown";
  return String(camp).trim().toLowerCase().replace(/\s+/g, "");
}

function cleanForwardedAndCaller(rows, colForwarded, colCaller) {
  return rows.filter((r) => {
    let fn = r[colForwarded];
    let ci = r[colCaller];

    fn = fn === undefined || fn === null ? "" : String(fn).trim();
    ci = ci === undefined || ci === null ? "" : String(ci).trim();

    if (!fn || fn === "0" || fn === "0.0") return false;

    const ciLower = ci.toLowerCase();
    if (ciLower === "anonymous" || ciLower === "restricted") return false;

    r[colForwarded] = fn;
    r[colCaller] = ci;
    return true;
  });
}

function adjustBillseconds(rows, colBill) {
  rows.forEach((r) => {
    let v = r[colBill];
    if (v === undefined || v === null || v === "") v = 0;
    v = parseInt(v, 10);
    if (isNaN(v)) v = 0;

    r[colBill] = v;
  });
  return rows;
}

function convertCallStart(rows, colCallStart) {
  rows.forEach((r) => {
    const v = r[colCallStart];
    if (v === undefined || v === null || v === "") return;

    if (v instanceof Date) {
      r[colCallStart] = formatDateTime(v);
      return;
    }

    const num = Number(v);
    if (!isNaN(num)) {
      const dt = excelSerialToDate(num);
      if (dt) r[colCallStart] = formatDateTime(dt);
    }
  });
}

function dropUnwantedColumns(rows) {
  const DROP = new Set([
    "did", "call_answer", "call_end", "missed", "tta", "duplicate",
    "caller_valid", "caller_voip", "abuse_caller", "fraudscore",
    "caller_carrier", "caller_linetype", "caller_risky", "caller_country",
    "caller_name", "caller_spammer", "recordingfile", "ringseconds",
    "routing_attempt", "duration", "recordingUrl",
  ]);
  return rows.map((row) => {
    const out = {};
    Object.keys(row).forEach((k) => {
      if (!DROP.has(k)) out[k] = row[k];
    });
    return out;
  });
}

function groupByCampaign(rows, colCamp) {
  const map = new Map();
  rows.forEach((r) => {
    const camp = r[colCamp] === undefined || r[colCamp] === null ? "" : String(r[colCamp]).trim();
    if (!camp) return;
    if (!map.has(camp)) map.set(camp, []);
    map.get(camp).push(r);
  });
  return map;
}

function uniqueRowsByCallerId(rows, colCaller) {
  const seen = new Set();
  const result = [];
  rows.forEach((r) => {
    const ci = r[colCaller] === undefined || r[colCaller] === null ? "" : String(r[colCaller]).trim();
    if (!ci) return;
    if (seen.has(ci)) return;
    seen.add(ci);
    result.push(r);
  });
  return result;
}

async function buildZipFromRows(rows, dateStr) {
  const { slug: dateSlug, weekday } = formatDateSlug(dateStr);

  const keys = Object.keys(rows[0] || {});
  const colBuyer = keys.includes("buyername") ? "buyername" : keys.includes("buyernam") ? "buyernam" : "buyername";
  const colCamp = keys.includes("campname") ? "campname" : keys.includes("campnam") ? "campnam" : "campname";
  const colBill = "billseconds";
  const colForwarded = "forwardednumber";
  const colCaller = "callerid";
  const colCallStart = keys.includes("call_start") ? "call_start" : null;

  const required = [colCamp, colForwarded, colCaller, colBuyer, colBill];
  required.forEach((col) => {
    const hasCol = rows.some((r) => Object.prototype.hasOwnProperty.call(r, col));
    if (!hasCol) throw new Error("Missing required column: " + col);
  });

  rows = dropUnwantedColumns(rows);
  rows = cleanForwardedAndCaller(rows, colForwarded, colCaller);
  rows = adjustBillseconds(rows, colBill);
  if (colCallStart) convertCallStart(rows, colCallStart);

  const zip = new JSZip();
  const campMap = groupByCampaign(rows, colCamp);
  
  for (const [camp, campRows] of campMap.entries()) {
    const campTag = sanitizeCampaignName(camp);
    const campFolder = zip.folder(campTag || "campaign");
    const txtLines = [];
    const buyerStats = {};
    let totalCallsCampaign = 0;

    const uniqueCallerSetCampaign = new Set();
    campRows.forEach((r) => {
      const ci = r[colCaller] === undefined || r[colCaller] === null ? "" : String(r[colCaller]).trim();
      if (ci) uniqueCallerSetCampaign.add(ci);
    });

    const tfnMap = new Map();
    campRows.forEach((r) => {
      const fn = r[colForwarded];
      if (!fn) return;
      if (!tfnMap.has(fn)) tfnMap.set(fn, []);
      tfnMap.get(fn).push(r);
    });

    for (const [fn, fnRows] of tfnMap.entries()) {
      const uniqueRows = uniqueRowsByCallerId(fnRows, colCaller);
      const callsCount = uniqueRows.length;
      totalCallsCampaign += callsCount;
      if (callsCount === 0) continue;

      const buyer = buyerFirstWord(uniqueRows[0][colBuyer]);
      const fnLast4 = last4Digits(fn) || String(fn);

      if (!buyerStats[buyer]) {
        buyerStats[buyer] = { tfns: new Set(), calls: 0, tfnLines: [] };
      }
      buyerStats[buyer].tfns.add(fnLast4);
      buyerStats[buyer].calls += callsCount;
      buyerStats[buyer].tfnLines.push({ fnLast4, callsCount });

      const excelFilename = `${buyer} ${dateSlug} (${fnLast4}) - ${callsCount} calls - ${campTag}.xlsx`;
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(uniqueRows);
      XLSX.utils.book_append_sheet(wb, ws, "Calls");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      campFolder.file(excelFilename, wbout);
    }

    const buyerNames = Object.keys(buyerStats);
    buyerNames.forEach((buyer) => {
      const info = buyerStats[buyer];
      info.tfnLines.forEach((t) => {
        txtLines.push(`${buyer} ${dateSlug} ${campTag} ${t.fnLast4} ${t.callsCount}`);
      });
      txtLines.push("-----------------------------------------");
      txtLines.push(`${buyer} - ${info.tfns.size} tfn - ${info.calls} calls - ${dateSlug} ${weekday}`);
      txtLines.push("-----------------------------------------");
      txtLines.push("");
    });

    const uniqueCallersCampaign = uniqueCallerSetCampaign.size;
    txtLines.push(`TOTAL\t${totalCallsCampaign}`);
    txtLines.push(`Uniuqe  ${uniqueCallersCampaign}`);
    txtLines.push(`REPEAT  ${totalCallsCampaign - uniqueCallersCampaign}`);

    campFolder.file(`${dateSlug} ${campTag} CDR.txt`, txtLines.join("\n"));
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

function hmsToSeconds(hms) {
  if (!hms || typeof hms !== "string") return 0;
  const parts = hms.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(hms) || 0;
}

function normalizeVoxeraRows(rows) {
  if (!rows || rows.length === 0) return rows;

  // Detect Voxera format by checking for "CDR Reports" preamble
  const firstKey = Object.keys(rows[0])[0];
  const firstVal = String(rows[0][firstKey] || "");
  const isVoxera = firstKey.includes("CDR Reports") || firstVal.includes("CDR Reports");

  if (!isVoxera) return rows;

  // Find headers (usually at index 3 or nearby)
  let headerRowIndex = -1;
  let headers = [];

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const vals = Object.values(rows[i]).map(v => String(v).toLowerCase());
    if (vals.includes("campaign") || vals.includes("sales name") || vals.includes("caller number")) {
      headerRowIndex = i;
      headers = Object.values(rows[i]);
      break;
    }
  }

  if (headerRowIndex === -1) return rows;

  const dataRows = rows.slice(headerRowIndex + 1);
  return dataRows.map(row => {
    const obj = {};
    const rowValues = Object.values(row);
    headers.forEach((h, idx) => {
      if (!h) return;
      const cleanH = h.trim().toLowerCase();
      const val = rowValues[idx];

      if (cleanH === "sales name") obj["buyername"] = val;
      else if (cleanH === "campaign") obj["campname"] = val;
      else if (cleanH === "duration") obj["billseconds"] = hmsToSeconds(val);
      else if (cleanH === "forward to") obj["forwardednumber"] = val;
      else if (cleanH === "caller number") obj["callerid"] = val;
      else if (cleanH === "date/time") obj["call_start"] = val;
      else obj[h] = val;
    });
    return obj;
  }).filter(r => r.buyername || r.campname);
}

module.exports = {
  buildZipFromRows,
  buyerFirstWord,
  last4Digits,
  sanitizeCampaignName,
  cleanForwardedAndCaller,
  adjustBillseconds,
  convertCallStart,
  dropUnwantedColumns,
  groupByCampaign,
  uniqueRowsByCallerId,
  normalizeVoxeraRows
};
