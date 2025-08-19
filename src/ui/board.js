// /src/ui/board.js
export function initBoard(boardEl, { rows = 6, cols = 5 } = {}) {
  boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  for (let r = 0; r < rows; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';
    rowEl.setAttribute('role', 'row');
    for (let c = 0; c < cols; c++) {
      const t = document.createElement('div');
      t.className = 'tile';
      t.id = `t-${r}-${c}`;
      t.setAttribute('role', 'gridcell');
      rowEl.appendChild(t);
    }
    boardEl.appendChild(rowEl);
  }
}

export function drawLetters(guesses) {
  for (let r = 0; r < guesses.length; r++) {
    for (let c = 0; c < guesses[r].length; c++) {
      const t = document.getElementById(`t-${r}-${c}`);
      if (t) t.textContent = guesses[r][c] || '';
    }
  }
}

export function colorizeRow(r, result, guesses, kbdEl) {
  for (let c = 0; c < result.length; c++) {
    const t = document.getElementById(`t-${r}-${c}`);
    setTimeout(() => {
      if (!t) return;
      t.classList.add('revealed', result[c]);
      const ch = guesses[r][c]?.toUpperCase();
      if (ch) {
        const key = kbdEl.querySelector(`[data-key='${ch}']`);
        if (key) {
          const s = key.getAttribute('data-state');
          if (result[c] === 'correct' || (result[c] === 'present' && s !== 'correct') || !s) {
            key.setAttribute('data-state', result[c]);
          }
        }
      }
    }, c * 90);
  }
}
