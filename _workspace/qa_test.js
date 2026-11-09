// QA test: web/index.html <-> 01.Arduino Code and Library/remote.ino
// Run: node _workspace/qa_test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(cond, name, detail) {
  if (cond) pass++;
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}
function section(t) { console.log('\n== ' + t); }

// ------------------------------------------------------------------
// 1. Extract script blocks + syntax check
// ------------------------------------------------------------------
section('1. script extraction / syntax');
const scripts = [];
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(HTML))) scripts.push({ attrs: m[1], code: m[2] });
check(scripts.length === 2, 'two inline script blocks', 'found ' + scripts.length);
scripts.forEach((s, i) => {
  try { new vm.Script(s.code, { filename: 'script' + i + '.js' }); check(true, 'syntax ok script#' + i); }
  catch (e) { check(false, 'syntax ok script#' + i, e.message); }
});
const protoScript = scripts.find(s => /id="bike-protocol"/.test(s.attrs));
const appScript = scripts.find(s => !/id="bike-protocol"/.test(s.attrs));
check(!!protoScript, 'bike-protocol block present');

// ------------------------------------------------------------------
// 2. Load protocol in vm
// ------------------------------------------------------------------
const pctx = vm.createContext({});
vm.runInContext(protoScript.code, pctx);
const B = pctx.__bike;
check(B && typeof B.encodeJoystick === 'function', 'protocol API exposed on globalThis.__bike');

// ------------------------------------------------------------------
// 3. Arduino emulator (remote.ino, AVR semantics)
// ------------------------------------------------------------------
const STEERING_MAX = 350, SPEED_MAX = 80;
function arduinoMap(x, inMin, inMax, outMin, outMax) { // long arithmetic, C truncation
  return Math.trunc((x - inMin) * (outMax - outMin) / (inMax - inMin)) + outMin;
}
const f32 = Math.fround;
function makeBike() {
  return {
    cmd: new Uint8Array(9), // index 8 = out-of-bounds slot (overflow detector)
    overflow: 0, steering_remote: 0, speed_remote: 0, buttonStatus: 0,
    joyFrames: 0, btnFrames: 0, ignored: 0, discarded: 0, lastJoy: null,
  };
}
function getJoystickState(b, d) {
  let joyX = (d[1] - 48) * 100 + (d[2] - 48) * 10 + (d[3] - 48);
  let joyY = (d[4] - 48) * 100 + (d[5] - 48) * 10 + (d[6] - 48);
  joyX -= 200; joyY -= 200;
  b.lastJoy = { joyX, joyY };
  if (joyX < -100 || joyX > 100 || joyY < -100 || joyY > 100) { b.ignored++; return; }
  let s;
  if (joyX < -10 || joyX > 10) {
    // AVR: double == float32
    if (joyX > 0) s = f32(f32(f32(-joyX * joyX) + f32(f32(0.1) * joyX)) / f32(100.0));
    else s = f32(f32(f32(joyX * joyX) + f32(f32(0.1) * joyX)) / f32(100.0));
    s = Math.trunc(s); // assignment to int
  } else s = 0;
  b.steering_remote = -arduinoMap(s, -100, 100, -STEERING_MAX, STEERING_MAX);
  if (joyY < -10 || joyY > 10) b.speed_remote = arduinoMap(joyY, 100, -100, SPEED_MAX, -SPEED_MAX);
  else b.speed_remote = 0;
  b.joyFrames++;
}
function getButtonState(b, c) {
  switch (String.fromCharCode(c)) {
    case 'A': b.buttonStatus |= 1; break;
    case 'B': b.buttonStatus &= 0b111110; break;
    case 'C': b.buttonStatus |= 2; break;
    case 'D': b.buttonStatus &= 0b111101; break;
  }
  b.btnFrames++;
}
// One call of readControlParameters(); rx = array of arrived-but-unread bytes (mutated)
function readControlParameters(b, rx) {
  if (!rx.length) return;
  b.cmd[0] = rx.shift();
  if (b.cmd[0] === 0x02) {
    let i = 1;
    while (rx.length) {
      const v = rx.shift();
      if (i > 8) { b.overflow++; } else b.cmd[i] = v;
      if (i === 8) b.overflow++;
      if (b.cmd[i] > 127 || i > 7) break;
      if (b.cmd[i] === 0x03 && (i === 2 || i === 7)) break;
      i++;
    }
    if (i === 2) getButtonState(b, b.cmd[1]);
    else if (i === 7) getJoystickState(b, b.cmd);
  } else b.discarded++;
}
function feedFrame(b, frameStr) { // whole frame arrives at once, then loop drains
  const rx = Array.from(B.toBytes(frameStr));
  let guard = 0;
  while (rx.length && guard++ < 50) readControlParameters(b, rx);
}
function firmwareExpect(x, y) { // independent oracle (float64 path) for cross-check
  let s = 0;
  if (Math.abs(x) > 10) s = Math.trunc(x > 0 ? (-x * x + 0.1 * x) / 100 : (x * x + 0.1 * x) / 100);
  const st = -arduinoMap(s, -100, 100, -350, 350);
  const sp = Math.abs(y) > 10 ? arduinoMap(y, 100, -100, 80, -80) : 0;
  return { st: st === 0 ? 0 : st, sp: sp === 0 ? 0 : sp };
}

// ------------------------------------------------------------------
// 4. Boundary matrix
// ------------------------------------------------------------------
section('4. boundary matrix X,Y in {-100,-11,-10,0,10,11,100}');
const BV = [-100, -11, -10, 0, 10, 11, 100];
const table = [];
for (const x of BV) for (const y of BV) {
  const f = B.encodeJoystick(x, y);
  const bytes = B.toBytes(f);
  check(f.length === 8 && bytes.length === 8, `len8 (${x},${y})`);
  check(bytes[0] === 0x02 && bytes[7] === 0x03, `STX/ETX (${x},${y})`);
  check(Array.from(bytes).every(v => v <= 127), `bytes<=127 (${x},${y})`);
  check(/^\d{6}$/.test(f.slice(1, 7)), `6 ASCII digits (${x},${y})`, JSON.stringify(f));
  check(f.slice(1, 4) === String(x + 200).padStart(3, '0') && f.slice(4, 7) === String(y + 200).padStart(3, '0'),
    `+200 offset / zero-pad (${x},${y})`, f.slice(1, 7));
  const bike = makeBike();
  feedFrame(bike, f);
  check(bike.joyFrames === 1 && bike.ignored === 0 && bike.overflow === 0, `parser accepts (${x},${y})`);
  check(bike.lastJoy.joyX === x && bike.lastJoy.joyY === y, `parser decodes (${x},${y})`, JSON.stringify(bike.lastJoy));
  const ex = firmwareExpect(x, y);
  check(bike.steering_remote === ex.st && bike.speed_remote === ex.sp, `firmware f32 == f64 oracle (${x},${y})`,
    `${bike.steering_remote},${bike.speed_remote} vs ${ex.st},${ex.sp}`);
  const est = B.firmwareEstimate(x, y);
  check(est.steeringRemote === bike.steering_remote && est.speedRemote === bike.speed_remote,
    `app firmwareEstimate matches emulator (${x},${y})`, `${est.steeringRemote},${est.speedRemote} vs ${bike.steering_remote},${bike.speed_remote}`);
  if (y === 0 || x === 0) table.push({ x, y, frame: B.frameToText(f), hex: B.frameToHex(f), steer: bike.steering_remote, speed: bike.speed_remote });
}
console.log('  sample:'); table.filter(r => r.y === 0).forEach(r => console.log('   ', JSON.stringify(r)));
table.filter(r => r.x === 0).forEach(r => console.log('   ', JSON.stringify(r)));
// full sweep -100..100 per axis
let sweepOk = true;
for (let v = -100; v <= 100; v++) {
  const bike = makeBike(); feedFrame(bike, B.encodeJoystick(v, -v));
  const ex = firmwareExpect(v, -v); const est = B.firmwareEstimate(v, -v);
  if (bike.lastJoy.joyX !== v || bike.lastJoy.joyY !== -v || bike.steering_remote !== ex.st || bike.speed_remote !== ex.sp ||
      est.steeringRemote !== ex.st || est.speedRemote !== ex.sp) { sweepOk = false; console.log('   sweep mismatch', v); }
}
check(sweepOk, 'full sweep -100..100 decode + estimate');
// deadzone edges
{ const b = makeBike(); feedFrame(b, B.encodeJoystick(10, 10)); check(b.steering_remote === 0 && b.speed_remote === 0, 'deadzone |10| -> 0'); }
{ const b = makeBike(); feedFrame(b, B.encodeJoystick(11, 11)); check(b.steering_remote !== 0 && b.speed_remote !== 0, 'edge 11 -> nonzero', b.steering_remote + ',' + b.speed_remote); }
{ const b = makeBike(); feedFrame(b, B.encodeJoystick(-11, -11)); check(b.steering_remote !== 0 && b.speed_remote !== 0, 'edge -11 -> nonzero', b.steering_remote + ',' + b.speed_remote); }

// ------------------------------------------------------------------
// 5. Clamp / sanitize
// ------------------------------------------------------------------
section('5. clamp / sanitize');
const clampCases = [
  [-101, -100], [101, 100], [-1000, -100], [1e9, 100], [NaN, 0], [Infinity, 0], [-Infinity, 0],
  ['50', 50], [null, 0], [undefined, 0], ['abc', 0], [10.4, 10], [10.5, 11], [-10.5, -10], [-10.6, -11], [-0, 0], [0.4, 0], [-0.4, 0],
];
for (const [inp, exp] of clampCases) {
  const got = B.clampAxis(inp);
  check(Object.is(got, exp), `clampAxis(${String(inp)}) = ${exp}`, 'got ' + got);
  const f = B.encodeJoystick(inp, inp);
  const b = makeBike(); feedFrame(b, f);
  check(f.length === 8 && b.ignored === 0 && b.joyFrames === 1, `out-of-range ${String(inp)} still produces accepted frame`, B.frameToText(f));
}
check(!B.encodeJoystick(-0, 0).includes('-'), 'no "-" sign for -0');
check(B.NEUTRAL_FRAME === '\x02200200\x03', 'NEUTRAL_FRAME == STX 200200 ETX');
// computeOutput
const co = (rx, ry, o) => { const r = B.computeOutput(rx, ry, o); return r.x + ',' + r.y; };
check(co(100, 100, { limit: 50 }) === '50,50', 'computeOutput limit 50');
check(co(100, -100, { limit: 100 }) === '100,-100', 'computeOutput limit 100');
check(co(500, -500, { limit: 100 }) === '100,-100', 'computeOutput clamps raw');
check(co(100, 100, { limit: 100, invertX: true, invertY: true }) === '-100,-100', 'computeOutput invert');
check(co(NaN, undefined, { limit: 'x' }) === '0,0', 'computeOutput NaN -> 0');
check(co(100, 100, { limit: 10 }) === '10,10', 'computeOutput limit 10 (all within deadzone!)');
check(co(-21, 21, { limit: 50 }) === '-10,11', 'computeOutput Math.round asymmetry at +/-10.5 (informational)', co(-21, 21, { limit: 50 }));

// ------------------------------------------------------------------
// 6. Buttons
// ------------------------------------------------------------------
section('6. buttons');
for (const c of ['A', 'B', 'C', 'D', 'a', 'd']) {
  const f = B.encodeButton(c); const bytes = B.toBytes(f);
  check(bytes.length === 3 && bytes[0] === 2 && bytes[2] === 3 && bytes[1] === c.toUpperCase().charCodeAt(0), 'button frame ' + c);
}
{ const b = makeBike(); feedFrame(b, B.encodeButton('A')); feedFrame(b, B.encodeButton('C'));
  check(b.buttonStatus === 3 && b.btnFrames === 2 && b.overflow === 0, 'parser A,C -> status 0b11');
  feedFrame(b, B.encodeButton('B')); check(b.buttonStatus === 2, 'parser B clears bit0');
  feedFrame(b, B.encodeButton('D')); check(b.buttonStatus === 0, 'parser D clears bit1'); }
for (const bad of ['E', '', 'AB', null, 1, '\x03']) {
  let threw = false; try { B.encodeButton(bad); } catch (e) { threw = e && e.name === 'RangeError'; }
  check(threw, 'encodeButton rejects ' + JSON.stringify(bad));
}
{ let threw = false; try { B.toBytes('\x02é\x03'); } catch (e) { threw = true; } check(threw, 'toBytes rejects >127'); }

// ------------------------------------------------------------------
// 7. Stream robustness: concatenated frames, split arrival
// ------------------------------------------------------------------
section('7. stream: back-to-back frames / split arrival');
{ // 5 frames concatenated in UART buffer, loop drains one per call
  const b = makeBike(); const rx = [];
  const seq = [[50, 50], [0, 0], [-100, 100], B.encodeButton('A'), [0, 0]];
  for (const s of seq) rx.push(...B.toBytes(Array.isArray(s) ? B.encodeJoystick(s[0], s[1]) : s));
  let calls = 0; while (rx.length && calls < 100) { readControlParameters(b, rx); calls++; }
  check(b.joyFrames === 4 && b.btnFrames === 1 && b.overflow === 0 && b.discarded === 0, 'back-to-back 5 frames parsed in 5 calls', JSON.stringify({ calls, j: b.joyFrames, bt: b.btnFrames }));
  check(b.steering_remote === 0 && b.speed_remote === 0, 'last neutral wins');
}
{ // split arrival at every position, previous state = (100,100)
  let worst = null;
  for (const target of [[0, 0], [50, -50], [-100, 100]]) {
    const f = Array.from(B.toBytes(B.encodeJoystick(target[0], target[1])));
    for (let k = 1; k < 8; k++) {
      const b = makeBike(); feedFrame(b, B.encodeJoystick(100, 100));
      const prev = [b.steering_remote, b.speed_remote];
      const rx = f.slice(0, k);
      readControlParameters(b, rx); // loop sees partial frame
      rx.push(...f.slice(k)); // rest arrives
      let calls = 1; while (rx.length) { readControlParameters(b, rx); calls++; }
      const ex = firmwareExpect(target[0], target[1]);
      const applied = b.steering_remote === ex.st && b.speed_remote === ex.sp;
      const kept = b.steering_remote === prev[0] && b.speed_remote === prev[1];
      check(b.overflow === 0, `split@${k} no overflow`);
      check(applied || kept, `split@${k} target ${target} -> either applied or previous kept (no garbage)`);
      if (!applied) worst = worst || { k, target, calls, note: 'frame lost; previous command kept' };
      if (k === 7) check(applied, 'split@7 (ETX late) still applied (i==7 dispatch w/o ETX)');
    }
  }
  console.log('  split arrival: frame lost for k=1..6 (expected firmware behaviour); first example:', JSON.stringify(worst));
}
{ // documented firmware defect: 8+ bytes without ETX at index 7 -> cmd[8] write
  const b = makeBike(); const rx = [2, 0x32, 0x30, 0x30, 0x32, 0x30, 0x30, 0x30, 0x30, 3];
  readControlParameters(b, rx);
  check(b.overflow > 0, 'emulator reproduces cmd[8] overflow for malformed frame (firmware defect, app never sends this)');
}

// ------------------------------------------------------------------
// 8. App smoke test in a stub DOM with fake Web Serial
// ------------------------------------------------------------------
section('8. app runtime (stub DOM + fake Web Serial)');

function makeEl(id, tag) {
  const listeners = {};
  const el = {
    id, tagName: (tag || 'div').toUpperCase(), textContent: '', className: '', disabled: false, checked: false, value: '',
    style: {}, childNodes: [], scrollTop: 0, scrollHeight: 0, clientWidth: 300,
    _cls: new Set(),
    classList: {
      add: c => el._cls.add(c), remove: c => el._cls.delete(c), contains: c => el._cls.has(c),
      toggle: (c, on) => { const v = on === undefined ? !el._cls.has(c) : !!on; v ? el._cls.add(c) : el._cls.delete(c); return v; },
    },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter(f => f !== fn); },
    dispatch: (t, ev) => { (listeners[t] || []).slice().forEach(fn => fn.call(el, ev || mkEv())); },
    _listeners: listeners,
    appendChild: c => { el.childNodes.push(c); return c; },
    removeChild: c => { el.childNodes.splice(el.childNodes.indexOf(c), 1); return c; },
    get firstChild() { return el.childNodes[0]; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } }),
    setPointerCapture: () => {}, releasePointerCapture: () => {},
    width: 0, height: 0,
  };
  return el;
}
function mkEv(o) { return Object.assign({ preventDefault() {}, repeat: false, ctrlKey: false, metaKey: false, altKey: false }, o || {}); }

const els = {};
const ids = ['connDot', 'connText', 'calibPill', 'calibDot', 'calibText', 'btnBle', 'btnSerial', 'btnDisconnect', 'supportNote', 'linkAlert',
  'joy', 'valX', 'valY', 'dzX', 'dzY', 'estimate', 'estop', 'limitVal', 'limit', 'invX', 'invY', 'btn1', 'btn2',
  'rxLog', 'rxClear', 'rxAuto', 'txNow', 'txLog', 'txClear', 'txAll', 'txStat'];
const buttonIds = ['btnBle', 'btnSerial', 'btnDisconnect', 'estop', 'btn1', 'btn2', 'rxClear', 'txClear'];
ids.forEach(id => { els[id] = makeEl(id, buttonIds.includes(id) ? 'button' : 'div'); });
els.rxAuto.checked = true; els.limit.value = '50';

const docListeners = {}, winListeners = {};
const document = {
  visibilityState: 'visible',
  getElementById: id => els[id] || null,
  createElement: t => makeEl(null, t),
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  querySelectorAll: sel => (sel === 'button' ? buttonIds.map(i => els[i]) : []),
};

// fake serial
const writes = []; // {t, bytes:string}
let writeFailMode = 0; // number of upcoming writes to reject
let portClosed = false, readerCancelled = 0;
let rxPush = null;
const portListeners = {};
function makePort() {
  portClosed = false;
  let pendingResolve = null; const queue = [];
  const readable = {
    getReader() {
      return {
        read() { if (queue.length) return Promise.resolve(queue.shift()); return new Promise(r => { pendingResolve = r; }); },
        cancel() { readerCancelled++; if (pendingResolve) { const r = pendingResolve; pendingResolve = null; r({ done: true }); } else queue.push({ done: true }); return Promise.resolve(); },
        releaseLock() {},
      };
    },
  };
  rxPush = (txt) => { const v = { done: false, value: new TextEncoder().encode(txt) }; if (pendingResolve) { const r = pendingResolve; pendingResolve = null; r(v); } else queue.push(v); };
  const port = {
    readable, writable: {
      getWriter() {
        return {
          write(bytes) {
            if (writeFailMode > 0) { writeFailMode--; return Promise.reject(new Error('fake write failure')); }
            writes.push({ t: performance.now(), s: Buffer.from(bytes).toString('latin1'), n: bytes.length });
            return Promise.resolve();
          },
          releaseLock() {},
        };
      },
    },
    open: async (o) => { port.openOpts = o; },
    close: async () => { portClosed = true; port.readable = null; },
    getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 }),
    addEventListener: (t, fn) => { (portListeners[t] = portListeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { portListeners[t] = (portListeners[t] || []).filter(f => f !== fn); },
  };
  return port;
}
let lastPort = null;
const navigatorStub = {
  serial: { requestPort: async () => (lastPort = makePort()) },
  bluetooth: undefined,
  vibrate: () => true,
};

let rafCount = 0;
const errors = [];
const sandbox = {
  document, navigator: navigatorStub, isSecureContext: true, devicePixelRatio: 1,
  performance, setTimeout, clearTimeout, setInterval, clearInterval, Promise, TextDecoder, TextEncoder, Uint8Array, console,
  requestAnimationFrame: fn => { if (rafCount++ < 2) setTimeout(() => { try { fn(); } catch (e) { errors.push('draw: ' + e.message); } }, 0); return rafCount; },
  addEventListener: (t, fn, cap) => { (winListeners[t] = winListeners[t] || []).push(fn); },
};
sandbox.window = sandbox;
const actx = vm.createContext(sandbox);
let appLoadErr = null;
try { vm.runInContext(protoScript.code, actx); vm.runInContext(appScript.code, actx); } catch (e) { appLoadErr = e; }
check(!appLoadErr, 'app script executes in stub DOM', appLoadErr && appLoadErr.stack);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fireWin = (t, ev) => (winListeners[t] || []).forEach(fn => fn(ev || mkEv()));
const fireDoc = (t, ev) => (docListeners[t] || []).forEach(fn => fn(ev || mkEv()));
const canvas = els.joy;
const ptr = (type, x, y) => canvas.dispatch(type, mkEv({ pointerId: 1, clientX: x, clientY: y }));
const NEU = '\x02200200\x03';
const mark = () => writes.length;
const since = i => writes.slice(i);
const txt = s => s.replace(/\x02/g, '<').replace(/\x03/g, '>');

process.on('unhandledRejection', e => errors.push('unhandledRejection: ' + (e && e.message)));

async function waitForNeutral(fromIdx, ms) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const w = writes.slice(fromIdx).find(w => w.s === NEU);
    if (w) return w.t - t0;
    await sleep(2);
  }
  return null;
}

async function runApp() {
  if (appLoadErr) return;
  check(els.btnBle.disabled === true, 'BLE button disabled when navigator.bluetooth missing');
  check(els.btnSerial.disabled === false, 'Serial button enabled when navigator.serial present');
  check(/Web Bluetooth/.test(els.supportNote.textContent), 'unsupported BLE message shown', els.supportNote.textContent);

  // connect
  let i0 = mark();
  els.btnSerial.dispatch('click');
  await sleep(200);
  check(lastPort && lastPort.openOpts && lastPort.openOpts.baudRate === 9600, 'serial opened at 9600');
  check(writes.length > i0 && writes[i0].s === NEU, 'first frame after connect is neutral', writes[i0] && txt(writes[i0].s));
  check(writes.some(w => w.s === '\x02S\x03'), 'calibration status requested after connect');
  check(/연결됨/.test(els.connText.textContent), 'UI connected');

  // rx text -> calib pill
  rxPush('first you need to calibrate the balancing point...\r\n');
  await sleep(20);
  check(/필요/.test(els.calibText.textContent), 'rx "first you need to calibrate" -> calib pill');

  // joystick right full
  i0 = mark();
  ptr('pointerdown', 300, 150);
  await sleep(400);
  const joyFrames = since(i0).map(w => w.s);
  check(joyFrames.includes('\x02250200\x03'), 'joystick right @limit50 -> "250200"', joyFrames.map(txt).join(' '));
  // pointerup -> neutral latency
  i0 = mark();
  const tUp = performance.now();
  ptr('pointerup', 300, 150);
  const lat = await waitForNeutral(i0, 300);
  check(lat !== null && lat < 60, 'pointerup -> neutral within 60ms', 'latency ' + lat);
  await sleep(200);
  check(since(i0).every(w => w.s === NEU), 'frames after pointerup are all neutral', since(i0).map(w => txt(w.s)).join(' '));

  // keyboard ramp + release
  i0 = mark();
  fireWin('keydown', mkEv({ code: 'KeyW' }));
  await sleep(600);
  const kf = since(i0).map(w => w.s.slice(4, 7));
  check(kf.includes('250'), 'KeyW ramps Y to +50 (limit 50)', kf.join(','));
  i0 = mark();
  fireWin('keyup', mkEv({ code: 'KeyW' }));
  const latK = await waitForNeutral(i0, 300);
  check(latK !== null && latK < 60, 'keyup -> neutral within 60ms', 'latency ' + latK);
  await sleep(150);
  check(since(i0).every(w => w.s === NEU), 'frames after keyup all neutral');

  // blur
  ptr('pointerdown', 150, 0); await sleep(200);
  i0 = mark(); fireWin('blur');
  check((await waitForNeutral(i0, 300)) !== null, 'window blur -> neutral');
  await sleep(200); ptr('pointermove', 150, 0); await sleep(150);
  check(since(i0).every(w => w.s === NEU), 'after blur joystick released (pointermove ignored)');
  ptr('pointerup', 150, 0);

  // visibilitychange
  ptr('pointerdown', 150, 0); await sleep(200);
  i0 = mark(); document.visibilityState = 'hidden'; fireDoc('visibilitychange');
  check((await waitForNeutral(i0, 300)) !== null, 'visibilitychange hidden -> neutral');
  await sleep(150);
  check(since(i0).every(w => w.s === NEU), 'after hidden all neutral');
  document.visibilityState = 'visible'; ptr('pointerup', 150, 0);

  // e-stop via Space
  ptr('pointerdown', 0, 150); await sleep(200);
  i0 = mark(); fireWin('keydown', mkEv({ code: 'Space' }));
  check((await waitForNeutral(i0, 300)) !== null, 'Space e-stop -> neutral');
  ptr('pointerdown', 0, 150); ptr('pointermove', 0, 150); fireWin('keydown', mkEv({ code: 'KeyD' }));
  await sleep(300);
  check(since(i0).every(w => w.s === NEU), 'during e-stop all frames neutral even with input');
  fireWin('keyup', mkEv({ code: 'KeyD' })); ptr('pointerup', 0, 150);
  els.estop.dispatch('click'); // release
  check(!els.estop.classList.contains('active'), 'e-stop released by click');

  // limit 100 + left full
  els.limit.value = '100'; els.limit.dispatch('input');
  i0 = mark(); ptr('pointerdown', -100, 150); await sleep(250); ptr('pointerup', -100, 150);
  check(since(i0).some(w => w.s === '\x02100200\x03'), 'limit 100, full left -> "100200"');

  // invert toggle sends neutral
  i0 = mark(); els.invX.checked = true; els.invX.dispatch('change');
  check((await waitForNeutral(i0, 200)) !== null, 'invert toggle -> neutral');
  els.invX.checked = false; els.invX.dispatch('change');

  // button
  i0 = mark(); els.btn1.dispatch('click'); await sleep(150);
  check(since(i0).some(w => w.s === '\x02A\x03'), 'button1 -> STX A ETX');
  i0 = mark(); els.btn1.dispatch('click'); await sleep(150);
  check(since(i0).some(w => w.s === '\x02B\x03'), 'button1 again -> STX B ETX');

  // rate / gap stats over the whole session so far
  const ws = writes.slice();
  let minGap = Infinity;
  for (let k = 1; k < ws.length; k++) minGap = Math.min(minGap, ws[k].t - ws[k - 1].t);
  const span = (ws[ws.length - 1].t - ws[0].t) / 1000;
  const rate = (ws.length - 1) / span;
  console.log(`  writes=${ws.length} span=${span.toFixed(2)}s rate=${rate.toFixed(1)}/s minGap=${minGap.toFixed(1)}ms`);
  check(minGap >= 30, 'min inter-frame gap >= 30ms', minGap.toFixed(1));
  check(rate <= 20 && rate >= 8, 'tx rate 8..20 frames/s', rate.toFixed(1));
  check(ws.every(w => (w.n === 8 || w.n === 3) && w.s.charCodeAt(0) === 2 && w.s.charCodeAt(w.n - 1) === 3), 'every write is exactly one complete 8/3-byte frame');
  check(ws.every(w => [...w.s].every(c => c.charCodeAt(0) <= 127)), 'every written byte <= 127');
  // feed full session into emulator, one frame per arrival
  const bike = makeBike();
  ws.forEach(w => feedFrame(bike, w.s));
  check(bike.ignored === 0 && bike.overflow === 0 && bike.discarded === 0, 'session frames all accepted by emulator');
  check(bike.steering_remote === 0 && bike.speed_remote === 0, 'emulator state neutral at end of session');

  // user disconnect: neutral x2 then close
  i0 = mark(); els.btnDisconnect.dispatch('click');
  await sleep(800);
  const dfr = since(i0).map(w => w.s);
  check(dfr.length >= 2 && dfr.slice(-2).every(s => s === NEU), 'disconnect sends >=2 neutral frames last', dfr.map(txt).join(' '));
  check(portClosed, 'port closed after disconnect');
  check(/연결 안 됨/.test(els.connText.textContent), 'UI idle after disconnect');
  const after = mark(); await sleep(300);
  check(writes.length === after, 'no writes after disconnect');

  // reconnect + write failures
  els.btnSerial.dispatch('click'); await sleep(200);
  check(/연결됨/.test(els.connText.textContent), 'reconnect ok');
  ptr('pointerdown', 300, 150); await sleep(200);
  writeFailMode = 2; i0 = mark();
  await sleep(400);
  const firstAfterErr = since(i0)[0] ? txt(since(i0)[0].s) : 'none';
  console.log('  [info] joystick held, 2 write errors -> next successful frames: ' + since(i0).slice(0, 3).map(w => txt(w.s)).join(' ') +
    (firstAfterErr === '<200200>' ? ' (neutral retry delivered)' : ' (neutral retry overwritten by periodic tick)'));
  ptr('pointerup', 300, 150);
  writeFailMode = 1000; const tFail = performance.now();
  while (/연결됨/.test(els.connText.textContent) && performance.now() - tFail < 3000) await sleep(10);
  console.log('  [info] time from persistent write failure to disconnected UI: ' + (performance.now() - tFail).toFixed(0) + 'ms');
  await sleep(100);
  check(/연결 안 됨|끊김/.test(els.connText.textContent), 'repeated write errors -> disconnected', els.connText.textContent);
  check(els.linkAlert.classList.contains('show'), 'alert shown on repeated write errors');
  writeFailMode = 0;

  // unexpected disconnect
  els.btnSerial.dispatch('click'); await sleep(200);
  check(/연결됨/.test(els.connText.textContent), 'reconnect #2 ok');
  els.linkAlert.classList.remove('show');
  (portListeners.disconnect || []).slice().forEach(fn => fn());
  await sleep(100);
  check(/끊김/.test(els.connText.textContent), 'unexpected disconnect -> UI "연결 끊김"', els.connText.textContent);
  check(els.linkAlert.classList.contains('show'), 'unexpected disconnect -> alert');
  const a2 = mark(); await sleep(300);
  check(writes.length === a2, 'no writes after unexpected disconnect');

  // listener accounting
  check((portListeners.disconnect || []).length === 0, 'port disconnect listeners removed', String((portListeners.disconnect || []).length));
  check(errors.length === 0, 'no runtime errors / unhandled rejections', errors.join(' | '));
}

runApp().catch(e => { check(false, 'app runtime threw', e.stack); }).finally(() => {
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) console.log('FAILURES:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
});
