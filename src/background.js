import { ORIGIN, REPO, safeHref } from './lib/common.js';
import { getSettings } from './lib/settings.js';
import { gameStatus } from './lib/api.js';
import { pollFeed } from './lib/feed.js';
import { answer } from './lib/messages.js';
import { checkUpdate, newer } from './lib/updates.js';

const POLL_ALARM = 'aquaman-poll';
const UPDATE_ALARM = 'aquaman-update';
const FEED_ALARM = 'aquaman-feed';
const FIREFOX = navigator.userAgent.includes('Firefox');
const ICON = chrome.runtime.getURL('icons/icon128.png');
const UPDATER = 'com.aquaman.updater';

// ---------- alarmes ----------

// Boosters en attente toutes les 5 minutes, « beaux tirages » du jeu toutes les minutes, nouvelles versions toutes les
// 10 minutes.
async function schedule() {
  if ((await chrome.alarms.get(POLL_ALARM))?.periodInMinutes !== 5) await chrome.alarms.create(POLL_ALARM, { delayInMinutes: 0.5, periodInMinutes: 5 });
  if ((await chrome.alarms.get(UPDATE_ALARM))?.periodInMinutes !== 10) await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 10 });
  if ((await chrome.alarms.get(FEED_ALARM))?.periodInMinutes !== 1) await chrome.alarms.create(FEED_ALARM, { delayInMinutes: 0.5, periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === POLL_ALARM) pollBoosters();
  if (a.name === FEED_ALARM) pollFeed().catch(() => {});
  if (a.name === UPDATE_ALARM) lookForUpdate();
});

// ---------- notifications et badge ----------

// Affiche une notification qui ouvre href quand on clique dessus.
async function notify(id, { title, message, href }) {
  await chrome.storage.local.set({ [`notif:${id}`]: href ?? null });
  chrome.notifications.create(id, { type: 'basic', iconUrl: ICON, title, message, priority: 1 });
}

chrome.notifications.onClicked.addListener(async (id) => {
  const key = `notif:${id}`;
  const href = (await chrome.storage.local.get(key))[key];
  chrome.notifications.clear(id);
  chrome.storage.local.remove(key);
  if (href) openSite(href);
});

// Ouvre une page du site (ou n'importe quelle adresse) dans un onglet, en réutilisant un onglet du site s'il y en a un.
async function openSite(href) {
  const url = safeHref(href);
  if (!url) return;
  const [tab] = url.startsWith(ORIGIN) ? await chrome.tabs.query({ url: `${ORIGIN}/*` }).catch(() => []) : [];
  if (tab) {
    await chrome.tabs.update(tab.id, { url, active: true });
    if (tab.windowId != null) chrome.windows?.update(tab.windowId, { focused: true }).catch(() => {});
  } else chrome.tabs.create({ url });
}

// Nombre de boosters à ouvrir sur l'icône, « ! » quand le joueur est déconnecté.
function setBadge(pending, loggedOut = false) {
  chrome.action.setBadgeBackgroundColor({ color: loggedOut ? '#71717a' : '#2563eb' });
  chrome.action.setBadgeText({ text: loggedOut ? '!' : pending > 0 ? String(Math.min(pending, 99)) : '' });
}

// Boosters en attente : badge, et une notification quand il y en a plus qu'avant.
async function onStatus(pending) {
  setBadge(pending);
  const { lastPending = 0 } = await chrome.storage.local.get('lastPending');
  await chrome.storage.local.set({ lastPending: pending });
  if (pending > lastPending && (await getSettings()).notifyBoosters)
    notify('boosters', {
      title: pending > 1 ? `${pending} boosters à ouvrir` : 'Un booster à ouvrir',
      message: 'Ils t’attendent sur l’accueil du jeu.',
      href: '/jeu'
    });
}

async function pollBoosters() {
  try {
    await onStatus((await gameStatus()).pending);
  } catch (e) {
    if (e?.status === 401) setBadge(0, true);
  }
}

// ---------- nouvelles versions ----------

// Cherche une version plus récente sur GitHub (toujours la dernière) et la signale une fois par version.
async function lookForUpdate(maxAge = 9 * 60e3) {
  if (FIREFOX) return; // les utilisateurs de Firefox prennent le script
  const { updateCheckedAt } = await chrome.storage.local.get('updateCheckedAt');
  if (Date.now() - (updateCheckedAt ?? 0) < maxAge) return;
  await chrome.storage.local.set({ updateCheckedAt: Date.now() });
  try {
    const update = await checkUpdate();
    if (!update) return;
    const { updateNotified } = await chrome.storage.local.get('updateNotified');
    if (updateNotified === update.version) return;
    await chrome.storage.local.set({ updateNotified: update.version });
    notify('update', {
      title: `Aquaman ${update.version} est disponible`,
      message: 'Ouvre la fenêtre d’Aquaman et clique sur « Mettre à jour ».',
      href: `https://github.com/${REPO}/releases/latest`
    });
  } catch {}
}

// « Mettre à jour » : l'assistant installé sur l'ordinateur remplace les fichiers, puis l'extension redémarre.
async function installUpdate() {
  const update = (await checkUpdate().catch(() => null)) ?? (await chrome.storage.local.get('update')).update;
  if (!update) return { error: 'no_update' };
  let res;
  try {
    res = await chrome.runtime.sendNativeMessage(UPDATER, { action: 'update', version: update.version, url: FIREFOX ? update.xpi : update.zip });
  } catch {
    return { error: 'no_updater', update };
  }
  if (res?.error === 'version_mismatch' && res.detail && !newer(update.version, res.detail)) res = { ok: true, version: res.detail };
  if (!res?.ok) return { error: res?.error ?? 'failed', detail: res?.detail, update };
  setTimeout(() => chrome.runtime.reload(), 800);
  return { ok: true, version: res.version, update };
}

// Après une mise à jour : vide le cache du site et recharge ses onglets.
async function refreshSite() {
  try {
    await chrome.browsingData?.remove({ origins: [ORIGIN] }, { cache: true, cacheStorage: true });
  } catch {}
  const tabs = await chrome.tabs.query({ url: `${ORIGIN}/*` }).catch(() => []);
  for (const tab of tabs) chrome.tabs.reload(tab.id, { bypassCache: true }).catch(() => {});
}

// Dit qu'une nouvelle version a été installée, avec un lien vers ce qui a changé.
async function announceUpdate(previousVersion) {
  const version = chrome.runtime.getManifest().version;
  if (!previousVersion || previousVersion === version) return;
  if (!(await getSettings()).notifyUpdated) return;
  notify('updated', {
    title: `Aquaman est passé en ${version}`,
    message: 'Clique pour voir les nouveautés de cette version.',
    href: '/jeu#aqm-nouveautes'
  });
}

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  await chrome.storage.local.remove(['update', 'updateCheckedAt']);
  await schedule();
  if (reason === 'update') {
    await refreshSite();
    announceUpdate(previousVersion);
  }
  pollBoosters();
  lookForUpdate();
});

chrome.runtime.onStartup.addListener(() => {
  schedule();
  pollBoosters();
  lookForUpdate();
});

// ---------- messages ----------

async function handle(msg) {
  switch (msg?.type) {
    case 'status':
      await onStatus(msg.pending ?? 0);
      return { ok: true };
    case 'check-update':
      await lookForUpdate(60e3);
      return { ok: true };
    case 'install-update':
      return installUpdate();
    case 'open':
      await openSite(msg.href);
      return { ok: true };
    default:
      return answer(msg);
  }
}

// Seulement les pages d'Aquaman (sa fenêtre) et ses scripts dans les pages du jeu : les réponses portent ce que lit la
// session du joueur (sa collection, ses amis…), jamais donné à un autre expéditeur.
const trusted = (sender) => {
  if (sender?.id !== chrome.runtime.id) return false;
  if (!sender.tab || String(sender.url ?? '').startsWith(chrome.runtime.getURL(''))) return true;
  try {
    return new URL(sender.url ?? sender.tab.url ?? '').origin === ORIGIN;
  } catch {
    return false;
  }
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!trusted(sender)) return void reply({ error: 'forbidden' });
  handle(msg).then(reply, (e) => reply({ error: e?.message || String(e) }));
  return true;
});
