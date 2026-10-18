# 04 개발 수정 기록 (QA 03 대응)

대상: `web/index.html` (앱 블록과 HTML 문구만 수정. `bike-protocol` 블록은 변경 없음)

| # | 수정 내용 |
|---|---|
| R1 | `sender.forceNeutral` 플래그 추가. 쓰기 오류(1~2회) 시 true로 설정하고 `pendingJoy = NEUTRAL`. `queueJoy`와 pump가 플래그가 켜진 동안 조이스틱 프레임을 중립으로 바꿈. 중립 write가 성공하면 해제됨. 결과: 주기 tick이 중립 재전송을 덮어쓰지 못함 |
| R2 | `sender.linkDead` 플래그 추가. `txErrors >= 3`이면 pending을 비우고 linkDead를 설정한 뒤 disconnect를 호출함. linkDead 동안에는 `queueJoy`/`queueBtn`이 무시되고, pump 루프와 `waitIdle`이 바로 끝나며, `disconnect()`가 중립 재전송 대기를 건너뜀. 그래서 오류 로그가 더 쌓이지 않음 |
| R3 | pagehide/beforeunload: `Promise.resolve(transport.write(...)).catch(function(){})`를 쓰고 `sender.pendingJoy = NEUTRAL`도 함께 넣음 |
| R5 | `BleTransport._cleanupListeners()` 추가(gattserverdisconnected와 characteristicvaluechanged 제거). `gatt.connect()` 이후 전체를 try로 감싸 실패 시 리스너를 정리하고 GATT를 해제함. `_closed`도 이 함수를 써서 예기치 않은 끊김 때 notify 리스너를 제거함. `onTransportClosed` 가드를 `t !== transport`로 좁혀, 연결 실패/연결 중/사용자 해제 중인 transport가 "연결 실패" 표시를 덮어쓰지 못하게 함(사용자 해제의 UI는 `disconnect()`가 정리함) |
| R6 | BLE connect 끝에서 `_closedFired`가 이미 true이면 throw → 실패 경로로 정리함. Serial에도 같은 검사를 넣음 |
| R7 | SerialTransport.connect: open 이후 단계(getWriter 등)가 실패하면 disconnect 리스너를 제거하고 writer를 해제한 뒤 `port.close()` |
| R8 | 출력 제한 슬라이더 `min`을 10에서 15로 올림. 데드존 안내 문구 추가 |
| R4 | 안전 안내에 "조종 중에는 탭을 숨기지 마세요" 항목만 추가함(코드 변경 없음) |

## 테스트
- `node _workspace/qa_test.js`: **이번 세션에서 실행하지 못함.** 하위 에이전트에 셸 도구가 없음. 호출자가 실행해야 함.
- 수동 검토 결과: 테스트 시나리오(연결 직후 중립, 해제 시 중립 2회, 쓰기 오류 2회 후 복구, 지속 실패 시 해제와 경고, 예기치 않은 분리, 리스너 제거, unhandledRejection 없음)는 수정 후 흐름에서도 그대로 성립해야 함. 쓰기 오류 2회 테스트의 `[info]`는 이제 "(neutral retry delivered)"가, 지속 실패에서 해제까지 걸리는 시간은 약 1초에서 약 100ms 수준으로 줄어든 값이 나와야 함.
