/**
 * Roblox Username Validation & API Fetcher
 * Mengambil User ID, Display Name, dan Avatar Headshot dari username Roblox.
 * Memakai proxy publik anti-CORS dengan cadangan.
 */

const PROXIES = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

const AVATAR_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' fill='%238b5cf6'/><text x='75' y='95' font-size='56' font-family='Arial' font-weight='bold' fill='white' text-anchor='middle'>RBX</text></svg>";

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/**
 * Fetch JSON: coba langsung dulu, lalu rotasi proxy jika gagal (CORS / limit / error).
 * Hanya mengembalikan hasil kalau respons benar-benar sukses (HTTP 2xx).
 */
async function fetchWithProxyFallback(targetUrl, options) {
  try {
    return await fetchJson(targetUrl, options);
  } catch (e) {
    // kemungkinan besar diblokir CORS, lanjut ke proxy
  }

  let lastErr;
  for (const proxyFn of PROXIES) {
    try {
      return await fetchJson(proxyFn(targetUrl), options);
    } catch (err) {
      lastErr = err;
      console.warn('Proxy gagal, mencoba proxy berikutnya...', err);
    }
  }
  throw new Error('Gagal menghubungi Roblox (proxy sedang sibuk). Coba lagi sebentar.');
}

/**
 * Coba endpoint sendiri (/api/roblox di Vercel).
 * Mengembalikan: objek user (sukses), null (pasti tidak ditemukan), undefined (endpoint tidak tersedia / error).
 */
async function viaOwnApi(username) {
  let res;
  try {
    res = await fetch('/api/roblox?username=' + encodeURIComponent(username));
  } catch (e) { return undefined; }
  let body = null;
  try { body = await res.json(); } catch (e) { return undefined; }
  if (res.ok && body && body.id) return body;
  if (body && body.error === 'not_found') return null;
  return undefined;
}

/**
 * Cari user Roblox berdasarkan username (cocok persis).
 * @returns {Promise<{id:number, username:string, displayName:string, avatarUrl:string}>}
 */
async function getRobloxUser(username) {
  if (!username || typeof username !== 'string') {
    throw new Error('Username tidak boleh kosong.');
  }
  const cleanUsername = username.trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(cleanUsername)) {
    throw new Error('Username tidak valid. Gunakan 3-20 karakter: huruf, angka, atau underscore.');
  }

  // 0. Endpoint sendiri (Vercel) lebih dulu
  const own = await viaOwnApi(cleanUsername);
  if (own === null) throw new Error(`Username Roblox "${cleanUsername}" tidak ditemukan!`);
  if (own) {
    return {
      id: own.id,
      username: own.username,
      displayName: own.displayName || own.username,
      avatarUrl: own.avatarUrl || AVATAR_PLACEHOLDER
    };
  }

  // 1. Cari user: POST /v1/usernames/users (cocok persis)
  let userData = null;
  let searched = false;

  try {
    const result = await fetchWithProxyFallback('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [cleanUsername], excludeBannedUsers: true })
    });
    searched = true;
    userData = (result.data && result.data[0]) || null;
  } catch (e) {
    // 2. Cadangan: GET search, hanya terima username yang PERSIS sama
    const result = await fetchWithProxyFallback(
      `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(cleanUsername)}&limit=10`
    );
    searched = true;
    userData = (result.data || []).find(
      u => u.name.toLowerCase() === cleanUsername.toLowerCase()
    ) || null;
  }

  if (!searched || !userData) {
    throw new Error(`Username Roblox "${cleanUsername}" tidak ditemukan!`);
  }

  // 3. Avatar headshot (jika gagal, tetap lanjut dengan gambar bawaan)
  let avatarUrl = AVATAR_PLACEHOLDER;
  try {
    const thumb = await fetchWithProxyFallback(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png&isCircular=false`
    );
    if (thumb.data && thumb.data[0] && thumb.data[0].imageUrl) {
      avatarUrl = thumb.data[0].imageUrl;
    }
  } catch (err) {
    console.warn('Gagal mengambil avatar, memakai gambar bawaan.', err);
  }

  return {
    id: userData.id,
    username: userData.name || userData.requestedUsername || cleanUsername,
    displayName: userData.displayName || userData.name || cleanUsername,
    avatarUrl
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getRobloxUser };
} else {
  window.getRobloxUser = getRobloxUser;
}
