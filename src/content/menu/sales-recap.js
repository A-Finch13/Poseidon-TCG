// Aquaman, code de la page : « Récap des ventes » (menu Plus), les Perles gagnées chaque jour au marché.

const ICON_TAG =
  '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M243.31,136,144,36.69A15.86,15.86,0,0,0,132.69,32H40a8,8,0,0,0-8,8v92.69A15.86,15.86,0,0,0,36.69,144L136,243.31a16,16,0,0,0,22.63,0l84.68-84.68a16,16,0,0,0,0-22.63Zm-96,96L48,132.69V48h84.69L232,147.31ZM96,84A12,12,0,1,1,84,72,12,12,0,0,1,96,84Z"/></svg>';

// Global / Prix fixe / Enchères, gardé sur l'appareil.
const RECAP_KIND_KEY = 'aqm-sales-recap-kind';
const RECAP_KINDS = [
  ['all', 'Global', 'Ventes à prix fixe et enchères.'],
  ['fixed', 'Prix fixe', 'Ventes à prix fixe seulement (annonces du marché).'],
  ['auction', 'Enchères', 'Enchères vendues seulement (offre gagnante ou achat immédiat).']
];
const RECAP_DAYS = 30;

// Les Perles nettes de chaque jour sur 30 jours : à partir du jour de la plus ancienne vente connue, puis la fenêtre
// glisse pour toujours finir sur aujourd'hui (comme Orm). Un histogramme, et le détail jour par jour.
async function openSalesRecap() {
  const body = openOverlay('Récap des ventes', 'Les Perles que tu gagnes chaque jour au marché, après la commission de 5 % du jeu.');
  body.parentElement.classList.add('aqm-panel-wide');
  const view = h('div', { class: 'aqm-recap' }, h('p', { class: 'aqm-note' }, 'Lecture de tes ventes…'));
  body.append(view);
  let sales;
  try {
    sales = (await ask({ type: 'sales-recap' })).sales ?? [];
  } catch (e) {
    if (view.isConnected) view.replaceChildren(h('p', { class: 'aqm-note' }, e.message));
    return;
  }
  if (!view.isConnected) return;
  let kind = 'all';
  try {
    const saved = localStorage.getItem(RECAP_KIND_KEY);
    if (RECAP_KINDS.some(([k]) => k === saved)) kind = saved;
  } catch {}

  const noon = (t) => {
    const d = new Date(t);
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  };
  const today = noon(Date.now());
  const oldest = sales.reduce((m, s) => Math.min(m, s.at), Date.now());
  const start = Math.max(noon(oldest), today - (RECAP_DAYS - 1) * DAY_MS);
  const keyOf = (t) => new Date(t).toLocaleDateString('sv');
  const todayKey = keyOf(today);
  const win = Array.from({ length: RECAP_DAYS }, (_, i) => {
    const t = noon(start + i * DAY_MS); // (midi : à l'abri des changements d'heure)
    const key = keyOf(t);
    return { t, key, today: key === todayKey, future: key > todayKey };
  });

  const render = () => {
    const picked = sales.filter((s) => kind === 'all' || s.kind === kind);
    const byDay = new Map();
    for (const s of picked) {
      const d = byDay.get(keyOf(s.at)) ?? { sold: 0, perles: 0 };
      d.sold++;
      d.perles += s.net;
      byDay.set(keyOf(s.at), d);
    }
    const days = win.map((d) => ({ ...d, ...(byDay.get(d.key) ?? { sold: 0, perles: 0 }) }));
    const past = days.filter((d) => !d.future);
    const total = past.reduce((t, d) => ({ sold: t.sold + d.sold, perles: t.perles + d.perles }), { sold: 0, perles: 0 });
    const max = Math.max(1, ...days.map((d) => d.perles));
    const best = days.reduce((b, d) => (d.perles > (b?.perles ?? 0) ? d : b), null);
    const plural = (n, word) => `${fmt(n)} ${word}${n > 1 ? 's' : ''}`;
    const longName = (d) => (d.today ? 'aujourd’hui' : new Date(d.t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));

    const chips = h(
      'div',
      { class: 'aqm-recap-kinds', role: 'group', 'aria-label': 'Type de vente' },
      RECAP_KINDS.map(([k, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: `aqm-recap-kind${k === kind ? ' is-on' : ''}`,
            'aria-pressed': String(k === kind),
            onclick: () => {
              kind = k;
              try {
                localStorage.setItem(RECAP_KIND_KEY, k);
              } catch {}
              render();
            }
          },
          label
        )
      )
    );
    const chart = h(
      'div',
      { class: 'aqm-recap-chart', role: 'img', 'aria-label': `Perles nettes par jour, ${RECAP_DAYS} jours` },
      days.map((d, i) => {
        const tip = d.future ? `${longName(d)} : à venir` : `${longName(d)} : ${fmt(d.perles)} Perles, ${plural(d.sold, 'vente')}`;
        return h(
          'div',
          { class: `aqm-recap-day${d.today ? ' is-today' : ''}${d.future ? ' is-future' : ''}${i % 2 ? ' is-odd' : ''}`, title: tip, 'aria-label': tip, tabindex: d.future ? null : '0' },
          h('span', { class: 'aqm-recap-col' }, [
            // (la valeur écrite seulement sur la meilleure journée et sur aujourd'hui ; les autres au survol)
            d.perles && (d === best || d.today) ? h('span', { class: 'aqm-recap-val', style: `bottom:${((100 * d.perles) / max).toFixed(1)}%` }, `+${fmt(d.perles)}`) : null,
            h('span', { class: 'aqm-recap-bar', style: `height:${d.perles ? Math.max(2, (100 * d.perles) / max).toFixed(1) : 0}%` })
          ]),
          h('span', { class: 'aqm-recap-name' }, d.today ? 'Auj.' : String(new Date(d.t).getDate()))
        );
      })
    );
    const name = (d) => (d.today ? 'aujourd’hui' : new Date(d.t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));
    const details = h(
      'details',
      { class: 'aqm-recap-details' },
      h('summary', {}, 'Détail jour par jour'),
      h(
        'table',
        { class: 'aqm-recap-table' },
        h(
          'tbody',
          {},
          [...past].reverse().map((d) =>
            h('tr', { class: d.today ? 'is-today' : d.sold ? '' : 'is-empty' }, h('td', {}, name(d)), h('td', { class: 'n' }, d.sold ? plural(d.sold, 'vente') : '–'), h('td', { class: 'p' }, d.perles ? `${fmt(d.perles)} Perles` : '–'))
          )
        )
      )
    );
    view.replaceChildren(
      h(
        'section',
        { class: 'aqm-recap-card' },
        h('div', { class: 'aqm-recap-head' }, h('h3', { class: 'aqm-recap-title' }, 'Perles gagnées par jour'), h('span', { class: 'aqm-recap-total' }, `${plural(total.sold, 'vente')} · ${fmt(total.perles)} Perles`)),
        chips,
        chart,
        details,
        h('p', { class: 'aqm-note' }, RECAP_KINDS.find(([k]) => k === kind)[2])
      )
    );
  };
  render();
}

// Le relevé des ventes en continu (voir salesSync dans src/lib/sales.js) : demandé au plus une fois par minute depuis
// cette page, le service de fond n'en fait qu'un toutes les 5 minutes.
let salesSyncAt = 0;
function syncSalesNow() {
  if (Date.now() - salesSyncAt < 60e3) return;
  salesSyncAt = Date.now();
  send({ type: 'sales-sync' });
}
