// Aquaman, code de la page : les joueurs qui utilisent Aquaman (l'auteur seulement).

// ---------- les joueurs qui utilisent Aquaman (l'auteur seulement) ----------

// Le compte connecté sur cette page, demandé au site lui-même (jamais un compte retenu : le compte peut changer).
async function accountId() {
  try {
    const res = await pageFetch('/api/auth/check', { credentials: 'include', headers: { accept: 'application/json' } });
    return (await res.json())?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function openUsers() {
  meId = await accountId();
  if (meId !== AUTHOR_ID) return; // réservé au compte de l'auteur, revérifié sur le site
  const body = openOverlay('Joueurs avec Aquaman', 'Les joueurs qui utilisent Aquaman : toi d’abord, puis la version la plus récente en premier et, à version égale, le plus récemment vu. Visible par toi seul.');
  body.parentElement.classList.add('aqm-panel-wide');
  const view = h('div');
  body.append(view);

  // Ce que voit l'auteur dans la liste des appareils, « Brave · Windows » par exemple.
  const deviceName = () => {
    const ua = navigator.userAgent;
    const browser = navigator.brave ? 'Brave' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? 'Safari' : 'Chrome';
    const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Linux';
    return `${browser} · ${system}`;
  };
  const showCode = (id) => `${id.slice(0, 4)}-${id.slice(4)}`;
  let polling = 0;

  // Cet appareil n'est pas encore approuvé : le code du propriétaire une fois, ou l'approbation depuis un appareil déjà
  // approuvé.
  function approve(r) {
    const input = h('input', { type: 'password', class: 'aqm-search', placeholder: 'Code propriétaire', 'aria-label': 'Code propriétaire', autocomplete: 'off' });
    const go = h('button', { type: 'button', class: 'aqm-album-btn is-main' }, 'Approuver');
    const note = h('p', { class: 'aqm-muted', role: 'status' }, r.wrong ? 'Ce code n’est pas le bon.' : r.revoked ? 'Cet appareil a été révoqué.' : '');
    const submit = async () => {
      if (!input.value.trim()) return;
      go.disabled = true;
      const res = await ask({ type: 'admin-code', token: input.value.trim(), name: deviceName() }).catch((e) => ({ error: e.message }));
      go.disabled = false;
      if (res.wrong) note.textContent = 'Ce code n’est pas le bon.';
      else if (res.error) note.textContent = res.error;
      else load();
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    const pending = r.device?.state === 'pending';
    const other = h('button', { type: 'button', class: 'aqm-album-btn' }, 'Demander l’approbation à un autre appareil');
    other.addEventListener('click', async () => {
      other.disabled = true;
      await ask({ type: 'admin-request', name: deviceName() }).catch(() => {});
      load();
    });
    view.replaceChildren(
      h('p', { class: 'aqm-note' }, 'Cet appareil n’est pas encore approuvé. Il ne l’est qu’une fois : ensuite, plus rien à faire.'),
      pending
        ? h(
            'div',
            { class: 'aqm-device-wait' },
            h('p', {}, 'Code de cet appareil : ', h('strong', {}, showCode(r.device.id))),
            h('p', { class: 'aqm-muted' }, 'Ouvre « Joueurs avec Aquaman » sur un appareil déjà approuvé et approuve celui qui porte ce code. Cette page se met à jour toute seule.')
          )
        : h('div', { class: 'aqm-pick' }, other),
      h('p', { class: 'aqm-label aqm-who-gap' }, pending ? 'Ou avec le code propriétaire' : 'Avec le code propriétaire (premier appareil)'),
      h('div', { class: 'aqm-pick aqm-users-code' }, input, go),
      note
    );
    clearTimeout(polling);
    if (pending) polling = setTimeout(() => body.isConnected && load(), 5000);
  }

  // Les appareils de l'auteur : ceux en attente (approuver ou refuser), ceux approuvés (révoquer).
  async function devices(box) {
    const r = await ask({ type: 'admin-devices' }).catch(() => null);
    if (!r?.devices) return;
    const { adminDevice: mine } = await chrome.storage.local.get('adminDevice');
    const act = (label, type, id, main) => {
      const btn = h('button', { type: 'button', class: `aqm-album-btn${main ? ' is-main' : ''}` }, label);
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await ask({ type, id }).catch(() => {});
        devices(box);
      });
      return btn;
    };
    box.replaceChildren(
      h('p', { class: 'aqm-label aqm-who-gap' }, 'Mes appareils'),
      h(
        'ul',
        { class: 'aqm-users' },
        r.devices.map((d) =>
          h(
            'li',
            { class: 'aqm-user' },
            h('strong', { class: 'aqm-device-code' }, showCode(d.id)),
            h('span', { class: 'aqm-name' }, d.name || 'Appareil', d.id === mine?.id ? h('span', { class: 'aqm-tag' }, 'Cet appareil') : null),
            h('span', { class: 'aqm-muted' }, d.state === 'pending' ? 'En attente' : d.lastUsed ? `Utilisé ${timeAgo(d.lastUsed)}` : 'Approuvé'),
            d.state === 'pending' ? [act('Approuver', 'admin-approve', d.id, true), act('Refuser', 'admin-revoke', d.id)] : act('Révoquer', 'admin-revoke', d.id)
          )
        )
      )
    );
  }

  async function load() {
    clearTimeout(polling);
    view.replaceChildren(h('p', { class: 'aqm-note' }, 'Chargement…'));
    let r;
    try {
      r = await ask({ type: 'aquaman-users' });
    } catch (e) {
      view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
      return;
    }
    if (r.needDevice) return approve(r);
    show(r.users);
    const box = h('div');
    view.append(box);
    devices(box);
  }

  // Chaque sorte d'Aquaman d'un joueur (les deux quand il utilise l'extension et le script).
  const kindsOf = (u) => (u.installs?.length ? u.installs : [{ kind: u.kind, version: u.version, lastSeen: u.lastSeen }]);
  const kindName = (kind) => (kind === 'userscript' ? 'Script' : kind === 'extension' ? 'Extension' : '?');
  // Vu dans les 15 dernières minutes : Aquaman dit bonjour toutes les 10 minutes tant qu'une page du jeu est ouverte.
  const online = (u) => Date.now() - u.lastSeen < 15 * 60e3;

  // Une version sous forme de nombre à comparer (« 1.4.10 » après « 1.4.9 ») ; 0 quand elle est inconnue.
  const versionRank = (v) => (/^\d+\.\d+\.\d+$/.test(v ?? '') ? v.split('.').reduce((n, x) => n * 1000 + Number(x), 0) : 0);
  const bestVersion = (u) => Math.max(0, ...kindsOf(u).map((i) => versionRank(i.version)));

  function show(players) {
    // L'auteur d'abord, puis la version d'Aquaman la plus récente d'abord, puis le plus récemment vu.
    const all = [...players].sort((a, b) => (b.id === AUTHOR_ID) - (a.id === AUTHOR_ID) || bestVersion(b) - bestVersion(a) || b.lastSeen - a.lastSeen);
    const day = Date.now() - 86400e3;
    const week = Date.now() - 7 * 86400e3;
    const versions = {};
    for (const u of all) for (const i of kindsOf(u)) versions[i.version ?? '?'] = (versions[i.version ?? '?'] ?? 0) + 1;
    const using = (kind) => all.filter((u) => kindsOf(u).some((i) => i.kind === kind)).length;
    const stat = (label, value) => h('div', { class: 'aqm-metric' }, h('small', {}, label), h('strong', {}, value));
    const search = h('input', { type: 'search', class: 'aqm-search', placeholder: 'Chercher un joueur…', 'aria-label': 'Chercher un joueur' });
    const list = h('ul', { class: 'aqm-users' });
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const shown = q ? all.filter((u) => String(u.name ?? '').toLowerCase().includes(q) || u.id.includes(q)) : all;
      list.replaceChildren(
        ...shown.map((u) =>
          h(
            'li',
            { class: 'aqm-user' },
            h('img', { class: 'aqm-avatar', src: avatarUrl(u.id), alt: '', loading: 'lazy' }),
            h('a', { class: 'aqm-name', href: `/profile/${encodeURIComponent(u.id)}` }, u.name || u.id),
            h(
              'span',
              { class: 'aqm-user-kinds' },
              kindsOf(u).map((i) =>
                h(
                  'span',
                  { class: `aqm-tag aqm-kind-${i.kind ?? 'x'}`, title: `${kindName(i.kind)} vu${i.lastSeen ? ` ${timeAgo(i.lastSeen)}` : ''}` },
                  `${kindName(i.kind)}${i.version ? ` v${i.version}` : ''}`
                )
              )
            ),
            u.revoked ? h('span', { class: 'aqm-tag aqm-revoked' }, 'Révoqué') : online(u) ? h('span', { class: 'aqm-tag aqm-online' }, 'En ligne') : h('span'),
            h('span', { class: 'aqm-user-seen', title: `Vu la première fois le ${new Date(u.firstSeen).toLocaleDateString('fr-FR')}` }, timeAgo(u.lastSeen)),
            u.id === AUTHOR_ID ? null : revokeButton(u)
          )
        )
      );
    };
    // Retire Aquaman à un joueur (il s'arrête de son côté en moins d'une minute), ou le lui rend.
    const revokeButton = (u) => {
      const btn = h('button', { type: 'button', class: 'aqm-album-btn aqm-user-revoke' }, u.revoked ? 'Rétablir' : 'Révoquer');
      btn.addEventListener('click', async () => {
        const name = u.name || u.id;
        if (!u.revoked && !confirm(`Révoquer Aquaman pour ${name} ? Il s’arrêtera chez ce joueur dans la minute, jusqu’à ce que tu le rétablisses.`)) return;
        btn.disabled = true;
        const res = await ask({ type: 'admin-revoke-player', id: u.id, revoked: !u.revoked }).catch((e) => ({ error: e.message }));
        if (res?.needDevice) return load();
        if (res?.ok) u.revoked = !u.revoked;
        render();
      });
      return btn;
    };
    search.addEventListener('input', render);
    view.replaceChildren(
      h(
        'div',
        { class: 'aqm-who-stats aqm-users-stats' },
        stat('Joueurs', fmt(all.length)),
        stat('En ligne', fmt(all.filter(online).length)),
        stat('Vus ces 24 h', fmt(all.filter((u) => u.lastSeen >= day).length)),
        stat('Vus ces 7 jours', fmt(all.filter((u) => u.lastSeen >= week).length)),
        stat('Extension / script', `${fmt(using('extension'))} / ${fmt(using('userscript'))}`)
      ),
      h(
        'p',
        { class: 'aqm-note' },
        'Versions : ',
        Object.entries(versions)
          .sort((a, b) => versionRank(b[0]) - versionRank(a[0]) || b[1] - a[1])
          .map(([v, n]) => `${v === '?' ? 'inconnue' : v} (${n})`)
          .join(', '),
        '.'
      ),
      h('div', { class: 'aqm-pick' }, search),
      list
    );
    render();
  }

  load();
}
