/**
 * Customer-facing status notices per issue transition (PLN-260809-Issue-Workflow-P3,
 * REQ §5.4). Localized by the SESSION language; rejection wording is per reason
 * code (결정 3). `#N` = tenant-local issue number.
 */

import type { SessionLanguage } from '@ivy/types';

export type NoticeLang = SessionLanguage;

const TITLES: Record<NoticeLang, string> = {
  EN: 'Inquiry #{n}',
  ES: 'Consulta #{n}',
  KO: '문의 #{n}',
  VI: 'Yêu cầu #{n}',
  JA: 'お問い合わせ #{n}',
  ZH: '咨询 #{n}',
};

const BODIES: Record<NoticeLang, Record<string, string>> = {
  EN: {
    received: 'Your inquiry has been received (#{n}). We are looking into it.',
    in_progress: 'An agent has been assigned and is working on your inquiry (#{n}).',
    resolved: 'Your inquiry has been resolved (#{n}).',
    rejected_policy_impossible:
      'We are sorry — this request cannot be fulfilled under our policy (#{n}). Please reply in chat if you would like to discuss alternatives.',
    rejected_misrouted:
      'Your inquiry (#{n}) was routed incorrectly. Please start a new chat so we can direct it to the right team.',
    rejected_spam: 'Your inquiry (#{n}) has been closed.',
    closed: 'Your inquiry has been completed (#{n}). Thank you.',
    reopened: 'We are taking another look at your inquiry (#{n}).',
    external_closed: 'Your support ticket has been resolved. Thank you for your patience.',
  },
  ES: {
    received: 'Hemos recibido tu consulta (#{n}). La estamos revisando.',
    in_progress: 'Un agente ha sido asignado y está atendiendo tu consulta (#{n}).',
    resolved: 'Tu consulta ha sido resuelta (#{n}).',
    rejected_policy_impossible:
      'Lo sentimos — esta solicitud no es posible según nuestra política (#{n}). Escríbenos por chat si deseas ver alternativas.',
    rejected_misrouted:
      'Tu consulta (#{n}) fue clasificada incorrectamente. Inicia un nuevo chat para dirigirla al equipo correcto.',
    rejected_spam: 'Tu consulta (#{n}) ha sido cerrada.',
    closed: 'Tu consulta ha sido completada (#{n}). Gracias.',
    reopened: 'Estamos revisando de nuevo tu consulta (#{n}).',
    external_closed: 'Tu ticket de soporte ha sido resuelto. Gracias por tu paciencia.',
  },
  KO: {
    received: '문의가 접수되었습니다 (#{n}). 확인 중입니다.',
    in_progress: '담당자가 배정되어 처리 중입니다 (#{n}).',
    resolved: '문의가 해결되었습니다 (#{n}).',
    rejected_policy_impossible:
      '죄송합니다. 해당 요청은 정책상 처리가 어렵습니다 (#{n}). 대안이 필요하시면 채팅으로 말씀해 주세요.',
    rejected_misrouted:
      '문의(#{n})가 잘못 분류되어 반려되었습니다. 새 채팅으로 다시 문의해 주시면 올바른 담당팀으로 안내해 드리겠습니다.',
    rejected_spam: '문의(#{n})가 종료 처리되었습니다.',
    closed: '문의 처리가 완료되었습니다 (#{n}). 감사합니다.',
    reopened: '문의(#{n})를 다시 확인하고 있습니다.',
    external_closed: '문의 티켓이 처리 완료되었습니다. 기다려 주셔서 감사합니다.',
  },
  VI: {
    received: 'Chúng tôi đã nhận được yêu cầu của bạn (#{n}) và đang xem xét.',
    in_progress: 'Một nhân viên đã được phân công và đang xử lý yêu cầu của bạn (#{n}).',
    resolved: 'Yêu cầu của bạn đã được giải quyết (#{n}).',
    rejected_policy_impossible:
      'Rất tiếc — yêu cầu này không thể thực hiện theo chính sách của chúng tôi (#{n}). Bạn hãy trả lời trong khung chat nếu muốn trao đổi phương án khác.',
    rejected_misrouted:
      'Yêu cầu của bạn (#{n}) đã được chuyển sai bộ phận. Vui lòng bắt đầu cuộc trò chuyện mới để chúng tôi chuyển tới đúng nhóm phụ trách.',
    rejected_spam: 'Yêu cầu của bạn (#{n}) đã được đóng.',
    closed: 'Yêu cầu của bạn đã hoàn tất (#{n}). Cảm ơn bạn.',
    reopened: 'Chúng tôi đang xem xét lại yêu cầu của bạn (#{n}).',
    external_closed: 'Phiếu hỗ trợ của bạn đã được xử lý xong. Cảm ơn bạn đã kiên nhẫn chờ đợi.',
  },
  JA: {
    received: 'お問い合わせを受け付けました（#{n}）。ただいま確認しております。',
    in_progress: '担当者を割り当て、お問い合わせ（#{n}）を対応中です。',
    resolved: 'お問い合わせ（#{n}）が解決しました。',
    rejected_policy_impossible:
      '申し訳ございません。こちらのご要望は当社の規定上お受けできません（#{n}）。代替案をご希望の場合は、チャットにてお知らせください。',
    rejected_misrouted:
      'お問い合わせ（#{n}）の振り分けが正しくありませんでした。適切な担当チームにおつなぎしますので、新しいチャットを開始してください。',
    rejected_spam: 'お問い合わせ（#{n}）は終了いたしました。',
    closed: 'お問い合わせ（#{n}）の対応が完了しました。ありがとうございました。',
    reopened: 'お問い合わせ（#{n}）を再度確認しております。',
    external_closed: 'サポートチケットの対応が完了しました。お待ちいただきありがとうございました。',
  },
  ZH: {
    received: '我们已收到您的咨询（#{n}），正在处理中。',
    in_progress: '已为您的咨询（#{n}）分配客服人员，正在处理。',
    resolved: '您的咨询（#{n}）已解决。',
    rejected_policy_impossible:
      '很抱歉，根据我们的政策，此请求无法办理（#{n}）。如需了解其他方案，请在聊天中回复我们。',
    rejected_misrouted:
      '您的咨询（#{n}）分类有误。请重新发起对话，以便我们转交给正确的团队。',
    rejected_spam: '您的咨询（#{n}）已关闭。',
    closed: '您的咨询（#{n}）已处理完成，谢谢。',
    reopened: '我们正在重新查看您的咨询（#{n}）。',
    external_closed: '您的支持工单已处理完成。感谢您的耐心等待。',
  },
};

const EXTERNAL_TITLES: Record<NoticeLang, string> = {
  EN: 'Support update',
  ES: 'Actualización de soporte',
  KO: '문의 처리 안내',
  VI: 'Cập nhật hỗ trợ',
  JA: 'サポートからのお知らせ',
  ZH: '客服进度通知',
};

const EXTERNAL_REPLY_BODIES: Record<NoticeLang, string> = {
  EN: 'A support agent has replied — open the chat to read it.',
  ES: 'Un agente de soporte ha respondido — abre el chat para leerlo.',
  KO: '상담원 답변이 도착했습니다. 채팅에서 확인해 주세요.',
  VI: 'Nhân viên hỗ trợ đã trả lời — hãy mở khung chat để xem.',
  JA: 'サポート担当者から返信がありました。チャットを開いてご確認ください。',
  ZH: '客服人员已回复，请打开聊天查看。',
};

/** Session language → notice language, defaulting to English for anything else. */
function noticeLang(language: string | null | undefined): NoticeLang {
  const key = String(language ?? '').toUpperCase() as NoticeLang;
  return key in BODIES ? key : 'EN';
}

/** L3 relay notice (백로그 B1): an external agent reply landed in the widget thread. */
export function externalReplyNotice(language: string | null | undefined): { title: string; body: string } {
  const lang = noticeLang(language);
  return { title: EXTERNAL_TITLES[lang], body: EXTERNAL_REPLY_BODIES[lang] };
}

/** Bridge-mode notice (no local issue number — the ticket lives in Gorgias). */
export function externalNotice(language: string | null | undefined): { title: string; body: string } {
  const lang = noticeLang(language);
  return { title: EXTERNAL_TITLES[lang], body: BODIES[lang].external_closed };
}

export function issueNotice(
  language: string | null | undefined,
  key: string,
  issueNo: number,
): { title: string; body: string } | null {
  const lang = noticeLang(language);
  const body = BODIES[lang][key];
  if (!body) return null;
  const n = String(issueNo);
  return { title: TITLES[lang].split('{n}').join(n), body: body.split('{n}').join(n) };
}
