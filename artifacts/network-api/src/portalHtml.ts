export function renderPortalPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GroundworkOS Network</title>
<style>
body { margin:0; font-family: sans-serif; background:#f3efe9; color:#2b2823; }
.wrap { max-width: 640px; margin: 0 auto; padding: 32px 20px 80px; }
h1 { font-size: 20px; margin: 0 0 4px; }
p.sub { color:#7a7469; margin: 0 0 28px; font-size: 14px; }
.card { background:#fff; border:1px solid #e2ddd4; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
label { display:block; font-size: 11px; text-transform: uppercase; color:#7a7469; margin-bottom: 6px; font-weight: 600; }
input { width:100%; box-sizing:border-box; padding: 9px 11px; border:1px solid #d9d4ce; border-radius: 8px; font-size: 14px; margin-bottom: 14px; font-family: inherit; }
.row { display:flex; gap: 12px; }
.row > div { flex:1; }
button { background:#1b5e78; color:#fff; border:none; border-radius: 8px; padding: 12px 18px; font-size: 14px; font-weight:600; cursor:pointer; }
button:disabled { opacity:.6; cursor:default; }
button.secondary { background:#eeeae4; color:#2b2823; }
button.small { padding: 7px 12px; font-size: 13px; margin-right: 8px; }
.msg { font-size: 13px; margin-top: 10px; }
.msg.ok { color:#2a6e45; }
.msg.err { color:#c13a2a; }
.badge { display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; padding:3px 8px; border-radius:999px; background:#eeeae4; color:#7a7469; }
.request-row { display:flex; align-items:center; justify-content:space-between; padding: 10px 0; border-bottom:1px solid #eee; }
.request-row:last-child { border-bottom:none; }
</style>
</head>
<body>
<div class="wrap">
<h1>Your GroundworkOS Network Profile</h1>
<p class="sub">Update your details once. Every GroundworkOS contractor you work with can see this verified record.</p>
<div id="requests"></div>
<div id="app">Loading...</div>
</div>
<script>
const token = window.location.pathname.split('/').filter(Boolean).pop();
const app = document.getElementById('app');
const requestsEl = document.getElementById('requests');
function field(label, id, value, type) {
  return '<div><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + (value == null ? '' : String(value).replace(/"/g, '&quot;')) + '" /></div>';
}
async function loadRequests() {
  try {
    const res = await fetch('/profiles/by-token/' + token + '/link-requests');
    if (!res.ok) { requestsEl.innerHTML = ''; return; }
    const requests = await res.json();
    if (!requests.length) { requestsEl.innerHTML = ''; return; }
    requestsEl.innerHTML =
      '<div class="card">' +
      '<label>New contractors requesting access</label>' +
      requests.map(function (r) {
        return '<div class="request-row"><span>' + r.contractorName + '</span><span>' +
          '<button class="small" data-approve="' + r.id + '">Approve</button>' +
          '<button class="small secondary" data-decline="' + r.id + '">Decline</button>' +
          '</span></div>';
      }).join('') +
      '</div>';
    requestsEl.querySelectorAll('[data-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () { respond(btn.getAttribute('data-approve'), true); });
    });
    requestsEl.querySelectorAll('[data-decline]').forEach(function (btn) {
      btn.addEventListener('click', function () { respond(btn.getAttribute('data-decline'), false); });
    });
  } catch (e) {
    requestsEl.innerHTML = '';
  }
}
async function respond(linkId, approve) {
  await fetch('/profiles/by-token/' + token + '/link-requests/' + linkId + '/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approve: approve }),
  });
  loadRequests();
}
async function load() {
  const res = await fetch('/profiles/by-token/' + token);
  if (!res.ok) {
    app.innerHTML = '<div class="card"><p class="msg err">This link is invalid or has expired. Ask the contractor who invited you for a new link.</p></div>';
    return;
  }
  const p = await res.json();
  const verifiedNote = p.cisVerifiedAt ? ' (HMRC-checked)' : ' (self-reported, not yet HMRC-verified)';
  app.innerHTML =
    '<div class="card">' +
    '<span class="badge">' + (p.cisStatus || 'unverified') + '</span>' +
    '<span class="msg">' + verifiedNote + '</span>' +
    '<div style="height:14px"></div>' +
    field('Company / trading name', 'companyName', p.companyName) +
    field('Contact name', 'contactName', p.contactName) +
    '<div class="row">' + field('Email', 'email', p.email, 'email') + field('Phone', 'phone', p.phone, 'tel') + '</div>' +
    field('UTR number', 'utrNumber', p.utrNumber) +
    '</div>' +
    '<div class="card">' +
    '<div class="row">' + field('Insurance provider', 'insuranceProvider', p.insuranceProvider) + field('Policy number', 'insurancePolicyNumber', p.insurancePolicyNumber) + '</div>' +
    field('Public liability expiry', 'publicLiabilityExpiry', p.publicLiabilityExpiry, 'date') +
    '<div class="row">' + field('CSCS card number', 'cscsCardNumber', p.cscsCardNumber) + field('CSCS expiry', 'cscsCardExpiry', p.cscsCardExpiry, 'date') + '</div>' +
    '<div class="row">' + field('NRSWA card number', 'nrswaCardNumber', p.nrswaCardNumber) + field('NRSWA expiry', 'nrswaExpiry', p.nrswaExpiry, 'date') + '</div>' +
    '</div>' +
    '<button id="save">Save my verified profile</button>' +
    '<div id="msg" class="msg"></div>';
  document.getElementById('save').addEventListener('click', save);
}
async function save() {
  const ids = ['companyName','contactName','email','phone','utrNumber','insuranceProvider','insurancePolicyNumber','publicLiabilityExpiry','cscsCardNumber','cscsCardExpiry','nrswaCardNumber','nrswaExpiry'];
  const body = {};
  for (const idName of ids) body[idName] = document.getElementById(idName).value || null;
  const btn = document.getElementById('save');
  btn.disabled = true;
  const msg = document.getElementById('msg');
  try {
    const res = await fetch('/profiles/by-token/' + token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json();
      throw new Error(errBody.error || 'Save failed');
    }
    msg.textContent = 'Saved. Every contractor linked to this profile now sees your updated details.';
    msg.className = 'msg ok';
  } catch (e) {
    msg.textContent = e.message || 'Something went wrong';
    msg.className = 'msg err';
  } finally {
    btn.disabled = false;
  }
}
load();
loadRequests();
</script>
</body>
</html>`;
}
