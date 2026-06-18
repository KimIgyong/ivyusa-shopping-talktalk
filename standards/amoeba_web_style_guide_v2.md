# Amoeba Basic Web Style Guide v2

## Amoeba Company Standard Web Style Guide (Amoeba Company 표준 웹 스타일 가이드)

**Document Version (문서버전):** v2.0
**Date (작성일):** 2026-03-23
**Author (작성):** Amoeba Company
**Scope (적용 범위):** All Amoeba Company web projects (Amoeba Company 전체 웹 프로젝트)
**Reference Project (기준 프로젝트):** AMB Management (Best Practices based / 베스트 프랙티스 기반)

---

## Table of Contents (목차)

1. [Layout System (레이아웃 시스템)](#1-layout-system-레이아웃-시스템)
2. [Layout Type Definitions (레이아웃 타입 정의)](#2-layout-type-definitions-레이아웃-타입-정의)
3. [Portal-specific Layouts (포털별 레이아웃)](#3-portal-specific-layouts-포털별-레이아웃)
4. [Icon System (아이콘 시스템)](#4-icon-system-아이콘-시스템)
5. [Color System (컬러 시스템)](#5-color-system-컬러-시스템)
6. [Typography (타이포그래피)](#6-typography-타이포그래피)
7. [Component Styles (컴포넌트 스타일)](#7-component-styles-컴포넌트-스타일)
8. [Chat UI Patterns (채팅 UI 패턴)](#8-chat-ui-patterns-채팅-ui-패턴)
9. [AI Streaming UI Patterns (AI 스트리밍 UI 패턴)](#9-ai-streaming-ui-patterns-ai-스트리밍-ui-패턴)
10. [Responsive Breakpoints (반응형 브레이크포인트)](#10-responsive-breakpoints-반응형-브레이크포인트)
11. [Spacing System (스페이싱 시스템)](#11-spacing-system-스페이싱-시스템)
12. [Notifications and Toasts (알림 및 토스트)](#12-notifications-and-toasts-알림-및-토스트)
13. [Web Accessibility Standards (웹 접근성 기준)](#13-web-accessibility-standards-웹-접근성-기준)

---

## 1. Layout System (레이아웃 시스템)

### 1.1 Overview (개요)

Amoeba projects use **3 base layout types** and **portal-specific layout variations** as standards.
(Amoeba 프로젝트는 **3가지 기본 레이아웃 타입**과 **포털별 레이아웃 변형**을 표준으로 사용합니다.)

| Layout Code (레이아웃 코드) | Name (명칭) | Usage (용도) |
|-------------|------|------|
| **Basic-A-1** | Basic Layout (기본 레이아웃) | Dashboard, general pages (대시보드, 일반 페이지) |
| **Basic-A-2-R** | Right Panel Layout (우측 패널 레이아웃) | Tips, banners, help display (팁, 배너, 도움말 노출) |
| **Basic-A-2-L** | Left Submenu Layout (좌측 서브메뉴 레이아웃) | List-detail, settings pages (리스트-상세, 설정 페이지) |

### 1.2 Common Layout Structure (공통 레이아웃 구조)

```
+-------------------------------------------------------------+
|                         Header (64px)                        |
+---------------+---------------------------------------------+
|               |                                             |
|   Sidebar     |                Content Area                 |
|   (240px)     |                (Flexible / 가변 영역)         |
|               |                                             |
|   Collapsed:  |                                             |
|   (접힌 상태:  |                                             |
|    64px)      |                                             |
+---------------+---------------------------------------------+
```

### 1.3 Common Area Sizes (공통 영역 사이즈)

| Area (영역) | Size (크기) | Note (비고) |
|------|------|------|
| Header height (Header 높이) | 64px | Fixed (고정) |
| Sidebar width - expanded (Sidebar 너비 - 확장) | 240px | Default state (기본 상태) |
| Sidebar width - collapsed (Sidebar 너비 - 접힘) | 64px | Icons only (아이콘만 표시) |
| Content min width (Content 최소 너비) | 320px | Mobile support (모바일 대응) |
| Content max width (Content 최대 너비) | 1440px | Large monitor support (대형 모니터 대응) |
| Content padding (Content 패딩) | 24px | Inner spacing (내부 여백) |

---

## 2. Layout Type Definitions (레이아웃 타입 정의)

### 2.1 Basic-A-1 (Basic Layout / 기본 레이아웃)

**Usage (용도):** Dashboard, list pages, general content pages (대시보드, 목록 페이지, 일반 콘텐츠 페이지)

- Content width (Content 너비): `calc(100vw - Sidebar width)`
- Content height (Content 높이): `calc(100vh - Header height)`
- Content padding (Content 패딩): `24px (p-6)`

### 2.2 Basic-A-2-R (Right Panel Layout / 우측 패널 레이아웃)

**Usage (용도):** Pages requiring tips, banners, help, or related info display (팁, 배너, 도움말, 관련 정보 노출이 필요한 페이지)

**Right Panel Specification (우측 패널 사양):**

| Property (속성) | Value (값) | Note (비고) |
|------|------|------|
| Width (너비) | 250px | Fixed (고정) |
| Background color (배경색) | `gray-50` | Separates from content (콘텐츠와 구분) |
| Padding (패딩) | 16px | Inner spacing (내부 여백) |
| Hide condition (숨김 조건) | `width < 1000px` | Responsive handling (반응형 처리) |

### 2.3 Basic-A-2-L (Left Submenu Layout / 좌측 서브메뉴 레이아웃)

**Usage (용도):** Settings pages, list-detail structure, category navigation (설정 페이지, 리스트-상세 구조, 카테고리 탐색)

**Left Submenu Specification (좌측 서브메뉴 사양):**

| Property (속성) | Value (값) |
|------|------|
| Default width (기본 너비) | 280px |
| Min width (최소 너비) | 250px |
| Max width (최대 너비) | 300px |
| Background color (배경색) | `white` |
| Right border (우측 보더) | `1px solid gray-200` |

---

## 3. Portal-specific Layouts (포털별 레이아웃) (v2.0 New / v2.0 신규)

### 3.1 User Level Layouts (사용자 레벨별 레이아웃)

Amoeba projects apply **separate layouts** based on user level.
(Amoeba 프로젝트는 사용자 레벨에 따라 **별도 레이아웃**을 적용합니다.)

| Level (레벨) | Layout (레이아웃) | Description (설명) |
|------|---------|------|
| **ADMIN_LEVEL** | AdminLayout | Full sidebar + admin menu (전체 사이드바 + 관리 메뉴) |
| **USER_LEVEL** | UserLayout | Work menu-focused sidebar (업무 메뉴 중심 사이드바) |
| **CLIENT_LEVEL** | ClientLayout | Client portal dedicated - simplified (고객 포털 전용 - 간소화) |
| **PARTNER_LEVEL** | PartnerLayout | Partner portal dedicated (파트너 포털 전용) |

### 3.2 Portal Layout Structure (포털 레이아웃 구조)

**Client Portal (고객 포털) (ClientLayout):**
```
+-------------------------------------------------------------+
|   Header (64px) - Logo + Corp Select + Notifications + Profile |
|                   (로고 + 법인 선택 + 알림 + 프로필)             |
+-------------------------------------------------------------+
|                                                             |
|   Content Area (Full Width)                                 |
|   - No sidebar (Tab navigation)                             |
|     (사이드바 없음 - 탭 네비게이션)                              |
|   - Max width: 1200px (최대 너비: 1200px)                    |
|   - Center aligned (중앙 정렬)                               |
|                                                             |
+-------------------------------------------------------------+
```

**Partner Portal (파트너 포털) (PartnerLayout):**
```
+-------------------------------------------------------------+
|   Header (64px) - Partner Logo + App Select + Profile        |
|                   (파트너 로고 + 앱 선택 + 프로필)               |
+----------+--------------------------------------------------+
|  Side    |                                                  |
|  Menu    |   Content Area                                   |
|  (220px) |   - App management menu (앱 관리 메뉴)              |
|          |   - My Apps / Marketplace (내 앱 / 마켓플레이스)      |
|          |                                                  |
+----------+--------------------------------------------------+
```

### 3.3 Auth Layout (인증 레이아웃)

Login/registration and other auth pages use **AuthLayout**.
(로그인/회원가입 등 인증 페이지는 **AuthLayout** 사용.)

```
+-------------------------------------------------------------+
|                                                             |
|   ┌─────────────────────────────────────────┐               |
|   │          Login / Register Card          │               |
|   │          max-w-md mx-auto              │               |
|   │          bg-white rounded-xl           │               |
|   │          shadow-lg p-8                 │               |
|   └─────────────────────────────────────────┘               |
|                                                             |
|   Background: gradient or background image                  |
|   (배경: gradient 또는 배경 이미지)                              |
+-------------------------------------------------------------+
```

---

## 4. Icon System (아이콘 시스템)

### 4.1 Icon Style Rules (아이콘 스타일 규칙)

| Property (속성) | Value (값) |
|------|------|
| Type (타입) | Monochrome outline SVG (단색 아웃라인 SVG - Outline / Stroke) |
| Stroke width (선 두께) | 1.5px ~ 2px |
| Default size (기본 크기) | 24x24px |
| Color (컬러) | `currentColor` (Inherits parent color / 부모 요소 색상 상속) |
| Library (라이브러리) | **Lucide** (Recommended / 권장) - React: `lucide-react` / Vue: `lucide-vue-next` |

### 4.2 Icon Size Scale (아이콘 사이즈 체계)

| Size (사이즈) | Pixels (픽셀) | Tailwind | Usage (용도) |
|--------|------|----------|------|
| `xs` | 16px | `w-4 h-4` | Inline text, badges (인라인 텍스트, 뱃지) |
| `sm` | 20px | `w-5 h-5` | Button icons, inputs (버튼 내 아이콘, 인풋) |
| `md` | 24px | `w-6 h-6` | Default icons, menus (기본 아이콘, 메뉴) |
| `lg` | 32px | `w-8 h-8` | Card headers, emphasis (카드 헤더, 강조) |
| `xl` | 48px | `w-12 h-12` | Empty states, illustrations (빈 상태, 일러스트) |

### 4.3 Icon Category Mapping (아이콘 카테고리 매핑)

```typescript
// Menu Icons (메뉴 아이콘)
MenuIcons = { dashboard, users, campaigns, contents, settlements, reports, settings }

// Action Icons (액션 아이콘)
ActionIcons = { add, edit, delete, view, download, upload, filter, close, check }

// Status Icons (상태 아이콘)
StatusIcons = { warning, info, help }

// UI Icons (UI 아이콘)
UIIcons = { menu, search, bell, chevronDown, chevronRight, user, globe, logout }

// Communication Icons (커뮤니케이션 아이콘) (v2.0 New / v2.0 추가)
CommIcons = { messageSquare, send, paperclip, smile, mic, phone, video }
```

---

## 5. Color System (컬러 시스템)

### 5.1 Brand Colors (브랜드 컬러)

| Name (이름) | Hex | Tailwind | Usage (용도) |
|------|-----|----------|------|
| Primary (기본) | `#6366F1` | `primary-500` | Main actions, brand (주요 액션, 브랜드) |
| Primary Light (밝은) | `#818CF8` | `primary-400` | Hover state (호버 상태) |
| Primary Dark (어두운) | `#4F46E5` | `primary-600` | Active state (액티브 상태) |

### 5.2 Semantic Colors (시맨틱 컬러)

| Name (이름) | Hex | Usage (용도) |
|------|-----|------|
| Success (성공) | `#10B981` | Success, completion (성공, 완료) |
| Warning (경고) | `#F59E0B` | Warning, caution (경고, 주의) |
| Error (에러) | `#EF4444` | Error, deletion (에러, 삭제) |
| Info (정보) | `#3B82F6` | Information, guidance (정보, 안내) |

### 5.3 Grayscale (그레이스케일)

| Name (이름) | Hex | Usage (용도) |
|------|-----|------|
| Gray 50 | `#F9FAFB` | Background - light (배경 - 밝음) |
| Gray 100 | `#F3F4F6` | Background - default (배경 - 기본) |
| Gray 200 | `#E5E7EB` | Borders, dividers (보더, 구분선) |
| Gray 300 | `#D1D5DB` | Inactive borders (비활성 보더) |
| Gray 400 | `#9CA3AF` | Placeholders (플레이스홀더) |
| Gray 500 | `#6B7280` | Secondary text (보조 텍스트) |
| Gray 600 | `#4B5563` | Body text (본문 텍스트) |
| Gray 700 | `#374151` | Emphasized text (강조 텍스트) |
| Gray 800 | `#1F2937` | Heading text (제목 텍스트) |
| Gray 900 | `#111827` | Maximum emphasis text (최강조 텍스트) |

### 5.4 Domain-specific Colors (도메인 고유 컬러) (v2.0 New / v2.0 신규)

| Domain (도메인) | Accent Color (대표 컬러) | Usage (용도) |
|--------|----------|------|
| Business Management (경영관리) | Indigo `#6366F1` | Dashboard, main (대시보드, 메인) |
| HR (인사) | Teal `#14B8A6` | HR module emphasis (HR 모듈 강조) |
| Project (프로젝트) | Blue `#3B82F6` | Project management (프로젝트 관리) |
| Sales/Billing (영업/Billing) | Amber `#F59E0B` | Revenue, billing (매출, 청구) |
| Accounting (회계) | Green `#10B981` | Accounting ledger (회계 장부) |
| Chat/Talk (채팅/Talk) | Purple `#8B5CF6` | Messaging (메시징) |
| AI Agent (AI 에이전트) | Violet `#7C3AED` | AI features (AI 기능) |

### 5.5 Tailwind Configuration (Tailwind 설정)

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE',
          300: '#A5B4FC', 400: '#818CF8', 500: '#6366F1',
          600: '#4F46E5', 700: '#4338CA', 800: '#3730A3', 900: '#312E81',
        },
      },
    },
  },
};
```

---

## 6. Typography (타이포그래피)

### 6.1 Font Family (폰트 패밀리)

```css
font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI',
             Roboto, 'Helvetica Neue', Arial, sans-serif;
```

### 6.2 Font Size Scale (폰트 사이즈 체계)

| Name (이름) | Size (사이즈) | Line Height | Usage (용도) |
|------|--------|-------------|------|
| `text-xs` | 12px | 16px | Captions, badges (캡션, 뱃지) |
| `text-sm` | 14px | 20px | Secondary text, buttons (보조 텍스트, 버튼) |
| `text-base` | 16px | 24px | Body text (본문) |
| `text-lg` | 18px | 28px | Subheading (소제목) |
| `text-xl` | 20px | 28px | Heading (제목) |
| `text-2xl` | 24px | 32px | Page title (페이지 제목) |
| `text-3xl` | 30px | 36px | Large heading (대제목) |

### 6.3 Font Weight (폰트 웨이트)

| Name (이름) | Value (값) | Usage (용도) |
|------|------|------|
| `font-normal` | 400 | Body text (본문) |
| `font-medium` | 500 | Emphasized body (강조 본문) |
| `font-semibold` | 600 | Headings, buttons (제목, 버튼) |
| `font-bold` | 700 | Large headings (대제목) |

### 6.4 Multilingual Font Considerations (다국어 폰트 고려) (v2.0 New / v2.0 신규)

| Language (언어) | Fallback Font (Fallback 폰트) | Note (비고) |
|------|--------------|------|
| Korean / 한국어 (ko) | Pretendard (Default / 기본) | WOFF2 serving (WOFF2 서빙) |
| English / 영어 (en) | Pretendard | Latin glyphs included (라틴 글리프 포함) |
| Vietnamese / 베트남어 (vi) | Pretendard | Must verify Vietnamese diacritics support (베트남어 다이어크리틱 지원 확인 필수) |

> **Note (주의):** Verify that Vietnamese fonts render correctly. If Pretendard does not support certain glyphs, add fallbacks such as `'Inter', 'Noto Sans'`.
> (베트남어 폰트가 올바르게 렌더링되는지 반드시 확인. Pretendard가 지원하지 않는 글리프가 있으면 `'Inter', 'Noto Sans'` 등 fallback 추가.)

---

## 7. Component Styles (컴포넌트 스타일)

### 7.1 Button (버튼)

```
Variants: primary, secondary, outline, ghost, danger
Sizes: sm (h-8), md (h-10), lg (h-12)
Border Radius: rounded-lg (8px)
```

| Variant | Style (스타일) |
|---------|--------|
| primary | `bg-primary-500 text-white hover:bg-primary-600` |
| secondary | `bg-gray-100 text-gray-700 hover:bg-gray-200` |
| outline | `border border-gray-300 text-gray-700 hover:bg-gray-50` |
| ghost | `text-gray-600 hover:bg-gray-100` |
| danger | `bg-red-500 text-white hover:bg-red-600` |

### 7.2 Input (인풋)

```
Height (높이): h-10 (40px)
Padding (패딩): px-3
Border (보더): border border-gray-300 rounded-lg
Focus (포커스): focus:ring-2 focus:ring-primary-500
Disabled (비활성): disabled:bg-gray-100
```

### 7.3 Card (카드)

| Type (유형) | Style (스타일) |
|------|--------|
| base | `bg-white rounded-lg border border-gray-200` |
| shadow | `bg-white rounded-lg shadow-sm` |
| interactive | `bg-white rounded-lg border hover:shadow-md transition-shadow` |

### 7.4 Modal (모달)

```
Background (배경): bg-black/50 (overlay)
Card (카드): bg-white rounded-xl shadow-lg max-w-md
Padding (패딩): p-6
Animation (애니메이션): fade-in + scale
```

### 7.5 Table (테이블)

```
Header (헤더): bg-gray-50 text-sm font-medium text-gray-600
Cell padding (셀 패딩): px-3 py-2
Border (보더): divide-y divide-gray-100
Hover (호버): hover:bg-gray-50
```

### 7.6 Badge / Tag (뱃지/태그) (v2.0 New / v2.0 신규)

| Status (상태) | Style (스타일) |
|------|--------|
| Active | `bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full` |
| Pending | `bg-yellow-100 text-yellow-800 ...` |
| Draft | `bg-gray-100 text-gray-600 ...` |
| Error | `bg-red-100 text-red-800 ...` |

### 7.7 Tab Navigation (탭 네비게이션) (v2.0 New / v2.0 신규)

```
Default (기본): text-gray-500 hover:text-gray-700 border-b-2 border-transparent
Active (활성): text-primary-600 border-primary-500 font-medium
Container (컨테이너): border-b border-gray-200
```

---

## 8. Chat UI Patterns (채팅 UI 패턴) (v2.0 New / v2.0 신규)

### 8.1 Chat Layout (채팅 레이아웃) (Amoeba Talk)

```
+------------------+------------------------------------------+
| Channel List     |  Chat Area (채팅 영역)                      |
| (채널 목록 280px) |  ┌──────────────────────────────────┐    |
|                  |  │ Message List (메시지 리스트 - scroll)│    |
|  #general        |  │                                    │    |
|  #project        |  │  ┌─────────────────────────┐      │    |
|  @DM             |  │  │ Bubble - left: other     │      │    |
|                  |  │  │ (좌: 상대 메시지 버블)      │      │    |
|                  |  │  └─────────────────────────┘      │    |
|                  |  │       ┌─────────────────────┐     │    |
|                  |  │       │ Bubble - right: me   │     │    |
|                  |  │       │ (우: 내 메시지 버블)    │     │    |
|                  |  │       └─────────────────────┘     │    |
|                  |  └──────────────────────────────────┘    |
|                  |  ┌──────────────────────────────────┐    |
|                  |  │ Input Area (입력 영역)              │    |
|                  |  │ (Attach + Text + Send)            │    |
|                  |  │ (파일첨부 + 텍스트 + 전송)           │    |
|                  |  └──────────────────────────────────┘    |
+------------------+------------------------------------------+
```

### 8.2 Message Bubble Styles (메시지 버블 스타일)

| Element (요소) | My Message - right (내 메시지 - 우측) | Other's Message - left (상대 메시지 - 좌측) |
|------|----------------|-------------------|
| Background (배경색) | `bg-primary-500` | `bg-gray-100` |
| Text (텍스트) | `text-white` | `text-gray-800` |
| Border radius (모서리) | `rounded-lg rounded-br-none` | `rounded-lg rounded-bl-none` |
| Max width (최대 너비) | `max-w-[70%]` | `max-w-[70%]` |
| Padding (패딩) | `px-4 py-2` | `px-4 py-2` |

### 8.3 Chat Elements (채팅 요소)

| Element (요소) | Style (스타일) |
|------|--------|
| Timestamp (시간 표시) | `text-xs text-gray-400 mt-1` |
| Date divider (날짜 구분선) | `text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full mx-auto` |
| Read receipt (읽음 표시) | Check icon `w-3 h-3 text-primary-400` (체크 아이콘) |
| File attachment (파일 첨부) | Card style `border rounded-lg p-3 max-w-xs` (카드 형태) |
| Emoji reaction (이모지 리액션) | `bg-gray-50 rounded-full px-2 py-0.5 text-sm` |
| Untranslated badge (미번역 뱃지) | `text-xs text-blue-500 cursor-pointer` (Click to translate / 클릭 시 번역) |

---

## 9. AI Streaming UI Patterns (AI 스트리밍 UI 패턴) (v2.0 New / v2.0 신규)

### 9.1 AI Conversation Interface (AI 대화 인터페이스)

```
┌─────────────────────────────────────┐
│  AI Agent Header                    │
│  [Agent Name] [Cell Badge] [Lang]   │
│  [에이전트명] [셀 뱃지] [언어]         │
├─────────────────────────────────────┤
│                                     │
│  ┌─ AI ─────────────────────────┐   │
│  │ Streaming text...            │   │
│  │ (스트리밍 텍스트...)            │   │
│  │ █ (Cursor blink / 커서 깜박임) │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌─ User ───────────────────────┐   │
│  │ User question (사용자 질문)    │   │
│  └──────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  [📎] [Input text... / 입력...] [▶] │
└─────────────────────────────────────┘
```

### 9.2 Streaming Response UI (스트리밍 응답 UI)

| Element (요소) | Style (스타일) |
|------|--------|
| AI message background (AI 메시지 배경) | `bg-gray-50 rounded-lg p-4` |
| Streaming cursor (스트리밍 커서) | `animate-pulse w-2 h-5 bg-gray-400 inline-block` |
| Markdown rendering (마크다운 렌더링) | prose class applied / prose 클래스 적용 (`prose prose-sm max-w-none`) |
| Code block (코드 블록) | `bg-gray-900 text-gray-100 rounded-md p-4 font-mono text-sm` |
| Loading indicator (로딩 인디케이터) | 3-dot bounce animation / 3점 바운스 애니메이션 (`animate-bounce`) |
| Error state (에러 상태) | `bg-red-50 border border-red-200 text-red-700 rounded-lg p-3` |
| Quota exceeded (쿼터 초과) | `bg-yellow-50 border border-yellow-200 text-yellow-700` |

### 9.3 AI Token Usage Display (AI 토큰 사용량 표시)

```
┌─ AI Usage (AI 사용량) ──────────────┐
│ Daily (일간): ████████░░ 80% (8,000/10,000) │
│ Monthly (월간): ███░░░░░░░ 30% (30K/100K)   │
└─────────────────────────────────────┘
```

| Usage Rate (사용률) | Progress Bar Color (프로그레스 바 컬러) |
|--------|------------------|
| 0~60% | `bg-green-500` |
| 60~85% | `bg-yellow-500` |
| 85~100% | `bg-red-500` |

---

## 10. Responsive Breakpoints (반응형 브레이크포인트)

### 10.1 Breakpoint Definitions (브레이크포인트 정의)

| Name (이름) | Min Width (최소 너비) | Usage (용도) |
|------|----------|------|
| `sm` | 640px | Mobile landscape (모바일 가로) |
| `md` | 768px | Tablet (태블릿) |
| `lg` | 1024px | Small desktop (작은 데스크탑) |
| `xl` | 1280px | Desktop (데스크탑) |
| `2xl` | 1536px | Large monitor (대형 모니터) |

### 10.2 Responsive Behavior by Layout (레이아웃별 반응형 동작)

| Breakpoint (브레이크포인트) | Sidebar | R Panel | L Panel | Chat Panel |
|---------------|---------|---------|---------|------------|
| `< 768px` | Hidden - hamburger (숨김 - 햄버거) | Hidden (숨김) | Hidden - tab switch (숨김 - 탭 전환) | Channel list hidden (채널 목록 숨김) |
| `768px ~ 1000px` | Collapsed - 64px (접힘 - 64px) | Hidden (숨김) | Visible (표시) | Channel list collapsed (채널 목록 접힘) |
| `>= 1000px` | Expanded - 240px (확장 - 240px) | Visible - 250px (표시 - 250px) | Visible (표시) | Full display (전체 표시) |

---

## 11. Spacing System (스페이싱 시스템)

### 11.1 Spacing Scale (스페이싱 스케일)

| Name (이름) | Value (값) | Tailwind | Usage (용도) |
|------|------|----------|------|
| 1 | 4px | `space-1` | Minimum gap (최소 간격) |
| 2 | 8px | `space-2` | Inside elements (요소 내부) |
| 3 | 12px | `space-3` | Related elements (관련 요소) |
| 4 | 16px | `space-4` | Default gap (기본 간격) |
| 5 | 20px | `space-5` | Inside sections (섹션 내부) |
| 6 | 24px | `space-6` | Section gap (섹션 간격) |
| 8 | 32px | `space-8` | Large section (큰 섹션) |
| 10 | 40px | `space-10` | Page section (페이지 섹션) |
| 12 | 48px | `space-12` | Large gap (대형 간격) |

### 11.2 Layout Spacing (레이아웃 스페이싱)

| Area (영역) | Padding/Margin (패딩/마진) | Tailwind |
|------|----------|----------|
| Page content (페이지 콘텐츠) | 24px | `p-6` |
| Card inner (카드 내부) | 16px ~ 24px | `p-4` ~ `p-6` |
| Section gap (섹션 간격) | 24px ~ 32px | `space-y-6` ~ `space-y-8` |
| Element gap (요소 간격) | 8px ~ 16px | `gap-2` ~ `gap-4` |

---

## 12. Notifications and Toasts (알림 및 토스트) (v2.0 New / v2.0 신규)

### 12.1 Toast Notifications (토스트 알림)

| Type (타입) | Background (배경) | Icon (아이콘) | Position (위치) |
|------|------|--------|------|
| Success | `bg-green-50 border-green-500` | CheckCircle (green) | top-right |
| Error | `bg-red-50 border-red-500` | XCircle (red) | top-right |
| Warning | `bg-yellow-50 border-yellow-500` | AlertTriangle (yellow) | top-right |
| Info | `bg-blue-50 border-blue-500` | Info (blue) | top-right |

```
Style (스타일): border-l-4, shadow-lg, rounded-r-lg, p-4
Duration (지속시간): 3~5s (Error: 5s, Others: 3s / 에러: 5초, 기타: 3초)
Animation (애니메이션): slide-in-right + fade-out
Max display (최대 표시): 3 (Oldest auto-removed when exceeded / 초과 시 오래된 것 자동 제거)
```

### 12.2 Real-time Notifications via SSE (실시간 알림 - SSE)

| Notification Type (알림 유형) | UI Pattern (UI 패턴) |
|----------|---------|
| Chat new message (채팅 새 메시지) | Badge counter + Browser Notification (뱃지 카운터 + 브라우저 Notification) |
| AI task complete (AI 작업 완료) | Toast (Success) (토스트 - Success) |
| Approval request (승인 요청) | Toast (Info) + Bell icon badge (토스트 - Info + 벨 아이콘 뱃지) |
| Error notification (에러 알림) | Toast (Error) (토스트 - Error) |

---

## 13. Web Accessibility Standards (웹 접근성 기준)

### 13.1 Core Principles (기본 원칙)

- All core UI must be operable with keyboard only. (모든 핵심 UI는 키보드만으로 조작 가능해야 합니다.)
- Status must not be conveyed by color alone. (색상만으로 상태를 전달하지 않습니다.)
- Focus order must match the visual layout order. (포커스 이동 순서는 시각적 배치 순서와 일치해야 합니다.)

### 13.2 Text/Color Contrast (텍스트/컬러 대비) (WCAG 2.1 AA)

| Category (구분) | Minimum Contrast Ratio (최소 대비비) |
|------|-------------|
| Normal body text (일반 본문 텍스트) | 4.5:1 or higher (4.5:1 이상) |
| Large text (18px+ or 14px Bold+) (큰 텍스트) | 3:1 or higher (3:1 이상) |
| UI boundaries/icons (UI 경계/아이콘) | 3:1 or higher (3:1 이상) |

### 13.3 Focus Visible (포커스 표시)

- All interactive elements must provide focus styles. (인터랙션 가능한 모든 요소는 포커스 스타일을 제공해야 합니다.)
- Default focus style (기본 포커스 스타일): `focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`

### 13.4 Touch Targets (터치 타겟)

| Item (항목) | Minimum Size (최소 크기) | Recommended Size (권장 크기) |
|------|-----------|-----------|
| Button / Icon button (버튼/아이콘 버튼) | 24x24px | 40x40px or larger (40x40px 이상) |
| Touch interactive elements (터치 인터랙션 요소) | 32x32px | 44x44px or larger (44x44px 이상) |

### 13.5 Component Checklist (컴포넌트 체크리스트)

- Button (버튼): Provide `aria-label` for icon-only buttons (아이콘 전용 버튼에 `aria-label` 제공)
- Modal (모달): `role="dialog"`, `aria-modal="true"`, support `Esc` to close (`Esc` 닫기 지원)
- Table (테이블): Specify `th/scope`, convey sort state via text or `aria-sort` (정렬 상태는 텍스트 또는 `aria-sort`로 전달)
- Chat (채팅): Messages with `role="log"`, new messages `aria-live="polite"` (v2.0 New / v2.0 추가)
- Streaming (스트리밍): AI streaming responses with `aria-busy="true"` + `aria-live="polite"` (v2.0 New / v2.0 추가)

---

## Document History (문서 이력)

| Version (버전) | Date (일자) | Author (작성자) | Changes (변경 내용) |
|------|------|--------|-----------|
| v1.0 | 2026-02-12 | Amoeba Company | Initial creation - Layout, icon, color, typography, component standards (최초 작성 - 레이아웃, 아이콘, 컬러, 타이포그래피, 컴포넌트 표준) |
| v1.1 | 2026-02-12 | Amoeba Company | React + Vue.js dual framework icon library support (React + Vue.js 듀얼 프레임워크 아이콘 라이브러리 반영) |
| v1.2 | 2026-02-13 | Amoeba Company | Web accessibility standards (WCAG 2.1 AA) section added (웹 접근성 기준 섹션 신설) |
| **v2.0** | **2026-03-23** | **Amoeba Company** | **AMB project best practices: Portal-specific layouts (Admin/User/Client/Partner), Chat UI patterns (Amoeba Talk message bubbles/channel list), AI Streaming UI (cursor/markdown/token usage), Domain-specific colors, Badge/Tag components, Tab navigation, Toast notifications (SSE real-time), Multilingual fonts (vi added), Chat/Streaming accessibility (AMB 프로젝트 베스트 프랙티스: 포털별 레이아웃, 채팅 UI 패턴, AI 스트리밍 UI, 도메인 고유 컬러, 뱃지/태그 컴포넌트, 탭 네비게이션, 토스트 알림, 다국어 폰트, 채팅/스트리밍 접근성)** |