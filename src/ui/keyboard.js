// /src/ui/keyboard.js
const LAYOUT = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export function initKeyboard(kbdEl, onKey) {
  LAYOUT.forEach(line => line.split('').forEach(ch => addKey(kbdEl, ch, false)));
  addKey(kbdEl, 'Enter', true);
  addKey(kbdEl, 'Backspace', true, 'Del');

  kbdEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.key');
    if (!btn) return;
    onKey(btn.dataset.key);
  });
}

function addKey(kbdEl, code, wide = false, label = '') {
  const key = document.createElement('button');
  key.className = 'key' + (wide ? ' wide' : '');
  key.type = 'button';
  key.textContent = label || code;
  key.dataset.key = code;
  key.setAttribute('role', 'button');
  key.tabIndex = 0;
  kbdEl.appendChild(key);
}
