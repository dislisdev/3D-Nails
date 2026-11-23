// Πειραματικό · Οδηγός λήψης 0.1.0 · φωτογραφίες από αυτή τη σελίδα.
const viewNames = { top: 'Από πάνω', fan: 'Βεντάλια', side: 'Από το πλάι' };

export function shotLabel(shot) {
  return viewNames[shot.step] + (shot.step === 'fan' ? ' · Λήψη ' + shot.number : '');
}

export function mountPhotoZoom({ document, guide }) {
  const byId = id => document.getElementById(id);
  const modal = byId('photo-zoom');
  const title = byId('photo-zoom-title');
  const image = byId('photo-zoom-image');
  const area = byId('photo-zoom-area');
  const enlarge = byId('photo-zoom-in');
  const shrink = byId('photo-zoom-out');
  let shown;
  let trigger;

  function zoom(expanded) {
    area.toggleAttribute('data-expanded', expanded);
    enlarge.disabled = expanded;
    shrink.disabled = !expanded;
    area.scrollTop = 0;
    area.scrollLeft = 0;
  }

  function open(shot, button) {
    shown = shot;
    trigger = button;
    title.textContent = shotLabel(shot);
    image.alt = 'Φωτογραφία · ' + shotLabel(shot);
    image.src = shot.url;
    zoom(false);
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }

  function clean() {
    image.removeAttribute('src');
    shown = null;
    if (trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus({ preventScroll: true });
    trigger = null;
  }

  function close() {
    if (!modal.open) return;
    image.removeAttribute('src');
    if (typeof modal.close === 'function') modal.close();
    else {
      modal.removeAttribute('open');
      clean();
    }
  }

  modal.addEventListener('close', clean);
  byId('photo-zoom-close').addEventListener('click', close);
  enlarge.addEventListener('click', () => { zoom(true); area.focus(); });
  shrink.addEventListener('click', () => { zoom(false); area.focus(); });
  guide.subscribe(state => {
    if (shown && (state.step < 6 || state.photos.get(shown.id) !== shown)) close();
  });

  return { open };
}

export function makeThumbnail(document, shot, zoom) {
  const button = document.createElement('button');
  const image = document.createElement('img');
  button.type = 'button';
  button.className = 'thumbnail';
  button.setAttribute('aria-label', 'Μεγέθυνε τη φωτογραφία «' + shotLabel(shot) + '»');
  image.alt = '';
  image.src = shot.thumbUrl ?? shot.url;
  image.loading = 'lazy';
  button.append(image);
  button.addEventListener('click', () => zoom.open(shot, button));
  return button;
}
