// Aquaman : les appareils de l'auteur, une clé par appareil, approuvée une fois.

import { RELAY } from './common.js';
import { ApiError } from './api.js';

// ---------- les appareils de l'auteur : une clé par appareil, approuvée une fois ----------

// La paire de clés de l'appareil, faite une fois : la clé privée ne peut pas être lue (pas même par Aquaman), seulement
// servir à signer.
function keyStore(mode, use) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('aquaman-keys', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode);
      const req = use(tx.objectStore('keys'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function deviceKey() {
  let key = await keyStore('readonly', (store) => store.get('device'));
  if (!key) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    key = { privateKey: pair.privateKey, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } };
    await keyStore('readwrite', (store) => store.put(key, 'device'));
  }
  return key;
}

const toBase64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Une requête aux adresses /admin/ du relais, signée avec la clé de cet appareil dès qu'il a un id.
async function adminFetch(method, path, body, extra = {}) {
  const { adminDevice } = await chrome.storage.local.get('adminDevice');
  const text = body ? JSON.stringify(body) : '';
  const headers = { 'content-type': 'application/json', ...extra };
  if (adminDevice?.id) {
    const { privateKey } = await deviceKey();
    const time = Date.now();
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(`${method} ${path} ${time} ${text}`));
    Object.assign(headers, { 'x-aqm-device': adminDevice.id, 'x-aqm-time': String(time), 'x-aqm-sig': toBase64url(sig) });
  }
  return fetch(`${RELAY}${path}`, { method, headers, body: text || undefined });
}

// Cet appareil : { id, state: "pending" | "approved" } ou null, revérifié auprès du relais tant qu'il attend.
async function adminDevice() {
  const { adminDevice: device } = await chrome.storage.local.get('adminDevice');
  if (device?.state !== 'pending') return device ?? null;
  const res = await fetch(`${RELAY}/admin/devices/state?id=${device.id}`);
  const { state } = res.ok ? await res.json() : { state: 'pending' };
  if (state === 'unknown') {
    await chrome.storage.local.remove('adminDevice');
    return null;
  }
  const next = { ...device, state };
  await chrome.storage.local.set({ adminDevice: next });
  return next;
}

// Demande au relais d'approuver cet appareil (name : ce que verra l'auteur, « Brave · Windows » par exemple).
export async function requestDevice(name) {
  const current = await adminDevice();
  if (current) return current;
  const { pub } = await deviceKey();
  const res = await fetch(`${RELAY}/admin/devices/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pub, name }) });
  if (!res.ok) throw new ApiError(res.status, 'relay', `Le relais refuse la demande (${res.status}).`);
  const device = await res.json();
  await chrome.storage.local.set({ adminDevice: device });
  return device;
}

// Approuve cet appareil avec le code du propriétaire (utile seulement pour le premier appareil).
export async function approveWithCode(token, name) {
  const device = await requestDevice(name);
  const res = await fetch(`${RELAY}/admin/devices/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${String(token).trim()}` },
    body: JSON.stringify({ id: device.id })
  });
  if (res.status === 403) return { wrong: true, device };
  if (!res.ok) throw new ApiError(res.status, 'relay', `Le relais ne répond pas (${res.status}).`);
  const approved = { ...device, state: 'approved' };
  await chrome.storage.local.set({ adminDevice: approved });
  return { device: approved };
}

// Une requête signée de l'auteur ; un refus veut dire que cet appareil a été révoqué.
export async function asAuthor(method, path, body) {
  const device = await adminDevice();
  if (device?.state !== 'approved') return { needDevice: true, device };
  const res = await adminFetch(method, path, body);
  if (res.status === 403) {
    await chrome.storage.local.remove('adminDevice');
    return { needDevice: true, device: null, revoked: true };
  }
  if (!res.ok) throw new ApiError(res.status, 'relay', `Le relais ne répond pas (${res.status}).`);
  return res.json();
}

// Tous les joueurs qui ont utilisé Aquaman.
export const aquamanUsers = () => asAuthor('GET', '/admin/users');
