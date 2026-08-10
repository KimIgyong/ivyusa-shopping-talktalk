import { HttpStatus, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../global/exception/business.exception';
import { ERROR_CODE } from '../../../global/constant/error-code.constant';
import { MessengerAdapter } from './messenger-adapter';
import { TelegramAdapter } from './telegram.adapter';
import { ViberAdapter } from './viber.adapter';
import { AmoebaTalkHubAdapter } from './amoeba-talk-hub.adapter';
import { BtbzRelayAdapter } from './btbz-relay.adapter';
import { GmailImapAdapter } from './gmail-imap.adapter';

/**
 * Provider → adapter lookup. A new channel registers here and nothing else in
 * the pipeline changes.
 */
@Injectable()
export class AdapterRegistry {
  private readonly adapters = new Map<string, MessengerAdapter>();

  constructor(
    telegram: TelegramAdapter,
    viber: ViberAdapter,
    amoebaTalk: AmoebaTalkHubAdapter,
    btbzRelay: BtbzRelayAdapter,
    gmail: GmailImapAdapter,
  ) {
    for (const adapter of [telegram, viber, amoebaTalk, btbzRelay, gmail]) {
      this.adapters.set(adapter.provider, adapter);
    }
  }

  /** Adapter for a provider, or a 400 the console can localize. */
  require(provider: string): MessengerAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new BusinessException(ERROR_CODE.MESSENGER_PROVIDER_UNSUPPORTED, HttpStatus.BAD_REQUEST);
    }
    return adapter;
  }

  find(provider: string): MessengerAdapter | undefined {
    return this.adapters.get(provider);
  }

  /** Providers wired in this build — the console renders cards from this list. */
  supported(): string[] {
    return [...this.adapters.keys()];
  }
}
