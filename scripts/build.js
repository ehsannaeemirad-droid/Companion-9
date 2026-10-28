#!/usr/bin/env node
'use strict';
/* scripts/build.js — assembles lessons.js from:
 *   - lessons-legacy.js (11 lessons: 1A-3B, 3D — the initial const LESSONS={...}
 *     declaration PLUS const ORDER, const LESSON_CODES, PLUS all LESSONS["XX"].field=...
 *     mutation statements for non-3C lessons)
 *   - lessons/3c/** (3C parts files authored with `window.LESSONS["3C"]...` headers)
 *
 * Output: lessons.js — the single file index.html loads. Index.html and sw.js are unchanged.
 *
 * Usage:
 *   node scripts/build.js          # rebuild lessons.js
 *   node scripts/build.js --check  # exit 1 if lessons.js differs from a fresh build
 *
 * Source files are read VERBATIM (no JSON.stringify) so TODO(fa-review) tags,
 * template literals, and original formatting survive into lessons.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const LEGACY = path.join(ROOT, 'lessons-legacy.js');
const PARTS_DIR = path.join(ROOT, 'lessons');
const OUT = path.join(ROOT, 'lessons.js');

const HEADER = '// === lessons.js (built by scripts/build.js; DO NOT EDIT DIRECTLY) ===\n' +
               '// Source: lessons-legacy.js (11 lessons: 1A-3B, 3D) + lessons/3c/** (3C parts)\n' +
               '// To edit: modify the source files, then run `node scripts/build.js`.\n\n';

// Find the matching close delimiter for the opener at index `start` in `s`.
function findClose(s, start) {
  const open = s[start];
  const close = { '{': '}', '[': ']', '(': ')' }[open];
  if (!close) throw new Error('findClose: start must be { [ or (; got ' + open);
  let depth = 0, i = start;
  let inStr = null, inLineComment = false, inBlockComment = false, inRegex = false;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; i++; continue; }
    if (inBlockComment) { if (c === '*' && n === '/') { inBlockComment = false; i += 2; continue; } i++; continue; }
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) { inStr = null; i++; continue; }
      i++; continue;
    }
    if (inRegex) {
      if (c === '\\') { i += 2; continue; }
      if (c === '/') { inRegex = false; i++; continue; }
      if (c === '\n') { inRegex = false; i++; continue; }
      i++; continue;
    }
    if (c === '/' && n === '/') { inLineComment = true; i += 2; continue; }
    if (c === '/' && n === '*') { inBlockComment = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; if (depth === 0) return i; continue; }
    if (c === '/') {
      let k = i - 1;
      while (k > 0 && /\s/.test(s[k])) k--;
      const prev = s[k];
      if (prev === '(' || prev === ',' || prev === '=' || prev === ':' || prev === '[' || prev === ';') {
        inRegex = true; i++; continue;
      }
    }
    i++;
  }
  throw new Error('findClose: unmatched ' + open + ' at ' + start);
}

// --- Read lessons-legacy.js, transform `const LESSONS = {...}` →
//     `var LESSONS = window.LESSONS = window.LESSONS || {}; Object.assign(LESSONS, {...});`
//     so that `window.LESSONS` and bare `LESSONS` reference the same object.
//     Everything else in legacy (ORDER, LESSON_CODES, mutations) stays verbatim.
function readLegacyTransformed() {
  const src = fs.readFileSync(LEGACY, 'utf8');
  const m = src.match(/^const\s+LESSONS\s*=\s*\{/m);
  if (!m) throw new Error('Cannot find "const LESSONS = {" in lessons-legacy.js');
  const objStart = m.index + m[0].length - 1; // index of '{'
  const objEnd = findClose(src, objStart); // index after '}'
  const objLiteral = src.slice(objStart, objEnd); // {...}
  // After the literal, expect ';'
  let after = objEnd;
  while (src[after] === ' ' || src[after] === '\n' || src[after] === '\t') after++;
  if (src[after] !== ';') throw new Error('Expected ; after LESSONS literal in legacy, got ' + JSON.stringify(src[after]));
  const before = src.slice(0, m.index);
  const rest = src.slice(after + 1); // skip the ';'
  const transformed = before +
    'var LESSONS = window.LESSONS = window.LESSONS || {};\n' +
    'Object.assign(LESSONS, ' + objLiteral + ');\n' +
    rest;
  return transformed;
}

// --- Read parts files in deterministic order ---
// _init.js is NOT included (it's a reference, not loaded at runtime).
// Within lessons/3c/, meta.js first, then coursebook/* in alphabetical order.
function readParts() {
  const out = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir).sort();
    for (const name of entries) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (name.endsWith('.js') && name !== '_init.js') {
        out.push({ path: path.relative(ROOT, full), src: fs.readFileSync(full, 'utf8') });
      }
    }
  }
  walk(PARTS_DIR);
  return out;
}

// --- Build (and validate) ---
function build() {
  const legacy = readLegacyTransformed();
  const parts = readParts();
  let full = HEADER + legacy + '\n';
  full += '// === BEGIN 3C parts (from lessons/3c/**) ===\n';
  for (const p of parts) {
    full += '// --- ' + p.path + ' ---\n';
    full += p.src;
    if (!p.src.endsWith('\n')) full += '\n';
  }
  full += '// === END 3C parts ===\n';

  // --- Validation: eval the whole thing in a vm with a window global ---
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(full + ';this.LESSONS=LESSONS;this.ORDER=ORDER;this.LESSON_CODES=LESSON_CODES;', sb);
  if (!sb.LESSONS) throw new Error('Build validation: LESSONS undefined');
  if (!sb.ORDER) throw new Error('Build validation: ORDER undefined');
  if (!sb.LESSON_CODES) throw new Error('Build validation: LESSON_CODES undefined');
  if (sb.ORDER.length !== 12) throw new Error('Build validation: ORDER length=' + sb.ORDER.length + ' (expected 12)');
  for (const id of sb.ORDER) {
    if (!sb.LESSONS[id]) throw new Error('Build validation: missing lesson ' + id);
  }
  if (!sb.LESSONS['3C']) throw new Error('Build validation: 3C missing');
  // 3C fields are top-level (LESSONS["3C"].vocab, not .coursebook.vocab) — file-system
  // organization under lessons/3c/coursebook/ is for Phase B's section-aware buildSession.
  for (const f of ['vocab', 'texts', 'grammar']) {
    if (!sb.LESSONS['3C'][f]) throw new Error('Build validation: 3C.' + f + ' missing');
  }
  for (const f of ['unit', 'letter', 'ready', 'title', 'titleFa', 'tip', 'sessions']) {
    if (sb.LESSONS['3C'][f] === undefined) throw new Error('Build validation: 3C.' + f + ' missing (meta.js not loaded?)');
  }
  // 3C.vocab count
  const vc = sb.LESSONS['3C'].vocab.length;
  if (vc !== 20) throw new Error('Build validation: 3C.vocab has ' + vc + ' entries (expected 20)');
  // 3C.conversation (Phase B): must exist with 3 parts (A, B, C), each with questions and chunks.
  // Every chunk's en must appear as **en** in its question's sample (validator invariant).
  if (!sb.LESSONS['3C'].conversation) throw new Error('Build validation: 3C.conversation missing (Phase B parts not loaded?)');
  if (!sb.LESSONS['3C'].conversation.parts) throw new Error('Build validation: 3C.conversation.parts missing');
  const convParts = sb.LESSONS['3C'].conversation.parts;
  if (convParts.length !== 3) throw new Error('Build validation: 3C.conversation.parts length=' + convParts.length + ' (expected 3)');
  const expectedIds = ['A', 'B', 'C'];
  for (let i = 0; i < 3; i++) {
    if (convParts[i].id !== expectedIds[i]) throw new Error('Build validation: 3C.conversation.parts[' + i + '].id="' + convParts[i].id + '" (expected "' + expectedIds[i] + '")');
    if (!convParts[i].title) throw new Error('Build validation: 3C.conversation.parts[' + i + '].title missing');
    if (!convParts[i].questions || !convParts[i].questions.length) throw new Error('Build validation: 3C.conversation.parts[' + i + '].questions missing');
    for (const q of convParts[i].questions) {
      if (!q.id || !q.question || !q.sample || !q.chunks) {
        throw new Error('Build validation: 3C.conversation Q ' + q.id + ' missing required fields');
      }
      for (const ch of q.chunks) {
        if (!ch.en || !ch.def || !ch.example || !ch.fa) {
          throw new Error('Build validation: 3C.conversation Q ' + q.id + ' chunk missing required fields: ' + JSON.stringify(ch).slice(0, 80));
        }
        if (!/TODO\(fa-review\)/.test(ch.fa)) {
          throw new Error('Build validation: 3C.conversation Q ' + q.id + ' chunk.en="' + ch.en + '" fa missing TODO(fa-review) tag');
        }
        if (!q.sample.includes('**' + ch.en + '**')) {
          throw new Error('Build validation: 3C.conversation Q ' + q.id + ' chunk.en="' + ch.en + '" not found as **en** in sample');
        }
      }
    }
  }

  return full;
}

function main() {
  const check = process.argv.includes('--check');
  const full = build();
  if (check) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current === full) {
      console.log('--check: lessons.js is up to date (' + full.length + ' chars)');
      process.exit(0);
    } else {
      console.error('--check: lessons.js is OUT OF DATE.');
      console.error('  current: ' + current.length + ' chars');
      console.error('  expected: ' + full.length + ' chars');
      process.exit(1);
    }
  } else {
    fs.writeFileSync(OUT, full, 'utf8');
    console.log('build: wrote lessons.js (' + full.length + ' chars, ' + full.split('\n').length + ' lines)');
  }
}

main();
