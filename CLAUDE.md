## 하네스: 밸런싱 바이크 웹 컨트롤러

**목표:** Arduino 밸런싱 바이크를 블루투스(Web Bluetooth/Web Serial)로 조종하는 웹페이지 제작·개선

**호출 조건:** 바이크 웹 컨트롤러, 블루투스 연결, 조이스틱/버튼 UI, 통신 프로토콜 관련 작업을 요청받으면 `bike-web-orchestrator` 스킬을 사용한다. 단순 질문에는 직접 답해도 된다.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
| --- | --- | --- | --- |
| 2026-10-17 | Harness v2로 처음 구성 | 전체 | - |
| 2026-10-18 | 03.Firmware 대응: 시리얼 보드레이트 선택(기본 9600), 'J x y' 수신 확인 표시, failsafe 안내 | web/index.html, bike-protocol, qa_test.js | 펌웨어가 9600/에코/failsafe로 바뀜 |
| 2026-11-09 | 연결 직후 캘리브레이션 상태 요청(STX 'S' ETX) 전송, 펌웨어 'S' 응답 추가 | web/index.html, remote.ino, qa_test.js | 연결 시 캘리브레이션 여부를 바로 표시 |
