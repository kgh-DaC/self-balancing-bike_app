---
name: bike-web-orchestrator
description: 밸런싱 바이크를 블루투스로 제어하는 웹페이지를 만들고 개선하는 오케스트레이터. 바이크 웹 컨트롤러 제작, 조이스틱·버튼 UI 추가, 블루투스(BLE/Web Serial) 연결 수정, PID 튜닝 패널 추가, 통신 버그 수정, 웹페이지 다시 실행·보완·부분 수정 요청에 반드시 사용한다.
---

# 바이크 웹 컨트롤러 오케스트레이터

**실행 모드:** 서브에이전트 위임(순차) + 생성·검증 루프. 에이전트끼리 대화는 필요 없고 파일(`_workspace/`)로 전달한다.

## 0단계: 상태 확인
- `_workspace/`와 `web/index.html`이 있고 부분 수정 요청이면 해당 단계만 다시 실행한다(UI 수정 → 2단계부터, 프로토콜 의심 → 1단계부터).
- 새 요구사항이 크면 `_workspace/`를 `_workspace_{timestamp}/`로 옮기고 새로 시작한다.
- 없으면 1단계부터.
- 사용자에게 블루투스 모듈 종류(HM-10/BLE 또는 HC-05/06)를 모르면 질문한다. 모르면 두 방식을 모두 지원한다.

## 1단계: 프로토콜 분석
`Agent(subagent_type: "protocol-analyst")` → `_workspace/01_analyst_protocol.md`

## 2단계: 구현
`Agent(subagent_type: "web-developer")`에 01 문서와 `bike-protocol` 스킬을 읽게 하고 `web/index.html` 생성.

## 3단계: 검증
`Agent(subagent_type: "qa-tester")` → `_workspace/03_qa_report.md`.
실패 항목이 있으면 2단계로 돌아가 해당 항목만 수정시키고 재검증한다(최대 2회).

## 4단계: 보고
사용자에게 실행 방법(`cd web && python -m http.server` 후 Chrome에서 `http://localhost:8000`), 연결 방식, 실차 확인이 필요한 항목(조향/속도 방향)을 보고한다. 실차에서 바퀴를 띄운 상태로 먼저 시험하도록 안내한다.

## 오류 처리
- 에이전트 실패 시 1회 재시도, 재실패하면 해당 산출물 없이 진행하고 누락을 보고한다.
- QA 2회 후에도 실패가 남으면 남은 항목을 그대로 보고한다.

## 테스트 시나리오
- 정상: "바이크 조종 웹페이지 만들어줘" → 3개 에이전트 순차 실행 → `web/index.html` 생성, QA 전 항목 통과.
- 오류: 분석가가 `.ino`를 읽지 못함 → 스킬 기반 "미검증" 명세로 진행, 최종 보고에 명시.
- 후속: "조이스틱 데드존을 UI에 표시해줘" → 2단계(web-developer)부터 재실행.
