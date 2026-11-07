// Userscript: the background worker's answers to the page code, done in the page.
// No badge, notifications or updater here: the script manager installs new versions; content.js offers them as soon as
// they are out.

const UPDATE_EVERY = 10 * 60e3;

// The latest GitHub release when it is newer than this script (looked for every 10 minutes at most, by any tab).
async function scriptUpdate() {
  const { updateCheckedAt = 0 } = await chrome.storage.local.get('updateCheckedAt');
  if (Date.now() - updateCheckedAt >= UPDATE_EVERY) {
    await chrome.storage.local.set({ updateCheckedAt: Date.now() });
    await checkUpdate().catch(() => null);
  }
  const { update } = await chrome.storage.local.get('update');
  return { update: update && newer(update.version, VERSION) ? update : null };
}

// Answers the messages of the page code.
async function handle(msg) {
  switch (msg?.type) {
    case 'status':
      return { ok: true };
    case 'check-update':
      return scriptUpdate();
    case 'install-update':
      return { error: 'userscript' };
    case 'open': {
      // (only a page of the game or Aquaman's GitHub pages: never "javascript:" or another site)
      const url = safeHref(msg.href);
      if (!url) return { error: 'bad_href' };
      location.assign(url);
      return { ok: true };
    }
    default:
      return answer(msg);
  }
}
