# QA 보고서: web/index.html vs remote.ino

- 대상: `web/index.html` (protocol 블록 + 앱 블록), `01.Arduino Code and Library/remote.ino`
- 테스트: `_workspace/qa_test.js` (Node v24.21.0에서 실제 실행)
- 실행: `node "_workspace/qa_test.js"` (프로젝트 루트 기준; 종료 코드 0 = 전체 통과)
- 결과: **603개 통과, 0개 실패**. 차단 결함 없음. 아래에 개선 권고(낮음~중간)를 정리함.
- 코드는 수정하지 않음.

## 1. 테스트 방법
1. index.html에서 `<script>` 블록 2개를 정규식으로 추출하고 `new vm.Script()`로 구문을 검사함(`node --check`와 같은 효과).
2. `<script id="bike-protocol">`를 빈 `vm` 컨텍스트에서 실행하고 `globalThis.__bike` API를 가져옴.
3. `readControlParameters`/`getJoystickState`/`getButtonState`를 JS로 재현함. AVR 의미를 그대로 따름: `double`=float32는 `Math.fround`로, `map()`은 long 정수 연산에 C의 0 방향 절삭, `int` 대입은 절삭, `cmd[8]` 범위 밖 쓰기는 감지만 함. 결과를 float64 독립 오라클과 앱의 `firmwareEstimate`와 교차 비교함.
4. 앱 블록을 스텁 DOM과 가짜 Web Serial 포트로 실제 실행함. 포인터, 키보드, blur, visibilitychange, 비상정지, 버튼, 해제, 쓰기 오류, 예기치 않은 분리 이벤트를 주입하고, 실제로 write된 바이트와 시각을 기록해 에뮬레이터에 다시 넣음.

## 2. 항목별 결과

| # | 항목 | 결과 | 근거 / 재현 |
|---|---|---|---|
| 1 | 스크립트 구문 (2블록) | 통과 | 섹션 1 |
| 2 | STX(0x02)/ETX(0x03) 위치 | 통과 | 49개 조합 전부 bytes[0]=02, bytes[7]=03 |
| 3 | 3자리 제로패딩, 6자리 ASCII 숫자 | 통과 | `/^\d{6}$/`. 범위 클램프 덕분에 실제 값은 항상 "100"~"300" |
| 4 | +200 오프셋 | 통과 | 파서 복원값 joyX/joyY가 입력과 일치 (49개 조합과 -100~100 전체 스윕) |
| 5 | 길이: 조이스틱 8, 버튼 3 | 통과 | |
| 6 | 모든 바이트 127 이하 | 통과 | `toBytes`가 127 초과를 RangeError로 거부함 (테스트함) |
| 7 | 경계값 -100,-11,-10,0,10,11,100 (X×Y 49개 조합) | 통과 | 파서가 받아들이고, 오버플로 0, 데드존 10은 0, 11은 0이 아님 |
| 8 | 앱 `firmwareEstimate`가 펌웨어와 같음 | 통과 | float32 경로와 float64 경로가 -100~100 전체에서 같음 |
| 9 | 범위 밖 입력 클램프 | 통과 | -101, 101, ±1e9 → ±100. NaN, ±Infinity, null, undefined, 'abc' → 0. -0 → 0 ('-' 문자 없음). 모두 펌웨어가 받아들이는 프레임 |
| 10 | 버튼 A/B/C/D | 통과 | 소문자는 대문자로 바뀜. E, '', 'AB', null, 1, ETX는 거부. 에뮬레이터 비트: A,C → 0b11, B → bit0 끔, D → bit1 끔 |
| 11 | 연이어 붙은 프레임 5개 | 통과 | 루프 5회 호출에 5프레임을 처리하고 버리는 바이트 없음 |
| 12 | 프레임이 쪼개져 도착 (k=1..7) | 통과 (펌웨어 특성) | k=1..6이면 프레임이 버려지고 이전 명령이 유지됨(쓰레기 값 적용 없음). k=7이면 ETX 없이 i==7로 디스패치되어 적용됨. 오버플로 없음 |
| 13 | 연결 직후 중립 | 통과 | 첫 write가 `02 32 30 30 32 30 30 03` |
| 14 | pointerup 중립 | 통과 | 지연 60ms 미만. 이후 프레임 전부 중립 |
| 15 | 키 해제 중립 | 통과 | 60ms 미만 |
| 16 | blur 중립, 조이스틱 해제 | 통과 | 이후 pointermove 무시됨 |
| 17 | visibilitychange(hidden) 중립 | 통과 | 아래 R4 참고 |
| 18 | 비상정지(Space) | 통과 | 정지 중에는 포인터/키 입력이 있어도 전부 중립 |
| 19 | 방향 반전 토글 시 중립 | 통과 | |
| 20 | 연결 해제 시 중립 2회 후 포트 닫힘, 이후 write 없음 | 통과 | |
| 21 | 전송 주기 / 최소 간격 | 통과 | 13.3 프레임/s (80ms 주기), 실측 최소 간격 45ms (설정 35ms). 펌웨어는 10ms마다 1프레임을 처리하므로 버퍼가 쌓이지 않음 |
| 22 | write 1회 = 완전한 1프레임 | 통과 | 기록된 write 51개가 모두 8 또는 3바이트 |
| 23 | 세션 전체를 에뮬레이터에 넣었을 때 | 통과 | 무시/폐기/오버플로 0, 마지막 상태 steering 0, speed 0 |
| 24 | 쓰기 오류 3회 이상이면 해제 + 경고 | 통과 (느림) | 계속 실패하면 해제까지 약 1.04초. R2 참고 |
| 25 | 예기치 않은 분리 | 통과 | UI "연결 끊김", 경고와 진동, 이후 write 없음, disconnect 리스너 제거됨 |
| 26 | 브라우저 미지원 처리 | 통과 | `navigator.bluetooth`가 없으면 BLE 버튼 비활성과 안내 문구. 보안 컨텍스트도 확인함 |
| 27 | 런타임 예외 / unhandledRejection (스텁 환경) | 통과 | draw()도 2회 실행했고 오류 0 |

## 3. 발견 사항과 수정 제안 (차단 결함 없음)

### R1. 쓰기 오류 후 "중립 재시도"가 주기 tick에 덮어써짐 (낮음)
- 재현: 조이스틱을 누른 채로 write를 2회 실패시키면, 다음에 성공하는 프레임이 `<300200>`이 됨(테스트의 `[info]` 출력).
- 원인: `handleWriteError`가 `sender.pendingJoy = NEUTRAL`을 넣지만, pump가 35ms 기다리는 동안 80ms tick이 `pendingJoy`를 현재 입력으로 덮어씀.
- 영향: 사용자가 계속 누르고 있는 입력이 전송되는 것이라 위험하지는 않음. 다만 주석("오류 시 중립 재시도")과 동작이 다름.
- 제안: 오류 직후 `sender.forceNeutralUntil = now + 200ms` 같은 플래그를 두고, 그동안 tick이 중립만 넣게 함. 아니면 주석을 실제 동작에 맞게 고침.

### R2. 링크가 죽었을 때 해제까지 약 1초 걸리고 오류가 계속 쌓임 (낮음)
- 재현: 연결 후 write가 계속 실패하게 하면, 해제 UI까지 약 1037ms가 걸리고 그동안 "송신 오류" 로그가 35ms마다 찍힘.
- 원인: `disconnect()`가 `waitIdle(400)` + `sleep(80)` + `waitIdle(400)`을 기다림. 그동안 pump는 `pendingJoy = NEUTRAL`을 계속 다시 넣어 멈추지 않음.
- 제안: `disconnect(reason, {linkDead:true})`처럼 쓰기 오류 경로에서는 중립 재전송 대기를 건너뛰거나 waitIdle을 짧게 함. `txErrors >= 3` 이후에는 `pendingJoy`를 다시 넣지 않음.

### R3. pagehide/beforeunload의 직접 write (낮음)
- `transport.write()`는 async인데 `try/catch`로 감싸서 거부(reject)를 잡지 못함 → unhandledrejection 가능.
- 이 write는 sender를 거치지 않아 BLE에서 pump의 write와 겹치면 "GATT operation already in progress"로 실패할 수 있음. 바이트가 섞이는 위험은 없음(Serial writer는 순서대로 큐에 넣음).
- 제안: `transport.write(...).catch(function(){})`. 가능하면 `sender.pendingJoy = NEUTRAL`도 함께 넣음.

### R4. 탭 숨김 시 중립 전송이 타이머 스로틀로 늦어질 수 있음 (낮음, 실기기 확인 필요)
- `pump`는 최소 간격을 `setTimeout`(sleep)으로 맞춤. 숨겨진 탭에서는 Chrome이 타이머를 최대 1초 단위로 늦출 수 있어, 직전 write 후 35ms 안에 숨김이 일어나면 중립이 최대 약 1초 늦을 수 있음. 스텁 환경에서는 재현할 수 없음.
- 제안: `visibilitychange`/`blur`에서 `performance.now() - lastWrite >= MIN_GAP_MS`이면 sleep 없이 바로 write하는 경로를 둠. 아니면 숨김 직전에 바로 write함(펌웨어는 프레임이 붙어 와도 문제없음: 항목 11).

### R5. BLE 연결 실패 시 리스너와 UI 정리 (낮음)
- `gatt.connect()`가 실패하면 `gattserverdisconnected` 리스너가 device에 남음. `_closed`가 호출되지 않기 때문. 같은 BluetoothDevice 객체를 다시 쓰면 나중에 옛 transport의 `_closed`가 불림. `onTransportClosed`의 가드 덕분에 지금은 해가 없음.
- 서비스를 찾지 못해 `gatt.disconnect()`를 부르면 비동기 `gattserverdisconnected` → `onTransportClosed`가 "연결 실패" 표시를 "연결 안 됨"으로 덮어씀.
- 예기치 않게 끊길 때 `characteristicvaluechanged` 리스너를 제거하지 않음. 특성 객체가 재사용되면 수신 로그가 중복될 수 있음.
- 제안: connect의 catch에서 `device.removeEventListener('gattserverdisconnected', ...)`와 notify 리스너 제거를 공통 cleanup으로 묶음. `onTransportClosed`에서 `connecting` 상태나 실패한 transport이면 UI를 건드리지 않음.

### R6. 연결 중 끊김 경합 (낮음)
- BLE `connect()` 중간(서비스 탐색 중)에 `gattserverdisconnected`가 오면 `_closed`가 `connected=false`로 만든 뒤, connect 끝에서 `connected=true`로 다시 바뀜. 이후 close 이벤트가 오지 않아(`_closedFired`) 쓰기 오류 3회 경로로만 해제됨.
- 제안: connect 마지막에 `if (this._closedFired) throw new Error('연결 중 끊김')`.

### R7. Serial 연결 실패 시 포트가 열린 채 남을 수 있음 (낮음)
- `port.open()` 뒤 `getWriter()` 등이 throw하면 앱의 catch는 `t.connected`가 false라서 `disconnect()`를 부르지 않음 → 포트가 열린 채 남고, 다시 연결하면 "already open" 오류.
- 제안: SerialTransport.connect 안에서 open 후 단계를 try로 감싸 실패 시 `port.close()`.

### R8. 출력 제한 10%에서는 바이크가 절대 움직이지 않음 (UX, 낮음)
- `computeOutput(100,100,{limit:10})` → (10,10): 전부 데드존(|v| ≤ 10)임. 슬라이더 최솟값이 10이라 사용자가 "고장"으로 오해할 수 있음.
- 제안: 슬라이더 최솟값을 15 이상으로 하거나, "10%는 데드존이라 움직이지 않음"을 안내함. 데드존 띠는 이미 frac=1로 전체 표시되므로 시각 단서는 있음.

### R9. ±10.5 반올림 비대칭 (정보)
- `Math.round(-10.5) = -10`, `Math.round(10.5) = 11` → 원시 입력 21(limit 50)에서 +쪽만 데드존을 벗어남. 데드존 띠는 10.5로 대칭 표시함. 실사용 영향은 무시할 수준. 원하면 `Math.sign(v)*Math.round(Math.abs(v))`로 바꿈.

### R10. 분석 문서 정정 (정보, 01_analyst_protocol.md)
- 3.2절 "Y=+11 → 8 (8.8 절삭)"은 틀림. `map(11,100,-100,80,-80) = trunc(-89*-160/-200) + 80 = -71 + 80 = **9**`. Y=-11은 -8. 즉 speed는 `Y*0.8`의 단순 절삭이 아니고 ±1 비대칭이 있음. 앱의 `firmwareEstimate`는 map을 그대로 재현하므로 9로 올바르게 표시함.
- X=-11 → steering -3, X=+11 → +4 (문서 표의 +11 → +4는 맞음).

## 4. 펌웨어 쪽 참고 (앱으로 해결 불가, 재확인)
- 쪼개져 도착한 프레임(k=1..6)은 버려지고 이전 명령이 유지됨. 남은 바이트는 루프마다 1바이트씩 버려짐(최대 약 70ms). 80ms 주기라 다음 프레임에서 회복됨. 중립 프레임이 쪼개져 사라지면 다음 tick의 중립이 보완함. 앱이 해제 시 중립을 2회 보내는 설계가 이 부분에 유효함.
- 에뮬레이터로 `cmd[8]` 범위 밖 쓰기 결함을 재현함(ETX 없는 8바이트 이상 입력). 앱은 이런 프레임을 보내지 않음(항목 22).
- 통신 두절 failsafe가 없음 → 펌웨어에 "마지막 유효 프레임 후 N ms 동안 수신 없으면 speed/steering=0"을 넣을 것을 권고함.

## 5. 미검증 (실기기 필요)
- 실제 BLE 모듈(HM-10/Nordic UART)에서의 write 동작, MTU, 알림. 스텁에서는 Serial 경로만 실행함.
- 숨겨진 탭의 타이머 스로틀 영향(R4), 모바일 터치 동작, iOS 미지원 안내 화면.
