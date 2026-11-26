// 밸런싱 바이크 3D 형상(디지털 트윈). 일반 스크립트(file://로 열어도 동작).
// three.js: vendor/three-r160-bundle.js(로컬 묶음, window.SMARS_THREE — SMARS·Otto와 같은 파일).
// 입력: index.html 주 스크립트가 0.08초마다 갱신하는 window.bikeState
//   { x: 조향 -100~100, y: 속도 -100~100 (보내는 값, 반전 설정 반영), connected, calib: 'ok'|'need'|'unknown', estop, echoOk }
// 바이크는 기울기·바퀴 속도를 보내지 않는다 → 바퀴·이동은 보낸 값으로 계산한 근사다.
//   앞바퀴 조향: STEERING_MAX 350µs(±약 30°) 비례, 뒷바퀴(360° 서보): 1500 + 속도×0.8×7 µs 비례(최대 약 20 cm/s 가정).
// 좌표: 1 단위 = 1 cm, 위 = +Y, 바이크 앞 = +Z, 바이크 왼쪽 = +X.
(function () {
  'use strict';
  function start() {
    var host = document.getElementById('bikeTwin');
    if (!host) return;
    var LIB = window.SMARS_THREE;
    if (!LIB) { host.className += ' twin-missing'; host.textContent = '3D 형상을 그릴 수 없습니다: web/vendor/three-r160-bundle.js 파일이 없습니다. 조종은 그대로 할 수 있습니다.'; return; }
    var THREE = LIB.THREE, OrbitControls = LIB.OrbitControls;
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (e) { host.className += ' twin-missing'; host.textContent = '이 브라우저에서 3D(WebGL)를 쓸 수 없습니다.'; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
    var HOME = new THREE.Vector3(30, 20, 26), TARGET = new THREE.Vector3(0, 7, 0);
    camera.position.copy(HOME);
    var controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(TARGET); controls.enableDamping = true;
    controls.minDistance = 16; controls.maxDistance = 120; controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    var sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(15, 30, 20); scene.add(sun);

    var grid = new THREE.GridHelper(300, 60, 0x5c6b80, 0x334155);
    grid.material.transparent = true; grid.material.opacity = 0.55;
    scene.add(grid);
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(9, 26), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.2 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; scene.add(shadow);

    function mat(c, o) { var p = { color: c, roughness: 0.6, metalness: 0.05 }; if (o) for (var k in o) p[k] = o[k]; return new THREE.MeshStandardMaterial(p); }
    function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
    var WHITE = mat(0xf1f3f5), DARK = mat(0x24282e), TIRE = mat(0x1b1d21, { roughness: 0.9 }), RIM = mat(0xf59f00),
      PCB = mat(0x166534), NANO = mat(0x1e3a8a), METAL = mat(0xb8bec7, { metalness: 0.5, roughness: 0.35 });

    var R = 3.3, WB = 15;   // 바퀴 반지름, 축간거리(cm, 근사)
    var bike = new THREE.Group();          // 기울기(lean)
    scene.add(bike);
    function wheel() {
      var g = new THREE.Group();
      var tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.55, 0.55, 12, 32), TIRE); tire.rotation.y = Math.PI / 2;
      var rim = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.9, R - 0.9, 0.9, 24), RIM); rim.rotation.z = Math.PI / 2;
      var spoke = box(1.0, (R - 0.9) * 2, 0.5, DARK);   // 회전이 보이도록 한 줄 무늬
      g.add(tire, rim, spoke);
      return g;
    }
    // 뒷바퀴(360° 서보 구동)
    var rearSpin = wheel(); rearSpin.position.set(0, R, -WB / 2); bike.add(rearSpin);
    var rearServo = box(2.2, 2.4, 4.2, mat(0xfacc15)); rearServo.position.set(-1.9, R, -WB / 2); bike.add(rearServo);
    // 프레임(3D 프린트 몸체)
    var frame = box(3.2, 3.0, WB + 2, WHITE); frame.position.set(0, R + 2.6, 0); bike.add(frame);
    var tail = box(2.6, 2.0, 3, WHITE); tail.position.set(0, R + 1.2, -WB / 2 + 1); bike.add(tail);
    // 배터리(3S)
    var batt = box(2.8, 2.2, 7, mat(0x2563eb)); batt.position.set(0, R + 0.9, -1); bike.add(batt);
    // 플라이휠(Nidec 24H, 축 = 앞뒤 방향): 회전으로 균형을 잡는다
    var fwHolder = new THREE.Group(); fwHolder.position.set(0, R + 8.6, -1.5); bike.add(fwHolder);
    var motor = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.2, 24), DARK); motor.rotation.x = Math.PI / 2; motor.position.z = -1.6; fwHolder.add(motor);
    var fly = new THREE.Group(); fwHolder.add(fly);
    var disk = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.9, 40), METAL); disk.rotation.x = Math.PI / 2; fly.add(disk);
    var mark = box(0.8, 4.6, 1.0, mat(0xef4444)); mark.position.y = 2.6; fly.add(mark);
    var mount = box(2.6, 5.5, 1.4, WHITE); mount.position.set(0, R + 5.0, -1.5); bike.add(mount);
    // PCB + 나노(윗면)
    var board = box(5.0, 0.3, 6.9, PCB); board.position.set(0, R + 4.3, 3.2); bike.add(board);
    var nano = box(1.8, 0.4, 4.3, NANO); nano.position.set(-0.8, R + 4.65, 3.6); bike.add(nano);
    // 앞 포크 + 앞바퀴(조향 서보)
    var steer = new THREE.Group(); steer.position.set(0, R, WB / 2); bike.add(steer);
    var frontSpin = wheel(); steer.add(frontSpin);
    var fork = box(0.6, 6.4, 1.2, WHITE); fork.position.set(1.3, 3.0, 0); steer.add(fork);
    var fork2 = fork.clone(); fork2.position.x = -1.3; steer.add(fork2);
    var crown = box(3.2, 0.8, 1.6, WHITE); crown.position.set(0, 6.2, 0); steer.add(crown);
    var steerServo = box(2.4, 2.4, 4.0, mat(0xef4444)); steerServo.position.set(0, R + 3.6, WB / 2 - 2.6); bike.add(steerServo);
    // 상태 표시등(연결·균형)
    var ledMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
    var led = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), ledMat); led.position.set(1.8, R + 4.7, 5.6); bike.add(led);

    // ---------- 상태·애니메이션 ----------
    var rad = THREE.MathUtils.degToRad;
    var S = { steer: 0, speed: 0, lean: 0, yaw: 0, gx: 0, gz: 0, flyW: 0 };
    var last = performance.now();
    function lerp(a, b, k) { return a + (b - a) * k; }
    function frameFn(now) {
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      var st = window.bikeState || { x: 0, y: 0, connected: false, calib: 'unknown', estop: false };
      var x = st.estop ? 0 : st.x, y = st.estop ? 0 : st.y;
      var connected = !!st.connected;
      var canDrive = !connected || st.calib !== 'need';   // 미연결 = 미리보기, 연결 + 캘리브레이션 필요 = 구동 안 함
      var tSteer = canDrive && Math.abs(x) > 10 ? x : 0;  // 펌웨어 데드존 ±10
      var tSpeed = canDrive && Math.abs(y) > 10 ? y : 0;
      S.steer = lerp(S.steer, tSteer, Math.min(1, dt * 6));
      S.speed = lerp(S.speed, tSpeed, Math.min(1, dt * 4));
      var delta = rad(-S.steer * 0.3);                // 오른쪽(+) = 바이크 오른쪽(-X)으로 꺾임
      steer.rotation.y = delta;
      var v = S.speed / 100 * 20;                       // cm/s
      rearSpin.rotation.x += v / R * dt;
      frontSpin.rotation.x += v / R * dt;
      S.yaw += (v / WB) * Math.tan(delta) * dt;
      S.gz -= Math.cos(S.yaw) * v * dt; S.gx -= Math.sin(S.yaw) * v * dt;
      var cell = 5;
      grid.position.x = ((S.gx % cell) + cell) % cell;
      grid.position.z = ((S.gz % cell) + cell) % cell;
      // 기울기: 연결됐는데 캘리브레이션이 없으면 균형을 잡지 않으므로 옆으로 기대 쉰다. 균형 중이면 회전 안쪽으로 살짝 기울고 미세하게 흔들린다(근사)
      var balancing = connected && st.calib !== 'need';
      var tLean;
      if (connected && st.calib === 'need') tLean = rad(14);
      else tLean = (v * v / (Math.max(5, WB / Math.max(0.05, Math.abs(Math.tan(delta))))) / 981) * Math.sign(delta) * -1 + (balancing ? rad(0.8) * Math.sin(now / 260) : 0);
      S.lean = lerp(S.lean, tLean, Math.min(1, dt * 3));
      bike.rotation.set(0, S.yaw, 0, 'YXZ');
      bike.rotateZ(S.lean);
      // 플라이휠: 균형 중에는 기울기를 바로잡느라 계속 돌고(근사), 아니면 멈춘다
      var tW = balancing ? 8 + Math.abs(S.steer) * 0.06 + 3 * Math.sin(now / 400) : 0;
      S.flyW = lerp(S.flyW, tW, Math.min(1, dt * 2));
      fly.rotation.z += S.flyW * dt;
      ledMat.color.set(!connected ? 0x64748b : st.calib === 'need' ? 0xef4444 : 0x22c55e);
      controls.update();
      renderer.render(scene, camera);
    }
    var visible = true, raf = 0;
    function loop(t) { raf = 0; if (!visible || document.hidden) return; frameFn(t); raf = requestAnimationFrame(loop); }
    function kick() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es.some(function (e) { return e.isIntersecting; }); kick(); }).observe(host);
    document.addEventListener('visibilitychange', kick);
    function resize() {
      var w = host.clientWidth || 300, h = host.clientHeight || 300;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.render(scene, camera);
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host); else window.addEventListener('resize', resize);
    resize(); kick();
    var reset = document.getElementById('bikeTwinReset');
    if (reset) reset.addEventListener('click', function () { camera.position.copy(HOME); controls.target.copy(TARGET); controls.update(); S.yaw = 0; S.gx = 0; S.gz = 0; });
    window.bikeTwin = { state: S };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
