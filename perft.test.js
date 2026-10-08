'use strict';
// perft.test.js — loads the engine section (<script id="engine-src">) of chess.html
// into a Node VM context and verifies move generation, rules and engine behaviour.
// Usage: node perft.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'chess.html'), 'utf8');
const match = html.match(/<script id="engine-src">([\s\S]*?)<\/script>/);
if (!match) { console.error('engine-src block not found in chess.html'); process.exit(1); }
const E = vm.createContext({ console });
vm.runInContext(match[1], E, { filename: 'chess.html#engine-src' });

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
  if (!ok) failures++;
}

function divide(fen, depth) {
  const p = new E.Pos(fen);
  return p.legal().map(m => { p.make(m); const n = E.perft(p, depth - 1); p.unmake(); return E.moveToUci(m) + ': ' + n; }).join('\n');
}

/* ---------- Perft ---------- */
console.log('== Perft ==');
const PERFT = [
  ['startpos', E.START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  // extra reference positions (en passant / promotion / castling edge cases)
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [name, fen, expected] of PERFT) {
  const p = new E.Pos(fen);
  const before = p.fen(), hBefore = p.hlo;
  expected.forEach((n, i) => {
    const d = i + 1, t0 = Date.now();
    const got = E.perft(p, d);
    check(`perft ${name} depth ${d}`, got === n, `expected ${n}, got ${got} (${Date.now() - t0} ms)`);
    if (got !== n) console.log(divide(fen, d));
  });
  check(`perft ${name} position restored`, p.fen() === before && p.hlo === hBefore);
}

/* ---------- Rules ---------- */
console.log('\n== Rules ==');
function sanOf(fen, uci) { const p = new E.Pos(fen); const m = E.uciToMove(p, uci); return m ? p.san(m) : null; }
function play(p, sans) { for (const s of sans) { const m = p.parseSan(s); if (!m) return false; p.make(m); } return true; }

['rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', E.START_FEN,
 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1']
  .forEach(f => check('FEN round-trip ' + f, new E.Pos(f).fen() === f));

check('SAN Nf3', sanOf(E.START_FEN, 'g1f3') === 'Nf3');
check('SAN file disambiguation Nbd2', sanOf('4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1', 'b1d2') === 'Nbd2');
check('SAN rank disambiguation R1a3', sanOf('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a1a3') === 'R1a3');
check('SAN full disambiguation Qa4b3', sanOf('7k/8/8/8/Q1Q5/8/Q7/4K3 w - - 0 1', 'a4b3') === 'Qa4b3');
check('SAN promotion a8=Q', sanOf('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7a8q') === 'a8=Q');
check('SAN capture-promotion with check axb8=Q+', sanOf('1n5k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7b8q') === 'axb8=Q+');
check('SAN castling O-O', sanOf('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1') === 'O-O');
check('SAN castling O-O-O', sanOf('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8c8') === 'O-O-O');
check('SAN mate Rd8#', sanOf('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8') === 'Rd8#');

{
  const p = new E.Pos('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
  const u = p.legal().map(E.moveToUci);
  check('no castling through attacked square', !u.includes('e1g1') && u.includes('e1c1'));
  const p2 = new E.Pos('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
  check('no castling out of check', !p2.legal().map(E.moveToUci).some(x => x === 'e1g1' || x === 'e1c1'));
  const p3 = new E.Pos('r3k2r/8/8/8/8/8/6B1/R3K2R w KQkq - 0 1');
  p3.make(E.uciToMove(p3, 'g2a8'));
  check('castling right lost when rook captured', p3.fen().split(' ')[2] === 'KQk');
  const p4 = new E.Pos('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  p4.make(E.uciToMove(p4, 'h1h2')); p4.make(E.uciToMove(p4, 'e8d8'));
  check('castling rights lost after rook/king move', p4.fen().split(' ')[2] === 'Q');
}
{
  const p = new E.Pos('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const m = E.uciToMove(p, 'e5d6');
  check('en passant generated', !!m);
  p.make(m);
  check('en passant removes pawn', p.fen().startsWith('4k3/8/3P4/8/8/8/8/4K3'));
}
check('stalemate', new E.Pos('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status().reason === 'stalemate');
check('checkmate', new E.Pos('3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1').status().reason === 'checkmate');
check('fifty-move rule', new E.Pos('4k3/8/8/8/8/8/8/R3K3 w - - 100 80').status().reason === 'fifty');
check('insufficient K+B v K', new E.Pos('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1').status().reason === 'insufficient');
check('insufficient same-colour bishops', new E.Pos('4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1').status().reason === 'insufficient');
check('sufficient: opposite-colour bishops', !new E.Pos('2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1').status().over);
check('sufficient: two knights', !new E.Pos('4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1').status().over);
{
  const p = new E.Pos();
  play(p, ['Nf3', 'Nf6', 'Ng1', 'Ng8']);
  const twice = p.status().over;
  play(p, ['Nf3', 'Nf6', 'Ng1', 'Ng8']);
  check('threefold repetition', !twice && p.status().reason === 'repetition');
}

/* ---------- Evaluation knowledge ---------- */
if (typeof E.see === 'function') {
  console.log('\n== Evaluation: SEE, king safety, endgames ==');
  const seeOf = (fen, uci) => { const p = new E.Pos(fen); const m = E.uciToMove(p, uci); const before = p.fen(); const v = E.see(p, m); return p.fen() === before ? v : 'BOARD CHANGED'; };
  let v;
  v = seeOf('1k1r4/1pp4p/p7/4p3/8/P5P1/1PP4P/2K1R3 w - - 0 1', 'e1e5');
  check('SEE Rxe5 wins an undefended pawn (+100)', v === 100, String(v));
  v = seeOf('1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1', 'd3e5');
  check('SEE Nxe5 loses material in a long exchange (x-rays)', v < 0, String(v));
  v = seeOf('4k3/8/3p4/4p3/8/8/8/4QK2 w - - 0 1', 'e1e5');
  check('SEE Qxe5 into pawn defence = -875', v === -875, String(v));
  v = seeOf('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6');
  check('SEE en passant = +100', v === 100, String(v));
  v = seeOf('4k3/8/2n5/4p3/8/2B5/8/R3K3 w - - 0 1', 'c3e5');
  check('SEE Bxe5 Nxe5: bishop for pawn = -225', v === -225, String(v));

  const ev = fen => E.evaluate(new E.Pos(fen));      // side-to-move view
  // K+P v K (exact table): opposition
  check('KPK Ke5 Pe6 v Ke8, White to move = draw', ev('4k3/8/4P3/4K3/8/8/8/8 w - - 0 1') === 0);
  check('KPK same position, Black to move = draw (...Ke7)', ev('4k3/8/4P3/4K3/8/8/8/8 b - - 0 1') === 0);
  check('KPK opposition: Ke4 Pe3 v Ke6, White to move = draw', ev('8/8/4k3/8/4K3/4P3/8/8 w - - 0 1') === 0);
  check('KPK opposition: same, Black to move = win', ev('8/8/4k3/8/4K3/4P3/8/8 b - - 0 1') < -700);
  check('KPK king on 6th in front of pawn = win', ev('4k3/8/4K3/4P3/8/8/8/8 b - - 0 1') < -700);
  check('KPK mirrored files (f-pawn) draw', ev('5k2/8/5P2/5K2/8/8/8/8 w - - 0 1') === 0);
  check('KPK mirrored colours: Black pawn draw', ev('8/8/4p3/4k3/8/4K3/8/8 b - - 0 1') === 0);
  check('KPK mirrored colours: Black pawn win', ev('8/8/4p3/4k3/8/4K3/8/8 w - - 0 1') < -700);
  check('KPK rook pawn, defender in corner = draw', ev('7k/8/8/8/8/8/7P/7K w - - 0 1') === 0);
  check('KPK defender far away = win', ev('k7/8/8/8/8/8/6P1/6K1 w - - 0 1') > 700);
  // drawish material
  check('wrong-coloured bishop + h-pawn = draw', ev('7k/8/7P/8/8/8/8/K2B4 w - - 0 1') === 0);
  check('right-coloured bishop + h-pawn = winning', ev('7k/8/7P/8/8/8/8/K1B5 w - - 0 1') > 300);
  check('KNN v K = draw score', ev('8/8/4k3/8/8/8/8/1NN1K3 w - - 0 1') === 0);
  check('KR v KB scaled towards draw', Math.abs(ev('8/8/4k3/8/3b4/8/8/R3K3 w - - 0 1')) < 60);
  check('opposite-coloured bishops, pawn up: scaled down',
    ev('4k3/5p2/8/8/3B4/8/2b2PP1/4K3 w - - 0 1') < ev('4k3/5p2/8/8/3B4/8/1b3PP1/4K3 w - - 0 1') - 20);
  // mop-up: lone king on the edge is better for the stronger side
  check('KR v K: defending king on edge scores higher', ev('7k/8/8/8/8/8/8/R3K3 w - - 0 1') > ev('8/8/8/3k4/8/8/8/R3K3 w - - 0 1') + 20);
  check('KBN v K: right corner preferred', ev('7k/8/8/8/8/8/8/1NB1K3 w - - 0 1') > ev('k7/8/8/8/8/8/8/1NB1K3 w - - 0 1'));
  // unstoppable passer in a pawn ending
  check('rule of the square: unstoppable pawn', ev('8/k7/8/8/8/7P/8/K7 w - - 0 1') > 500);
  // king safety: open king with enemy queen + rook bearing down
  check('king safety: attacked open king scores worse',
    ev('r4rk1/5ppp/8/8/8/8/5PPP/3RQ1K1 b - - 0 1') - ev('r4rk1/5ppp/8/6Q1/8/7R/5PPP/6K1 b - - 0 1') > 40);
  check('king safety: broken pawn shield scores worse',
    ev('r1bq1rk1/ppp2ppp/2n2n2/3pp3/8/2NPPN2/PPP2PPP/R1BQ1RK1 w - - 0 1') > ev('r1bq1rk1/ppp2ppp/2n2n2/3pp3/6P1/2NPPN2/PPP2P1P/R1BQ1RK1 w - - 0 1'));
}

/* ---------- Engine ---------- */
if (typeof E.Searcher === 'function') {
  console.log('\n== Engine ==');
  const s = new E.Searcher();
  {
    const p = new E.Pos('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
    const r = s.search(p, { time: 1500 });
    check('finds mate in 1 (Rd8#)', E.moveToUci(r.move) === 'd1d8', `played ${E.moveToUci(r.move)}, depth ${r.depth}`);
  }
  function queenSafe(fen, level) {
    const p = new E.Pos(fen);
    const r = level ? E.engineThink(s, p, level, false) : s.search(p, { time: 1000 });
    const u = E.moveToUci(r.move);
    p.make(r.move);
    let qsq = -1;
    for (let sq = 0; sq < 120; sq++) if (!(sq & 0x88) && p.b[sq] === E.QUEEN) qsq = sq;
    return { ok: qsq >= 0 && !p.attacked(qsq, 8), u };
  }
  {
    const r = queenSafe('rnbqkbnr/pppp1ppp/8/4p3/3Q4/8/PPP1PPPP/RNB1KBNR w KQkq - 0 3');
    check('does not hang attacked queen (Club search)', r.ok, `played ${r.u}`);
    const r2 = queenSafe('r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 4 4');
    check('keeps queen safe in quiet opening position', r2.ok, `played ${r2.u}`);
    const r3 = queenSafe('rnbqkbnr/pppp1ppp/8/4p3/3Q4/8/PPP1PPPP/RNB1KBNR w KQkq - 0 3', 'casual');
    check('Casual level saves attacked queen', r3.ok, `played ${r3.u}`);
  }
  {
    const p = new E.Pos('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const t0 = Date.now();
    const r = s.search(p, { time: 1500 });
    const dt = Date.now() - t0;
    check('time limit respected (1.5 s)', dt < 2200 && !!r.move, `${dt} ms, depth ${r.depth}, ${r.nodes} nodes`);
    check('search leaves position intact', p.fen() === 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  }
  {
    const p = new E.Pos('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    const legal = p.legal();
    let ok = true;
    for (let i = 0; i < 20; i++) { const r = E.engineThink(s, p, 'beginner', false); if (!legal.includes(r.move)) ok = false; }
    check('Beginner returns legal moves', ok);
  }
  {
    E.buildBook();
    let bad = [];
    E.BOOK_LINES.forEach(line => { const p = new E.Pos(); if (!play(p, line.split(' '))) bad.push(line); });
    check(`opening book: ${E.BOOK_LINES.length} lines all legal`, bad.length === 0, bad.join(' | '));
    const firsts = new Set();
    for (let i = 0; i < 60; i++) firsts.add(E.moveToUci(E.engineThink(s, new E.Pos(), 'club').move));
    check('book varies first move', firsts.size >= 3, [...firsts].join(' '));
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL TESTS PASSED');
process.exit(failures ? 1 : 0);
