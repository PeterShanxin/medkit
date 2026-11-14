import type { OAuth } from './oauth';
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export async function consentPage(
  oauth: OAuth,
  request: string,
  signedIn: boolean,
) {
  const pending = await oauth.pending(request);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to MedKit</title><style>body{font:17px system-ui;background:#f6f5ef;color:#18392c;margin:0;padding:24px}main{max-width:520px;margin:9vh auto}h1{font:36px Georgia}p{line-height:1.6}label{display:block;margin:24px 0}input[type=password]{display:block;box-sizing:border-box;width:100%;padding:14px;margin-top:10px;border:1px solid #68766e;border-radius:8px;font:inherit}button{padding:14px 22px;font:inherit;border:1px solid #315d4a;border-radius:8px;cursor:pointer;background:#315d4a;color:white;margin:10px 12px 0 0}button[value=deny]{background:transparent;color:#315d4a}small{display:block;line-height:1.5}</style><main><p>medkit</p><h1>Connect ${escape(pending.clientName)}</h1><p>This client will receive the records covered by the permissions below. Its provider may process and retain returned information.</p><ul>${pending.scopes
    .filter((s) => s !== 'records:write')
    .map(
      (s) =>
        `<li>${escape({ 'cabinet:read': 'Medicines and inventory', 'medication:read': 'Plans and actual doses', 'history:read': 'Symptoms and illness history', 'safety:read': 'Allergies and safety context' }[s])}</li>`,
    )
    .join(
      '',
    )}</ul><form method="post" action="/connect/approve"><input type="hidden" name="request" value="${escape(request)}">${signedIn ? '' : '<label>MedKit access key<input type="password" name="key" autocomplete="off" required maxlength="100"></label>'}${pending.scopes.includes('records:write') ? '<label><input type="checkbox" name="allowWrite" value="yes"> Allow requests to add or correct records</label><small>Each request still needs your confirmation in MedKit. The client cannot approve its own changes.</small>' : ''}<p>Access expires after 30 days. You can revoke it at any time in Connections.</p><button name="decision" value="allow">Connect</button><button name="decision" value="deny" formnovalidate>Deny</button></form></main></html>`;
}
