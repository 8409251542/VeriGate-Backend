function generateRandomInvoice() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const r = (n) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      s += letters[Math.floor(Math.random() * letters.length)];
    }
    return s;
  };
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${r(2)}${Math.floor(10 + Math.random() * 89)}-${digits}-${r(2)}`;
}

function generateInvoiceHTML(data) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
:root{
  --pp-blue:#003087;
  --pp-accent:#009cde;
  --muted:#6b7280;
  --card-bg:#ffffff;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{
  margin:0;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
  background:#f3f6ff;
  padding:24px 0;
}
#invoice-root{
  background:linear-gradient(180deg,#ffffff 0%,#f9fbff 100%);
  border-radius:16px;
  padding:24px 28px;
  max-width:780px;
  margin:0 auto;
  box-shadow:0 10px 30px rgba(15,23,42,.12);
}
.inv-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:20px;
}
.brand{
  display:flex;
  align-items:center;
  gap:12px;
}
.brand img{
  height:40px;
  width:auto;
  border-radius:8px;
}
.company{
  font-weight:700;
  color:var(--pp-blue);
  font-size:18px;
}
.company-sub{
  font-size:12px;
  color:var(--muted);
  letter-spacing:.08em;
  text-transform:uppercase;
}
.inv-top-right{
  text-align:right;
}
.inv-top-right .heading{
  font-size:13px;
  color:var(--pp-blue);
  margin-bottom:4px;
}
.status-badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:5px 12px;
  border-radius:999px;
  background:#e9fff2;
  color:#16a34a;
  font-weight:600;
  font-size:13px;
}
.status-badge span.icon{
  font-size:14px;
}
.summary{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  padding:16px 18px;
  border-radius:12px;
  background:linear-gradient(90deg,rgba(0,156,222,0.06),rgba(0,48,135,0.03));
  border:1px solid rgba(15,23,42,0.06);
  margin-bottom:20px;
}
.label{
  font-size:12px;
  color:var(--muted);
  margin-bottom:6px;
}
.big-amount{
  font-size:26px;
  font-weight:700;
  color:#020617;
}
.service{
  font-size:12px;
  color:var(--muted);
  margin-top:4px;
}
.details{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:16px;
  margin-bottom:18px;
}
.card .k{
  font-size:11px;
  color:var(--muted);
  margin-bottom:4px;
  text-transform:uppercase;
  letter-spacing:.08em;
}
.card .v{
  font-weight:600;
  color:#111827;
  font-size:14px;
}
.refund{
  font-size:11px;
  color:var(--muted);
  padding:10px 0;
  border-top:1px dashed #e5e7eb;
}
</style>
</head>
<body>
<div id="invoice-root">
  <div class="inv-top">
    <div class="brand">
      <img src="${data.logoUrl}" alt="Logo">
      <div>
        <div class="company">${data.companyName}</div>
        <div class="company-sub">INVOICE</div>
      </div>
    </div>
    <div class="inv-top-right">
      <div class="heading">Payment Confirmation</div>
      <div class="status-badge">
        <span class="icon">✔</span>
        <span>Paid</span>
      </div>
    </div>
  </div>
  
  <div class="summary">
    <div>
      <div class="label">Amount</div>
      <div class="big-amount">${data.amount}</div>
      <div class="service">Service: Digital Assets &amp; Cryptocurrency Services</div>
    </div>
    <div style="text-align:right"></div>
  </div>
  
  <div class="details">
    <div class="card">
      <div class="k">Transaction ID</div>
      <div class="v">${data.transactionId}</div>
    </div>
    <div class="card">
      <div class="k">Date</div>
      <div class="v">${data.date}</div>
    </div>
    <div class="card">
      <div class="k">Invoice No</div>
      <div class="v">${data.invoiceNumber}</div>
    </div>
    <div class="card">
      <div class="k">Contact - 24/7</div>
      <div class="v">${data.phoneNumber}</div>
    </div>
  </div>
  
  <div class="refund">
    Refund requests within <strong>12 hours</strong> of payment will be reviewed. 
    Contact support if you notice an unrecognized charge.
  </div>
  <div class="refund">
    This is an automated notification. For assistance call <strong>${data.supportPhone}</strong> 
    in working hours. Both numbers are alternate — you can use any.
  </div>
</div>
</body>
</html>
`;
}

module.exports = {
  generateRandomInvoice,
  generateInvoiceHTML
};
