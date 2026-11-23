// Πειραματικό · Οδηγός λήψης 0.1.1 · επιλογή πηγής του browser.
export function createCameraListbox({ document, list, choose, clock, typeaheadMs }) {
  let entries = [];
  let selectedId;
  let active = 0;
  let options = [];
  let disabled = false;
  let typed = '';
  let typedAt = -Infinity;
  const compare = new Intl.Collator('el', { sensitivity: 'base', usage: 'search' });

  function renderActive() {
    if (options[active]) list.setAttribute('aria-activedescendant', options[active].id);
    else list.removeAttribute('aria-activedescendant');
    options.forEach((option, index) => option.toggleAttribute('data-active', index === active));
  }

  function activate(index, scroll = true) {
    active = Math.max(0, Math.min(options.length - 1, index));
    renderActive();
    if (scroll) options[active]?.scrollIntoView({ block: 'nearest' });
  }

  function select() {
    const entry = entries[active];
    if (entry && entry.id !== selectedId && !disabled) choose(entry.id);
  }

  list.addEventListener('keydown', event => {
    if (disabled || !options.length) return;
    const { key } = event;
    switch (key) {
      case 'ArrowUp': activate(active - 1); break;
      case 'ArrowDown': activate(active + 1); break;
      case 'Home': activate(0); break;
      case 'End': activate(options.length - 1); break;
      case ' ':
      case 'Enter': select(); break;
      default: {
        if (key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
        const now = clock.now();
        typed = now - typedAt > typeaheadMs ? key : typed + key;
        typedAt = now;
        for (let offset = 1; offset <= options.length; offset++) {
          const index = (active + offset) % options.length;
          const label = entries[index].label ?? 'Κάμερα ' + (index + 1);
          if (compare.compare(label.slice(0, typed.length), typed) === 0) {
            activate(index);
            break;
          }
        }
      }
    }
    event.preventDefault();
  });

  list.addEventListener('click', event => {
    const index = options.indexOf(event.target.closest('[role="option"]'));
    if (index < 0 || disabled) return;
    activate(index, false);
    list.focus({ preventScroll: true });
    select();
  });

  return (devices, selected, busy) => {
    disabled = busy;
    list.setAttribute('aria-disabled', String(busy));
    list.setAttribute('aria-busy', String(busy));
    if (devices === entries && selected === selectedId) return;
    entries = devices;
    selectedId = selected;
    options = devices.map((device, index) => {
      const option = document.createElement('li');
      option.id = 'camera-option-' + (index + 1);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(device.id === selectedId));
      option.textContent = device.label ?? 'Κάμερα ' + (index + 1);
      if (device.id === selectedId) {
        const label = document.createElement('small');
        label.className = 'hint';
        label.setAttribute('aria-hidden', 'true');
        label.textContent = 'Επιλεγμένη';
        option.append(label);
      }
      return option;
    });
    list.replaceChildren(...options);
    activate(devices.findIndex(({ id }) => id === selected), false);
  };
}
