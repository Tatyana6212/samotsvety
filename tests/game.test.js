const assert = require('node:assert/strict');
const { matches, adjacent, swap, createBoard, collapse, hasMove } = require('../game.js');
const { matchDetails } = require('../game.js');
const base = () => Array.from({ length: 64 }, (_, i) => (i % 8 + Math.floor(i / 8)) % 6);
assert.equal(adjacent(7, 8), false, 'Rows must not wrap');
assert.equal(adjacent(7, 15), true);
assert.equal(adjacent(0, 9), false);
const cross = base();
for (const i of [18, 19, 20, 11, 27]) cross[i] = 5;
assert.deepEqual([...matches(cross)].sort((a, b) => a - b), [11, 18, 19, 20, 27], 'Cross intersection counts once');
const details = matchDetails(cross);
assert.equal(details.shaped, true);
assert.deepEqual(details.intersections, [19]);
const corner = base();
for (const i of [8, 16, 24, 25, 26]) corner[i] = 4;
const cornerDetails = matchDetails(corner);
assert.equal(cornerDetails.shaped, true, 'L-shaped matches are recognized');
assert.ok(cornerDetails.intersections.includes(24));
const falling = base();
const before = falling.slice();
collapse(falling, new Set([16, 32, 56]), () => 5);
assert.deepEqual(Array.from({ length: 8 }, (_, r) => falling[r * 8]), [5, 5, 5, before[0], before[8], before[24], before[40], before[48]], 'Gravity preserves survivor order');
assert.equal(falling[1], before[1]);
const blocked = new Set([24]);
const segmented = base();
segmented[24] = null;
const aboveBlock = segmented[16];
collapse(segmented, new Set([40]), () => 5, blocked);
assert.equal(segmented[24], null, 'Solid blockers remain in place');
assert.equal(segmented[16], aboveBlock, 'Gems do not fall through blockers');
const blockedBoard = createBoard(3, blocked);
assert.equal(blockedBoard[24], null);
assert.equal(matches(blockedBoard).size, 0);
assert.equal(hasMove(blockedBoard, blocked), true);
for (const types of [3, 5, 6]) {
  const obstacles = new Set([18, 28, 42]);
  for (let attempt = 0; attempt < 20; attempt++) {
    const boardWithObstacles = createBoard(types, obstacles);
    assert.equal(matches(boardWithObstacles).size, 0);
    assert.equal(hasMove(boardWithObstacles, obstacles), true);
    obstacles.forEach(index => assert.equal(boardWithObstacles[index], null));
  }
}
const invalid = base();
const original = invalid.slice();
swap(invalid, 0, 1);
assert.equal(matches(invalid).size, 0);
swap(invalid, 0, 1);
assert.deepEqual(invalid, original);
let cascades = 0;
for (let n = 0; n < 100; n++) {
  const board = createBoard();
  assert.equal(matches(board).size, 0);
  assert.equal(hasMove(board), true);
  const original = board.slice();
  hasMove(board);
  assert.deepEqual(board, original, 'Move search does not mutate board');
  let moved = false;
  for (let a = 0; a < 64 && !moved; a++) for (const b of [a + 1, a + 8]) {
    if (b >= 64 || !adjacent(a, b)) continue;
    swap(board, a, b);
    if (matches(board).size) { moved = true; break; }
    swap(board, a, b);
  }
  let rounds = 0;
  while (matches(board).size) {
    collapse(board, matches(board));
    assert.ok(++rounds < 1000, 'Cascades settle');
  }
  cascades += rounds;
  assert.ok(board.every(gem => Number.isInteger(gem) && gem >= 0 && gem < 6));
}
console.log(`Passed: adjacency, cross matches, gravity, rollback, 100 playable boards and ${cascades} cascade rounds.`);
