# INFERENCE_BASE — MES (생산관리)

> **버전**: v1.1
> **최종 갱신**: 2026-04-16
> **목적**: MES 어드민 Work MD 생성·검증 시 반복적으로 적용된 AI 추론 패턴을 문서화한다. 향후 Work MD 작성 시 동일 컨텍스트에서 자동 적용 기준이 된다.
> **참조 원칙**: 본 파일은 추론 가이드일 뿐 정책이 아니다. 충돌 시 POLICY_BASE_ADMIN이 우선한다.

---

## 1. 정책 자동 적용 패턴

### IB-001 — 메모/엑셀/기간조회/검색설정저장 (공통 운영 정책)
**조건**: 어드민 화면에서 메모 / 엑셀 다운로드 / 기간 조회 / 검색 설정 저장 기능 발견 시
**적용**: 사용자 확인 없이 [HIGH]로 LR에 자동 반영

| 기능 | 자동 LR |
|------|---------|
| 메모 | "메모 수정/삭제 권한은 POL-ADM-030을 따른다" |
| 엑셀 다운로드 | "엑셀 다운로드 권한은 POL-ADM-031을 따른다" |
| 기간 조회 | "기간조회 기본값은 POL-ADM-032를 따른다" |
| 검색 설정 저장 | "검색 설정 저장 방식은 POL-ADM-033을 따른다" |

**근거**: 프로젝트 규칙 §3.3 + POLICY_BASE_ADMIN §3.1. WK-PRD-MON·AUD에서 일관 적용 확인.
**예외**: 홈페이지 Work MD에는 적용 금지 (어드민 전용 정책).

---

### IB-002 — 감사 로그 자동 분리
**조건**: 상태 변경 / 데이터 수정이 있는 모든 화면
**적용**: "POL-MES-001 (업무 이력 영구 / 접근 로그 2년)" 인용
**근거**: COM/PRC/FAB/PKG/AUD 5종에서 일관 적용

---

### IB-003 — 비관적 Lock MES 예외
**조건**: 작업 데이터, 감리 승인 등 MES 운영 데이터에 동시 수정 가능성 발생 시
**적용**:
- 마스터 데이터(예: 가공마스터, 기기 마스터) → POL-AUTH-002 비관적 Lock 적용
- 작업 데이터 / 감리 승인 → "POL-AUTH-002 예외(MES): Lock 미적용. 한 기기 한 작업자 전담 원칙"
**근거**: POLICY_BASE_ADMIN §3.5. PRC LR-026, AUD LR-012에서 적용

---

### IB-004 — 선행 조건 검증 MES 예외 (감리)
**조건**: 감리 화면에서 공정 선행 조건 검증 필요성 검토 시
**적용**: "POL-EXC-001 예외(MES): 감리는 선행 검증 미적용 (공정과 독립)"
**근거**: POLICY_BASE_ADMIN §3.5 명시. AUD LR-013 적용.

---

### IB-005 — Fallback 체인 (자동 재시도)
**조건**: 외부 시스템 PUSH/알림톡/송장 발급/프린터 출력 등 외부 의존 작업
**적용 패턴**: "POL-EXC-002를 따른다 (자동 3회 재시도 → 관리자 알림 → 수동 보정)"
**예외 케이스**:
- PKG 프린터 출력: 수동 재출력만 (DEC-20, OI-016 등록)
- AUD 알림톡: 자동 3회 (POL-EXC-002 표준)
- PRC→FAB PUSH: 즉시→30초→60초 (POL-EXC-002 표준 간격)

---

### IB-006 — Terminal 상태 보호 (역전이 차단)
**조건**: 완료/취소 등 Terminal 상태로 전이된 데이터에 대한 수정 시도
**적용**: "POL-MES-007 (역전이 차단)을 따른다"
**근거**: POLICY_BASE_ADMIN §2.7. AUD 감리완료, PRC 인쇄 완료 취소 차단 등에 적용

---

## 2. Meta 작성 추론 패턴

### IB-101 — 담당공정 / 전공정 / 후공정 결정
**기준**:
- **담당공정**: 화면이 직접 WRITE 권한을 가진 공정 단위
- **전공정**: TRIGGER IN 발생원 또는 READ-only 선행 단계
- **후공정**: TRIGGER OUT 수신처

**사례**:
- WK-PRD-PRC: 담당=인쇄, 전=조판/CTP, 후=가공/포장
- WK-PRD-AUD: 담당=감리, 전=— (독립), 후=— (Terminal). 단 PRC/FAB로부터 TRIGGER IN 수신

---

### IB-102 — depends_on / depends_by 분리
**기준**:
- **depends_on**: 본 Work MD가 의존하는 대상 (TRIGGER IN, READ, INHERIT)
- **depends_by**: 다른 Work MD가 본 Work MD를 참조하는 역방향 의존

**사례**: AUD는 PRC/FAB에 depends_on (TRIGGER IN) + depends_by (READ — 작업 카드 배지)를 동시에 가짐 → 양방향 명시 필수

---

### ~~IB-103 — 참조 POLICY_BASE 결정~~ (v1.1 폐기)
> **폐기 사유**: Safety Scan 보강(2026-04-16)으로 POLICY_BASE_PRODUCTION v1.8이 신설되어 MES Work MD는 POLICY_BASE_ADMIN + POLICY_BASE_PRODUCTION 양쪽을 참조한다. 기존 "ADMIN만 참조" 추론은 더 이상 유효하지 않으며, 각 Work MD Meta의 "참조 POLICY_BASE" 필드에 명시적으로 기재하는 것으로 대체한다.

---

## 3. 섹션 작성 추론 패턴

### IB-201 — Actor 표준화
**기준**: 3종(User/Manager/System) + 괄호 안 구체 역할명
**MES 표준 역할**:
- User(고객) — 홈페이지 (현재 MES는 미해당)
- Manager(생산관리자), Manager(인쇄담당), Manager(조판담당), Manager(가공담당), Manager(포장담당), Manager(감리담당자)
- System(자동배정), System(트리거발신), System(알림톡발송), System(WebSocket)

---

### IB-202 — DEC 카테고리 분류
**카테고리 표준**:
1. 화면 정의
2. 상태/전이
3. 권한·역할
4. 데이터/마스터
5. 자동화·트리거
6. 예외/Fallback
7. UI·UX 결정

---

### IB-203 — Entity 명명 규칙
**원칙**:
- 한글명(영문Pascal) 형태
- 동일 개념 다른 공정 → 공정 접두어 분리 (예: ProcessingJob, PackagingJob)
- 마스터 데이터는 GW 출처 명시 (Reference 컬럼)

---

## 4. 검증 추론 패턴 (Safety Scan 사전 점검)

### IB-301 — POLICY_BASE 풀어쓰기 금지
**검사**: LR/AC에 정책 수치(예: "3회 재시도", "2년 보관")가 직접 기재되었는가
**조치**: 정책 ID 인용으로 치환

---

### IB-302 — 모호 표현 검출
**금지 표현**: ~등, ~기타, ~외, ~같은, ~여러, ~일부, ~할 수 있다(가능성)
**조치**: 확정이면 전체 나열, 미확정이면 [NEED-CONFIRM] 또는 OI 등록

---

### IB-303 — 정책 ID 버전 표기 금지
**검사**: POL-XXX-NNN-v1 형태 표기 여부
**조치**: 버전 제거 (항상 최신 참조 원칙)

---

### IB-304 — Cross-Work-MD 의존 양방향 일치
**검사**: A의 depends_on에 B가 있으면, B의 depends_by에 A가 있어야 함
**조치**: 누락 시 양쪽 Meta 갱신

---

## 5. 변경 이력

| 버전 | 일자 | 변경 내용 |
|------|------|----------|
| v1.0 | 2026-04-14 | Phase 2-3 초안 작성. WK-PRD-COM/PRC/FAB/PKG/MON/AUD 6개 Work MD 생성 과정에서 반복 적용된 추론 패턴 14건(IB-001~006, IB-101~103, IB-201~203, IB-301~304) 정리 |
| v1.1 | 2026-04-16 | Safety Scan 보강 반영. IB-103 폐기 — POLICY_BASE_PRODUCTION v1.8 신설로 "ADMIN만 참조" 추론 무효화. Work MD Meta 명시 방식으로 대체 |
