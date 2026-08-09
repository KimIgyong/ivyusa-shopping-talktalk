/**
 * Customer-facing status notices per issue transition (PLN-260809-Issue-Workflow-P3,
 * REQ §5.4). Localized by the SESSION language; rejection wording is per reason
 * code (결정 3). `#N` = tenant-local issue number.
 */

export type NoticeLang = 'EN' | 'ES' | 'KO';

const TITLES: Record<NoticeLang, string> = {
  EN: 'Inquiry #{n}',
  ES: 'Consulta #{n}',
  KO: '문의 #{n}',
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
};

const EXTERNAL_TITLES: Record<NoticeLang, string> = {
  EN: 'Support update',
  ES: 'Actualización de soporte',
  KO: '문의 처리 안내',
};

const EXTERNAL_REPLY_BODIES: Record<NoticeLang, string> = {
  EN: 'A support agent has replied — open the chat to read it.',
  ES: 'Un agente de soporte ha respondido — abre el chat para leerlo.',
  KO: '상담원 답변이 도착했습니다. 채팅에서 확인해 주세요.',
};

/** L3 relay notice (백로그 B1): an external agent reply landed in the widget thread. */
export function externalReplyNotice(language: string | null | undefined): { title: string; body: string } {
  const lang = ((language ?? 'EN').toUpperCase() as NoticeLang) in BODIES
    ? ((language ?? 'EN').toUpperCase() as NoticeLang)
    : 'EN';
  return { title: EXTERNAL_TITLES[lang], body: EXTERNAL_REPLY_BODIES[lang] };
}

/** Bridge-mode notice (no local issue number — the ticket lives in Gorgias). */
export function externalNotice(language: string | null | undefined): { title: string; body: string } {
  const lang = ((language ?? 'EN').toUpperCase() as NoticeLang) in BODIES
    ? ((language ?? 'EN').toUpperCase() as NoticeLang)
    : 'EN';
  return { title: EXTERNAL_TITLES[lang], body: BODIES[lang].external_closed };
}

export function issueNotice(
  language: string | null | undefined,
  key: string,
  issueNo: number,
): { title: string; body: string } | null {
  const lang = ((language ?? 'EN').toUpperCase() as NoticeLang) in BODIES
    ? ((language ?? 'EN').toUpperCase() as NoticeLang)
    : 'EN';
  const body = BODIES[lang][key];
  if (!body) return null;
  const n = String(issueNo);
  return { title: TITLES[lang].split('{n}').join(n), body: body.split('{n}').join(n) };
}
