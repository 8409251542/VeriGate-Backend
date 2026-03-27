function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    const day = d.getDate().toString().padStart(2, "0");
    const month = d.toLocaleString("en-GB", { month: "short" });
    return day + month;
}

function formatDateSlug(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) throw new Error("Invalid date: " + dateStr);
    const day = d.getDate();
    const monthNames = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec"
    ];
    const month = monthNames[d.getMonth()];
    const slug = day + month;
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    return { slug, weekday };
}

function excelSerialToDate(serial) {
    const s = Number(serial);
    if (isNaN(s)) return null;
    const utc_days = Math.floor(s - 25569);
    const utc_value = utc_days * 86400;
    const fractional = s - Math.floor(s);
    const seconds = Math.round(fractional * 86400);
    return new Date((utc_value + seconds) * 1000);
}

function formatDateTime(dt) {
    if (!(dt instanceof Date) || isNaN(dt.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return (
      dt.getFullYear() +
      "-" +
      pad(dt.getMonth() + 1) +
      "-" +
      pad(dt.getDate()) +
      " " +
      pad(dt.getHours()) +
      ":" +
      pad(dt.getMinutes()) +
      ":" +
      pad(dt.getSeconds())
    );
}

module.exports = {
    formatDate,
    formatDateSlug,
    excelSerialToDate,
    formatDateTime
};
