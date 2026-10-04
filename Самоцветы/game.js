/* Pure game rules, also exported for Node verification. */
(function (root) {
  'use strict';
  const SIZE = 8, TYPES = 6;
  const randomGem = (types = TYPES) => Math.floor(Math.random() * types);
  function runs(board) {
    const result = [];
    for (let axis = 0; axis < 2; axis++) {
      for (let line = 0; line < SIZE; line++) {
        let start = 0;
        const index = pos => axis === 0 ? line * SIZE + pos : pos * SIZE + line;
        while (start < SIZE) {
          let end = start + 1;
          while (end < SIZE && board[index(start)] !== null && board[index(end)] === board[index(start)]) end++;
          if (end - start >= 3) result.push({ axis: axis === 0 ? 'row' : 'col', color: board[index(start)], cells: Array.from({ length: end - start }, (_, offset) => index(start + offset)) });
          start = end;
        }
      }
    }
    return result;
  }
  function matches(board) {
    const found = new Set();
    runs(board).forEach(run => run.cells.forEach(index => found.add(index)));
    return found;
  }
  function matchDetails(board) {
    const allRuns = runs(board);
    const cells = new Set();
    allRuns.forEach(run => run.cells.forEach(index => cells.add(index)));
    const intersections = [];
    cells.forEach(index => {
      const horizontal = allRuns.some(run => run.axis === 'row' && run.cells.includes(index));
      const vertical = allRuns.some(run => run.axis === 'col' && run.cells.includes(index));
      if (horizontal && vertical) intersections.push(index);
    });
    return { cells, runs: allRuns, intersections, shaped: intersections.length > 0, longest: allRuns.reduce((max, run) => Math.max(max, run.cells.length), 0) };
  }
  function adjacent(a, b) { return Math.abs(a % SIZE - b % SIZE) + Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) === 1; }
  function swap(board, a, b) { [board[a], board[b]] = [board[b], board[a]]; }
  function hasMove(board, blocked = new Set()) {
    for (let a = 0; a < board.length; a++) {
      for (const b of [a + 1, a + SIZE]) {
        if (b >= board.length || !adjacent(a, b) || blocked.has(a) || blocked.has(b) || board[a] === null || board[b] === null) continue;
        swap(board, a, b);
        const valid = matches(board).size > 0;
        swap(board, a, b);
        if (valid) return true;
      }
    }
    return false;
  }
  function createBoard(types = TYPES, blocked = new Set()) {
    let board;
    do {
      board = [];
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (blocked.has(i)) { board.push(null); continue; }
        let gem;
        do { gem = randomGem(types); } while ((i % SIZE >= 2 && board[i - 1] === gem && board[i - 2] === gem) || (i >= SIZE * 2 && board[i - SIZE] === gem && board[i - SIZE * 2] === gem));
        board.push(gem);
      }
    } while (!hasMove(board, blocked));
    return board;
  }
  function collapse(board, removed, nextGem = randomGem, blocked = new Set()) {
    const changed = new Set();
    for (let col = 0; col < SIZE; col++) {
      let segmentStart = 0;
      for (let boundary = 0; boundary <= SIZE; boundary++) {
        const boundaryIndex = boundary < SIZE ? boundary * SIZE + col : -1;
        if (boundary < SIZE && !blocked.has(boundaryIndex)) continue;
        const survivors = [];
        for (let row = segmentStart; row < boundary; row++) {
          const index = row * SIZE + col;
          if (!removed.has(index) && board[index] !== null) survivors.push(board[index]);
        }
        const missing = boundary - segmentStart - survivors.length;
        for (let row = segmentStart; row < boundary; row++) {
          const index = row * SIZE + col;
          const value = row < segmentStart + missing ? nextGem() : survivors[row - segmentStart - missing];
          if (board[index] !== value || removed.has(index)) changed.add(index);
          board[index] = value;
        }
        if (boundary < SIZE) board[boundaryIndex] = null;
        segmentStart = boundary + 1;
      }
    }
    return changed;
  }
  const rules = { SIZE, TYPES, runs, matches, matchDetails, adjacent, swap, hasMove, createBoard, collapse };
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
  else root.GemRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
