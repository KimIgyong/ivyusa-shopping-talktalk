import type { Translation } from './en';

export const ko: Translation = {
  appName: 'IVY USA',
  notificationCenter: '알림 센터',
  settings: '설정',

  tab: {
    notifications: '알림',
    chat: '채팅',
    orders: '주문',
  },

  notifications: {
    empty: '아직 알림이 없습니다.',
    filters: {
      all: '전체',
      payment: '결제',
      shipping: '배송',
      event: '이벤트',
      review: '리뷰',
    },
  },

  chat: {
    welcome:
      '안녕하세요! IVY USA에 오신 것을 환영합니다. 무엇을 도와드릴까요? 아래에서 주제를 선택하거나 궁금한 점을 입력해 주세요.',
    aiDisclosure:
      '이 채팅은 AI 기반으로 운영됩니다. 보내신 메시지는 응답 생성을 위해 미국에 있는 외부 AI 서비스 제공업체에서 처리됩니다.',
    inputPlaceholder: '메시지를 입력하세요…',
    send: '보내기',
    connectAgent: '상담원 연결',
    consent: {
      title: '개인정보 처리 안내',
      body: 'CCPA에 따라 상담 제공을 위해 고객님의 메시지를 처리합니다. 계속 진행하는 데 동의하시겠습니까?',
      accept: '동의',
      decline: '거부',
    },
    scenarios: {
      delivery: '배송 조회',
      cancelRefund: '취소 / 환불',
      productHelp: '제품 도움말',
      contact: '고객 지원 문의',
      affiliate: '제휴',
      myOrders: '내 주문',
    },
    productHelp: {
      usage: '사용법',
      ingredients: '성분',
      exchange: '교환 · 반품',
      restock: '재입고 알림',
      back: '뒤로',
    },
    templates: {
      cancelRefund: '주문을 취소하거나 환불을 요청하고 싶습니다.',
      usage: '이 제품은 어떻게 사용하나요?',
      ingredients: '이 제품의 성분은 무엇인가요?',
      exchange: '상품을 교환하거나 반품하고 싶습니다.',
      restock: '이 제품이 재입고되면 알려 주세요.',
    },
  },

  auth: {
    title: '본인 인증',
    body: '이 정보를 확인하려면 로그인하거나 비회원 주문을 조회해 주세요.',
    signIn: '로그인',
    guestLookup: '비회원 주문 조회',
    orderNumber: '주문 번호',
    email: '이메일',
    submit: '주문 조회',
    cancel: '취소',
  },

  contact: {
    title: '고객 지원 문의',
    phone: '1588-0000',
    hours: '월–금 10:00–18:00',
    email: 'help@ivy.com',
    chatAgent: '상담원과 채팅',
  },

  affiliate: {
    title: '제휴 프로그램',
    steps: [
      '프로그램 참여 신청',
      '심사는 영업일 기준 1~3일 소요',
      '추천 시 10% 수수료 지급',
    ],
    apply: '지금 신청',
    pending: '신청서가 심사 중입니다.',
    approved: '제휴가 승인되었습니다!',
  },

  orders: {
    subtabs: {
      payments: '결제',
      shipping: '배송',
      inquiries: '문의',
    },
    empty: '주문 내역이 없습니다.',
    ask: '이 주문에 대해 문의하기',
    track: '배송 조회',
    detail: '주문 상세',
    items: '상품',
    total: '합계',
    writeReview: '리뷰 작성',
    back: '뒤로',
  },

  review: {
    title: '리뷰 작성',
    rating: '평점',
    placeholder: '이용 경험을 들려주세요…',
    submit: '리뷰 등록',
    thanks: '리뷰를 남겨 주셔서 감사합니다!',
    stars_one: '별 {{count}}개',
    stars_other: '별 {{count}}개',
  },

  prefs: {
    title: '알림 설정',
    channels: {
      in_app: '앱 내',
      email: '이메일',
      sms: 'SMS',
      web_push: '웹 푸시',
    },
    categories: {
      payment: '결제',
      shipping: '배송',
      event: '이벤트',
      review: '리뷰',
    },
    alwaysOn: '항상 켜짐',
    ccpa: 'CCPA: 내 개인정보를 판매하거나 공유하지 않음',
  },

  privacy: {
    title: '개인정보 및 내 데이터',
    optOutHint: '계정의 이메일, SMS, 웹 푸시 메시지를 끕니다. 앱 내 알림은 유지됩니다.',
    export: '내 데이터 다운로드 (JSON)',
    exporting: '내보내기를 준비하는 중…',
    delete: '내 데이터 삭제',
    deleteConfirm: '한 번 더 클릭하면 확정됩니다 — 되돌릴 수 없습니다',
    deleteDone: '개인정보가 익명화되었습니다.',
    needVerified: '먼저 스토어 계정으로 로그인해 주세요 — 이 작업은 본인 확인이 필요합니다.',
  },

  common: {
    loading: '불러오는 중…',
    error: '문제가 발생했습니다.',
    retry: '다시 시도',
  },

  a11y: {
    supportWidget: '고객 지원 위젯',
    openSupport: '고객 지원 열기',
    closeSupport: '고객 지원 닫기',
    close: '닫기',
    messageThread: '메시지 목록',
    verifyIdentity: '본인 인증',
    privacyNotice: '개인정보 처리 안내',
  },
};
