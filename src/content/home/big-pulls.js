// Aquaman, code de la page : accueil, « Les beaux tirages » en plus grand.

// ---------- accueil : « Les beaux tirages » en plus grand ----------

function enlargePulls() {
  if (!/^\/jeu\/?$/.test(location.pathname)) return;
  for (const label of elementsWithText(document.body, /^\s*(les )?beaux tirages\s*$/i)) {
    let section = label.parentElement;
    while (section && section !== document.body && section.querySelectorAll('img').length < 2) section = section.parentElement;
    if (!section || section === document.body) continue;
    section.classList.add('aqm-pulls');
    for (const img of section.querySelectorAll('img')) {
      if (img.closest('.aqm-pull-thumb')) continue;
      const parent = img.parentElement;
      const wrap = parent && parent !== section && parent.children.length === 1 && !parent.textContent.trim() && parent.tagName !== 'A' ? parent : img;
      wrap.classList.add('aqm-pull-thumb');
    }
  }
}
