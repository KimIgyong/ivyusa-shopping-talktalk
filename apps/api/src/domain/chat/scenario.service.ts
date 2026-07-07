import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MODERATION_DECISION, SENDER_TYPE } from '@ivy/types';
import { Message } from './entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { ChatService } from './chat.service';
import { ModerationService } from '../moderation/moderation.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

export interface ScenarioFollowUp {
  id: string;
  label: string;
}

export interface ScenarioTurnResult {
  conversationId: number;
  reply: { senderType: string; body: string };
  followUps: ScenarioFollowUp[];
}

type Lang = 'EN' | 'ES' | 'KO';

interface ScenarioScript {
  /** Echoed into the thread as the user's utterance for the pressed button. */
  utterance: Record<Lang, string>;
  reply: Record<Lang, string>;
  /** Follow-up quick replies; ids are scenario actions or control actions. */
  followUps: Array<{ id: string; label: Record<Lang, string> }>;
}

const FOLLOW_UP_AGENT = {
  id: 'agent_connect',
  label: { EN: 'Talk to an agent', ES: 'Hablar con un agente', KO: '상담원 연결' },
};
const FOLLOW_UP_MY_ORDERS = {
  id: 'my_orders',
  label: { EN: 'View my orders', ES: 'Ver mis pedidos', KO: '내 주문 보기' },
};

/**
 * Deterministic scenario scripts (FR-003 / FR-S1, PLAN-Scenario-Handoff-Alert).
 * Copy is kept consistent with the seeded CS policy KB documents
 * (KB-US-Cosmetics-CS-Policy-Reference-20260707): 30-day window, gently used,
 * cancel-before-preparing, original-payment refunds.
 */
const SCENARIOS: Record<string, ScenarioScript> = {
  cancel_refund: {
    utterance: {
      EN: 'I need help with a cancellation, refund, or return.',
      ES: 'Necesito ayuda con una cancelación, reembolso o devolución.',
      KO: '취소/환불/반품 관련 도움이 필요해요.',
    },
    reply: {
      EN: 'I can help with cancellations, refunds, and returns. What would you like to do?',
      ES: 'Puedo ayudarte con cancelaciones, reembolsos y devoluciones. ¿Qué te gustaría hacer?',
      KO: '취소, 환불, 반품을 도와드릴게요. 어떤 것을 도와드릴까요?',
    },
    followUps: [
      { id: 'cancel_order', label: { EN: 'Cancel an order', ES: 'Cancelar un pedido', KO: '주문 취소' } },
      { id: 'refund_policy', label: { EN: 'Refund policy & timeline', ES: 'Política y plazos de reembolso', KO: '환불 정책·소요기간' } },
      { id: 'return_exchange', label: { EN: 'Return / exchange an item', ES: 'Devolver / cambiar un artículo', KO: '반품·교환' } },
      FOLLOW_UP_AGENT,
    ],
  },
  cancel_order: {
    utterance: {
      EN: 'I would like to cancel my order.',
      ES: 'Quiero cancelar mi pedido.',
      KO: '주문을 취소하고 싶어요.',
    },
    reply: {
      EN: 'Orders can be canceled free of charge before they enter preparing status — usually within about 1 hour of placing the order. Go to Orders, open the order, and tap Cancel. Once an order has shipped it can no longer be canceled; please request a return after delivery instead. Canceled orders are refunded in full to your original payment method.',
      ES: 'Los pedidos se pueden cancelar sin cargo antes de que entren en preparación, normalmente dentro de la primera hora. Ve a Pedidos, abre el pedido y toca Cancelar. Una vez enviado, ya no se puede cancelar; solicita una devolución tras la entrega. Los pedidos cancelados se reembolsan por completo a tu método de pago original.',
      KO: '주문은 상품 준비 단계 진입 전(보통 주문 후 1시간 이내)까지 무료로 취소할 수 있어요. 주문 탭에서 해당 주문을 열어 취소를 눌러 주세요. 이미 출고된 주문은 취소가 불가하며, 수령 후 반품으로 진행해 주세요. 취소된 주문은 원결제 수단으로 전액 환불됩니다.',
    },
    followUps: [FOLLOW_UP_MY_ORDERS, { id: 'refund_policy', label: { EN: 'When will I get my refund?', ES: '¿Cuándo recibiré mi reembolso?', KO: '환불은 언제 되나요?' } }, FOLLOW_UP_AGENT],
  },
  refund_policy: {
    utterance: {
      EN: 'How do refunds work?',
      ES: '¿Cómo funcionan los reembolsos?',
      KO: '환불은 어떻게 진행되나요?',
    },
    reply: {
      EN: 'Refunds go back to your original payment method — card refunds are typically processed within 5–10 business days after we receive and inspect the return; mail-in returns can take up to 30 days end to end. Gift returns are issued as store credit. Original shipping fees are refunded only when the return is due to our error.',
      ES: 'Los reembolsos se emiten a tu método de pago original: los reembolsos a tarjeta suelen procesarse en 5–10 días hábiles tras recibir e inspeccionar la devolución; las devoluciones por correo pueden tardar hasta 30 días en total. Los regalos se reembolsan como crédito de tienda. Los gastos de envío originales solo se reembolsan si la devolución se debe a un error nuestro.',
      KO: '환불은 원결제 수단으로 진행돼요. 카드 환불은 반품 상품 수령·검수 후 보통 5–10영업일 내 처리되며, 우편 반품은 전체 최대 30일까지 걸릴 수 있어요. 선물 반품은 스토어 크레딧으로 지급됩니다. 최초 배송비는 판매자 과실인 경우에만 환불돼요.',
    },
    followUps: [
      { id: 'return_exchange', label: { EN: 'Start a return', ES: 'Iniciar una devolución', KO: '반품 시작하기' } },
      FOLLOW_UP_AGENT,
    ],
  },
  return_exchange: {
    utterance: {
      EN: 'I would like to return or exchange an item.',
      ES: 'Quiero devolver o cambiar un artículo.',
      KO: '반품 또는 교환을 하고 싶어요.',
    },
    reply: {
      EN: 'Returns and exchanges are accepted within 30 days of purchase for items in new or gently used condition, with proof of purchase. Return shipping is free with our prepaid label. Gift cards, final-sale, and certain hygiene-sensitive items are not returnable. For exchanges, the fastest option is to return the item and place a new order. If your item arrived damaged, defective, or incorrect, contact us within 7 days with a photo and we will replace it free of charge.',
      ES: 'Aceptamos devoluciones y cambios dentro de los 30 días posteriores a la compra para artículos nuevos o poco usados, con comprobante de compra. El envío de devolución es gratis con nuestra etiqueta prepagada. Las tarjetas de regalo, artículos de venta final y ciertos productos de higiene no son retornables. Para cambios, lo más rápido es devolver el artículo y hacer un nuevo pedido. Si tu artículo llegó dañado, defectuoso o incorrecto, contáctanos en un plazo de 7 días con una foto y lo reemplazaremos sin costo.',
      KO: '반품·교환은 구매 후 30일 이내, 새 상품 또는 가볍게 사용(gently used)한 상태이고 구매 증빙이 있으면 가능해요. 프리페이드 라벨 사용 시 반품 배송비는 무료입니다. 기프트카드, 파이널 세일, 일부 위생 민감 품목은 반품이 불가해요. 교환은 반품 후 재주문이 가장 빠릅니다. 파손·불량·오배송 상품은 수령 후 7일 이내 사진과 함께 문의해 주시면 무상 교체해 드려요.',
    },
    followUps: [FOLLOW_UP_MY_ORDERS, { id: 'refund_policy', label: { EN: 'Refund timeline', ES: 'Plazos de reembolso', KO: '환불 소요기간' } }, FOLLOW_UP_AGENT],
  },
  shipping_policy: {
    utterance: {
      EN: 'How long does shipping take?',
      ES: '¿Cuánto tarda el envío?',
      KO: '배송은 얼마나 걸리나요?',
    },
    reply: {
      EN: 'Orders ship within 1–2 business days, and standard US delivery takes 3–5 business days. Once your order ships you can track it in real time from the Orders tab. If your package has not arrived within the expected window, let me know and I can check the tracking status with you.',
      ES: 'Los pedidos se envían en 1–2 días hábiles y la entrega estándar en EE. UU. tarda 3–5 días hábiles. Cuando tu pedido se envíe, podrás rastrearlo en tiempo real desde la pestaña Pedidos. Si tu paquete no llega en el plazo previsto, avísame y revisamos el estado del envío juntos.',
      KO: '주문은 1–2영업일 내 출고되며, 미국 내 표준 배송은 3–5영업일이 소요돼요. 출고 후에는 주문 탭에서 실시간으로 배송을 추적할 수 있어요. 예상 기간이 지나도 도착하지 않았다면 말씀해 주세요. 배송 상태를 함께 확인해 드릴게요.',
    },
    followUps: [FOLLOW_UP_MY_ORDERS, FOLLOW_UP_AGENT],
  },
  order_help: {
    utterance: {
      EN: 'I have a question about my order.',
      ES: 'Tengo una pregunta sobre mi pedido.',
      KO: '주문 관련 문의가 있어요.',
    },
    reply: {
      EN: 'You can check order status, tracking, and history in the Orders tab — sign in or use guest order lookup with your order number and email. I can also answer questions about changing an address, canceling, or returning an order. What do you need help with?',
      ES: 'Puedes ver el estado, el rastreo y el historial en la pestaña Pedidos: inicia sesión o usa la búsqueda de pedido como invitado con tu número de pedido y correo. También puedo responder dudas sobre cambiar la dirección, cancelar o devolver un pedido. ¿En qué te ayudo?',
      KO: '주문 상태·배송 추적·주문 내역은 주문 탭에서 확인할 수 있어요. 로그인하거나 주문번호+이메일로 비회원 조회도 가능합니다. 주소 변경, 취소, 반품 관련 질문도 도와드릴 수 있어요. 무엇을 도와드릴까요?',
    },
    followUps: [
      FOLLOW_UP_MY_ORDERS,
      { id: 'cancel_order', label: { EN: 'Cancel an order', ES: 'Cancelar un pedido', KO: '주문 취소' } },
      { id: 'shipping_policy', label: { EN: 'Shipping times', ES: 'Tiempos de envío', KO: '배송 기간' } },
      FOLLOW_UP_AGENT,
    ],
  },
  product_help_general: {
    utterance: {
      EN: 'I have a question about a product.',
      ES: 'Tengo una pregunta sobre un producto.',
      KO: '상품 관련 문의가 있어요.',
    },
    reply: {
      EN: 'Happy to help with products! Usage instructions and full ingredient lists are on each product detail page, and you can ask me anything here — for example "Is the Repair Serum okay for sensitive skin?" or "How do I use the Vital Cream?" If a product is out of stock, I can set up a restock alert for you.',
      ES: '¡Encantada de ayudarte con los productos! Las instrucciones de uso y la lista completa de ingredientes están en la página de cada producto, y aquí puedes preguntarme lo que quieras, por ejemplo: "¿El Repair Serum sirve para piel sensible?". Si un producto está agotado, puedo crear una alerta de reposición.',
      KO: '상품 관련해 도와드릴게요! 사용법과 전체 성분은 각 상품 상세 페이지에서 확인할 수 있고, 여기서 바로 질문하셔도 돼요. 예: "리페어 세럼은 민감성 피부에도 괜찮나요?" 품절 상품은 재입고 알림을 설정해 드릴 수 있어요.',
    },
    followUps: [
      { id: 'return_exchange', label: { EN: 'Return / exchange', ES: 'Devolución / cambio', KO: '반품·교환' } },
      FOLLOW_UP_AGENT,
    ],
  },
};

function lang(session: Session): Lang {
  const l = (session.language ?? 'EN').toUpperCase();
  return l === 'ES' || l === 'KO' ? (l as Lang) : 'EN';
}

/**
 * Scenario-based deterministic replies (FR-S1). Runs outside RAG: the pressed
 * button (or quick reply) is echoed as the user's turn, the script is persisted
 * as the AI turn, and localized follow-up quick replies are returned. Scenario
 * output still passes the mandatory moderation gate (FR-069).
 */
@Injectable()
export class ScenarioService {
  constructor(
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    private readonly chatService: ChatService,
    private readonly moderation: ModerationService,
  ) {}

  isScenarioAction(action: string): boolean {
    return Object.prototype.hasOwnProperty.call(SCENARIOS, action);
  }

  async handle(session: Session, action: string): Promise<ScenarioTurnResult> {
    const script = SCENARIOS[action];
    if (!script) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const l = lang(session);
    const conversation = await this.chatService.getOrCreateConversation(session.id);

    await this.msgRepo.save(
      this.msgRepo.create({
        conversationId: conversation.id,
        senderType: SENDER_TYPE.USER,
        body: script.utterance[l],
        lang: session.language,
        retrievalTrace: { scenario: action, kind: 'button' },
      }),
    );

    // Non-bypassable moderation gate (FR-069) — scripts are trusted copy, but
    // the gate stays in the path so tenant rules always apply. A blocked script
    // hands off to a human instead of bypassing the gate (POL-020).
    const moderated = await this.moderation.moderate({
      tenantId: session.tenantId ?? 0,
      scope: 'ai',
      authorType: 'ai',
      conversationId: conversation.id,
      text: script.reply[l],
    });
    if (moderated.decision === MODERATION_DECISION.BLOCKED) {
      const notice = await this.chatService.handoff(
        conversation.id,
        session,
        session.tenantId ?? 0,
        'moderation_blocked',
        script.utterance[l],
      );
      return {
        conversationId: conversation.id,
        reply: { senderType: 'system', body: notice },
        followUps: [],
      };
    }
    const body = moderated.text;

    await this.msgRepo.save(
      this.msgRepo.create({
        conversationId: conversation.id,
        senderType: SENDER_TYPE.AI,
        body,
        lang: session.language,
        retrievalTrace: { scenario: action, kind: 'script' },
      }),
    );

    return {
      conversationId: conversation.id,
      reply: { senderType: 'ai', body },
      followUps: script.followUps.map((f) => ({ id: f.id, label: f.label[l] })),
    };
  }
}
