import { Inquiry } from './entity/inquiry.entity';

export interface InquiryView {
  id: number;
  orderId: number | null;
  status: string;
  createdAt: Date;
}

export interface AdminInquiryView extends InquiryView {
  conversationId: number | null;
  customerId: number | null;
}

/** Entity -> response mapping for inquiries. */
export class InquiryMapper {
  static toView(inquiry: Inquiry): InquiryView {
    return {
      id: inquiry.id,
      orderId: inquiry.orderId,
      status: inquiry.status,
      createdAt: inquiry.createdAt,
    };
  }

  static toViewList(inquiries: Inquiry[]): InquiryView[] {
    return inquiries.map((i) => this.toView(i));
  }

  static toAdminView(inquiry: Inquiry): AdminInquiryView {
    return {
      ...this.toView(inquiry),
      conversationId: inquiry.conversationId,
      customerId: inquiry.customerId,
    };
  }

  static toAdminViewList(inquiries: Inquiry[]): AdminInquiryView[] {
    return inquiries.map((i) => this.toAdminView(i));
  }
}
