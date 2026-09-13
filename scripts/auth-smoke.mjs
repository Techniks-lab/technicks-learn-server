import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const args = process.argv.slice(2);
const BASE = arg('base') || process.env.API_BASE || 'http://localhost:3000';

function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
}

const email = arg('email') || `smoke-${Date.now()}@example.com`;
const username = `smoke${Math.floor(Math.random() * 1e9)}`;
const password = 'Passw0rd!x';
const newPassword = 'ChangedPassw0rd!z';
let suppliedVerifyOtp = arg('otp');
let suppliedResetOtp = arg('otp-reset');

const rl = createInterface({ input, output });
async function promptOtp(label) {
  const answer = await rl.question(`${label}: `);
  return answer.trim();
}

const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function api(method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`Smoke-testing auth processes against ${BASE}\n`);
  console.log(`Using email: ${email}\n`);

  let clear = await api('POST', '/api/v1/admin/db/clear');
  report('admin:db/clear', clear.status === 200, `status=${clear.status}`);

  let reg = await api('POST', '/api/v1/auth/register', {
    body: {
      email,
      password,
      fullName: 'Smoke Test User',
    },
  });
  report('auth:register', reg.status === 201, `status=${reg.status}`);
  if (reg.status !== 201) {
    finish(1);
    return;
  }
  report('  emailVerificationPending=true', reg.data.emailVerificationPending === true);
  report('  username null at register', reg.data.user?.username === null);
  const regAccess = reg.data.accessToken;
  let verifyOtp = reg.data.devOtp;

  let checkAvail = await api('GET', `/api/v1/auth/username/check?username=${encodeURIComponent(username)}`);
  report('auth:username/check available', checkAvail.status === 200 && checkAvail.data?.available === true, `status=${checkAvail.status}`);

  let setU = await api('POST', '/api/v1/auth/username', {
    token: regAccess,
    body: { username },
  });
  report('auth:username created', setU.status === 200 && setU.data?.created === true && setU.data?.user?.username === username, `status=${setU.status}`);

  const username2 = `${username}x`;
  let setU2 = await api('POST', '/api/v1/auth/username', {
    token: setU.data?.accessToken || regAccess,
    body: { username: username2 },
  });
  report('auth:username changed', setU2.status === 200 && setU2.data?.created === false && setU2.data?.user?.username === username2, `status=${setU2.status}`);

  let checkTaken = await api('GET', `/api/v1/auth/username/check?username=${encodeURIComponent(username2)}`);
  report('auth:username/check taken', checkTaken.status === 200 && checkTaken.data?.available === false, `status=${checkTaken.status}`);

  let resend = await api('POST', '/api/v1/auth/resend-otp', { body: { email } });
  report('auth:resend-otp is rate-limited', resend.status === 429, `status=${resend.status}`);

  if (!verifyOtp) {
    if (suppliedVerifyOtp) {
      verifyOtp = suppliedVerifyOtp;
    } else if (process.stdin.isTTY) {
      verifyOtp = await promptOtp(`Enter the OTP emailed to ${email} (or leave blank to skip verify)`);
      if (!verifyOtp) rl.close();
    }
  }
  if (verifyOtp) {
    let ver = await api('POST', '/api/v1/auth/verify-email', { body: { email, token: verifyOtp } });
    report('auth:verify-email', ver.status === 200, `status=${ver.status}`);
    let dup = await api('POST', '/api/v1/auth/verify-email', { body: { email, token: verifyOtp } });
    report('auth:verify-email idempotent', dup.status === 200 && dup.data?.message === 'Email already verified');
  } else {
    report('auth:verify-email', false, 'SKIPPED - no OTP available');
  }

  let login = await api('POST', '/api/v1/auth/login', { body: { email, password } });
  report('auth:login', login.status === 200, `status=${login.status}`);
  if (login.status !== 200) {
    finish(1);
    return;
  }
  report('  user.isVerified present', typeof login.data.user?.isVerified === 'boolean');
  const accessToken = login.data.accessToken;
  const refreshToken = login.data.refreshToken;

  let profile = await api('GET', '/api/v1/auth/profile', { token: accessToken });
  report('auth:profile (bearer)', profile.status === 200 && profile.data?.email === email, `status=${profile.status}`);

  let refresh = await api('POST', '/api/v1/auth/refresh', { body: { refreshToken } });
  report('auth:refresh', refresh.status === 200 && Boolean(refresh.data?.accessToken), `status=${refresh.status}`);
  const newAccess = refresh.data?.accessToken || accessToken;

  let change = await api('POST', '/api/v1/auth/change-password', {
    token: newAccess,
    body: { currentPassword: password, newPassword },
  });
  report('auth:change-password', change.status === 200, `status=${change.status}`);

  let relogin = await api('POST', '/api/v1/auth/login', { body: { email, password: newPassword } });
  report('auth:relogin with new password', relogin.status === 200, `status=${relogin.status}`);

  let forgot = await api('POST', '/api/v1/auth/forgot-password', { body: { email } });
  if (forgot.status === 429) {
    report('auth:forgot-password', true, 'rate-limited (429) - OTP cooldown active; skipping reset');
  } else {
    report('auth:forgot-password', forgot.status === 200, `status=${forgot.status}`);
    let resetOtp = suppliedResetOtp;
    if (!resetOtp && process.stdin.isTTY && !rl.closed) {
      resetOtp = await promptOtp(`Enter the reset OTP emailed to ${email} (or leave blank to skip reset)`);
    }
    rl.close();
    if (resetOtp) {
      let reset = await api('POST', '/api/v1/auth/reset-password', {
        body: { token: resetOtp, newPassword },
      });
      report('auth:reset-password', reset.status === 200, `status=${reset.status}`);
    } else {
      report('auth:reset-password', false, 'SKIPPED - no reset OTP provided');
    }
  }
  rl.close();

  let badLogin = await api('POST', '/api/v1/auth/login', { body: { email: email, password: 'WrongPassw0rd!' } });
  report('auth:wrong-password rejected', badLogin.status === 401, `status=${badLogin.status}`);

  let logout = await api('POST', '/api/v1/auth/logout', { token: accessToken });
  report('auth:logout', logout.status === 200, `status=${logout.status}`);

  let badRefresh = await api('POST', '/api/v1/auth/refresh', { body: { refreshToken } });
  report('auth:refresh revoked after logout', badRefresh.status === 401, `status=${badRefresh.status}`);

  finish(0);
}

function finish(code) {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(code);
}

main().catch((error) => {
  console.error('Script error:', error);
  process.exit(1);
});