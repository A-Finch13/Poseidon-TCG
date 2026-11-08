// Aquaman, code de la page : la fenêtre des pages de l'extension, et sa boîte de question.

// ---------- fenêtre des pages de l'extension ----------

let overlay = null;

// Fenêtre complète avec un titre ; renvoie son corps.
function openOverlay(title, subtitle) {
  closeOverlay();
  overlayClosed = null;
  const body = h('div', { class: 'aqm-body' });
  const panel = h(
    'div',
    { class: 'aqm-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'div',
      { class: 'aqm-head' },
      h('div', {}, h('h2', { class: 'aqm-title' }, title), subtitle ? h('p', { class: 'aqm-sub' }, subtitle) : null),
      h('button', { type: 'button', class: 'aqm-close', 'aria-label': 'Fermer', html: ICON_X, onclick: closeOverlay })
    ),
    body
  );
  overlay = h('div', { class: 'aqm-root aqm-overlay', onclick: (e) => e.target === e.currentTarget && closeOverlay() }, panel);
  document.body.append(overlay);
  root.classList.add('aqm-lock');
  panel.querySelector('.aqm-close').focus();
  return body;
}

function closeOverlay() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  root.classList.remove('aqm-lock');
  const then = overlayClosed;
  overlayClosed = null;
  then?.();
}
let overlayClosed = null; // appelé une fois à la fermeture de la fenêtre

// Une question dans la fenêtre d'Aquaman, à la place de celles du navigateur : true pour son bouton principal, false
// quand elle est fermée autrement. Sans cancel, un message (son seul bouton le ferme). Les paragraphes sont séparés par
// une ligne vide.
function askDialog(title, text, ok = 'OK', cancel = null) {
  return new Promise((resolve) => {
    const body = openOverlay(title);
    body.closest('.aqm-panel')?.classList.add('is-ask');
    let answer = false;
    overlayClosed = () => resolve(answer);
    const pick = (value) => {
      answer = value;
      closeOverlay();
    };
    body.append(
      ...text.split('\n\n').map((p) => h('p', { class: 'aqm-ask-text' }, p)),
      h('div', { class: 'aqm-ask-actions' },
        cancel ? h('button', { type: 'button', class: 'aqm-queue-btn', onclick: () => pick(false) }, cancel) : null,
        h('button', { type: 'button', class: 'aqm-queue-btn is-main', onclick: () => pick(true) }, ok))
    );
    body.querySelector('.aqm-ask-actions .is-main').focus();
  });
}

// Rangée de pastilles, l'une d'elles sélectionnée.
const chips = (options, current, onPick) =>
  h(
    'div',
    { class: 'aqm-chips', role: 'tablist' },
    options.map(([value, label]) =>
      h('button', { type: 'button', role: 'tab', class: `aqm-chip${value === current ? ' is-on' : ''}`, 'aria-selected': String(value === current), onclick: () => onPick(value) }, label)
    )
  );
