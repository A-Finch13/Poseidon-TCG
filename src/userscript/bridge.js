// Userscript: the background worker's answers to the page code, done in the page.
// No badge, notifications or updater here: the script manager installs new versions by itself.

// Answers the messages of the page code.
async function handle(msg) {
  switch (msg?.type) {
    case 'status':
    case 'check-update':
      return { ok: true };
    case 'install-update':
      return { error: 'userscript' };
    case 'open':
      location.assign(msg.href);
      return { ok: true };
    default:
      return answer(msg);
  }
}
