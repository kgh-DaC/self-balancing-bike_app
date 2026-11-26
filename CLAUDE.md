## 하네스: 밸런싱 바이크 웹 컨트롤러

**목표:** Arduino 밸런싱 바이크를 블루투스(Web Bluetooth/Web Serial)로 조종하는 웹페이지 제작·개선

**호출 조건:** 바이크 웹 컨트롤러, 블루투스 연결, 조이스틱/버튼 UI, 통신 프로토콜 관련 작업을 요청받으면 `bike-web-orchestrator` 스킬을 사용한다. 단순 질문에는 직접 답해도 된다.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
| --- | --- | --- | --- |
| 2026-10-17 | Harness v2로 처음 구성 | 전체 | - |
| 2026-10-18 | 03.Firmware 대응: 시리얼 보드레이트 선택(기본 9600), 'J x y' 수신 확인 표시, failsafe 안내 | web/index.html, bike-protocol, qa_test.js | 펌웨어가 9600/에코/failsafe로 바뀜 |
| 2026-11-09 | 연결 직후 캘리브레이션 상태 요청(STX 'S' ETX) 전송, 펌웨어 'S' 응답 추가 | web/index.html, remote.ino, qa_test.js | 연결 시 캘리브레이션 여부를 바로 표시 |
| 2026-11-26 | 웹 하단에 '핀 연결(아두이노 나노 + 제작 PCB)' 카드: 나노 핀 그림, 기능별 핀↔PCB 커넥터, 커넥터 핀 순서, 전원 회로, 펌웨어↔PCB 차이(배터리 A0/A7, D10=360° 서보, D0/D1 공유). 근거 PCB 회로도 SCH.pdf V1.0 | web/index.html | 사용자 요청(통합 허브 세션), 보드 Nano 확인 |
| 2026-11-26 | 핀 연결 카드 근거를 제작 PCB 레포(kgh-DaC/self-balancing-bike_pcb, 2026-10-12 실보드 확정)로 바꿈: FlyWheel 1 VIN … 8 B(원본 SCH와 반대), 엔코더 A=D3·B=D2, U2 TPS563201, 실크 표시, 모터 케이블 색, 보호 회로 없음 | web/index.html | 사용자 제공 PCB 자료 |
| 2026-11-26 | 핀 카드에 제작 PCB 윗면 그림 추가(나노 그림 옆, 03_layout_plan 2.1절 핀 좌표로 실척 배치, 커넥터 핀 번호·신호·1번 핀 표시) | web/index.html | 사용자 요청 |
