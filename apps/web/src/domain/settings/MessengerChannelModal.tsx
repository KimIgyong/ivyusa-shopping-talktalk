import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { FormRow, Input, Select } from '@/components/Field';
import { toast } from '@/store/toast-store';
import {
  MESSENGER_FIELDS,
  UNOFFICIAL_PROVIDERS,
  type AnyMessengerProvider,
  type MessengerChannel,
} from './messenger.service';
import {
  useDeleteMessengerChannel,
  useRegisterMessengerWebhook,
  useSaveMessengerChannel,
  useTestMessengerChannel,
  useUpdateMessengerChannel,
} from './messenger.hooks';

/** Extra non-credential settings the operator edits per provider. */
const CONFIG_FIELDS: Partial<Record<string, string[]>> = {
  amoebatalk: ['social_types'],
  gmail: ['sender_name'],
  viber: ['sender_name'],
};

/**
 * Defaults offered on a brand-new channel. A blank server/host box is the one
 * thing that turns a wrong value into an unexplained 404, so the known-good
 * value is filled in and the operator only edits it when their install differs.
 */
const FIELD_DEFAULTS: Partial<Record<string, Record<string, string>>> = {
  btbz_relay: { base_url: 'https://messenger.amoeba.site' },
  gmail: { imap_host: 'imap.gmail.com', smtp_host: 'smtp.gmail.com' },
};

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create/edit one messenger channel (PLN-260810 PR-M5).
 *
 * Credential inputs come from the shared MESSENGER_FIELDS schema, so adding a
 * provider is a registry entry, not a new form. Secrets are write-only: an
 * empty box means "keep what is stored", never "clear it".
 */
export function MessengerChannelModal({
  provider,
  channel,
  open,
  onClose,
}: {
  provider: AnyMessengerProvider;
  /** Existing row when editing; undefined creates a new channel. */
  channel?: MessengerChannel;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const save = useSaveMessengerChannel();
  const update = useUpdateMessengerChannel();
  const remove = useDeleteMessengerChannel();
  const test = useTestMessengerChannel();
  const registerWebhook = useRegisterMessengerWebhook();

  const specs = MESSENGER_FIELDS[provider] ?? [];
  const configKeys = CONFIG_FIELDS[provider] ?? [];

  const [label, setLabel] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [autoReply, setAutoReply] = useState(true);
  const [consentMode, setConsentMode] = useState('notice');
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(channel?.label ?? t(`messenger.provider.${provider}.defaultLabel`, { defaultValue: provider }));
    // Non-secret fields come back from the server (they live in `config`), so
    // reopening the form shows what is actually stored instead of blank boxes.
    // Secrets stay empty — an empty secret means "keep", never "clear".
    const defaults = FIELD_DEFAULTS[provider] ?? {};
    setValues(
      Object.fromEntries(
        specs
          .filter((spec) => !spec.secret)
          .map((spec) => [
            spec.key,
            String(channel?.config?.[spec.key] ?? (channel ? '' : (defaults[spec.key] ?? ''))),
          ]),
      ),
    );
    setConfig(
      Object.fromEntries(
        configKeys.map((k) => [k, stringifyConfig(channel?.config?.[k])]),
      ),
    );
    // An unofficial channel starts with AI off — relaying an automated reply
    // into someone's personal KakaoTalk room must be a deliberate choice.
    setAutoReply(channel?.autoReply ?? !UNOFFICIAL_PROVIDERS.has(provider));
    setConsentMode(channel?.consentMode ?? 'notice');
    // A new channel defaults to enabled: filling in credentials is the intent
    // to use it, and a silently disabled channel receives nothing.
    setActive(channel?.active ?? true);
    // specs/configKeys are derived from `provider`, already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel, provider]);

  const onSave = async () => {
    const secret: Record<string, string> = {};
    for (const spec of specs) {
      const value = (values[spec.key] ?? '').trim();
      if (value) secret[spec.key] = value;
    }
    const body = {
      label: label.trim(),
      // Omitted when empty so a save without retyping keeps the stored secret.
      ...(Object.keys(secret).length ? { secret } : {}),
      config: parseConfig(config),
      auto_reply: autoReply,
      consent_mode: consentMode,
      active,
    };

    if (channel) await update.mutateAsync({ id: channel.id, body });
    else await save.mutateAsync({ provider, ...body });
    setValues({});
    onClose();
  };

  const onDelete = async () => {
    if (!channel) return;
    await remove.mutateAsync(channel.id);
    onClose();
  };

  const pending = save.isPending || update.isPending;
  const missingRequired = specs.some(
    (spec) =>
      spec.required && !(values[spec.key] ?? '').trim() && !(channel?.credentialSet && spec.secret),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(`messenger.provider.${provider}.title`, { defaultValue: provider })}
      footer={
        <>
          {channel && (
            <Button variant="ghost" onClick={onDelete} disabled={remove.isPending}>
              {t('messenger.disconnect')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {tc('close')}
          </Button>
          <Button onClick={onSave} disabled={pending || !label.trim() || missingRequired}>
            {pending ? tc('saving') : tc('save')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-gray-500">
        {t(`messenger.provider.${provider}.subtitle`, { defaultValue: '' })}
      </p>

      <FormRow label={t('messenger.label')}>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </FormRow>

      {specs.map((spec) => (
        <FormRow
          key={spec.key}
          label={t(`messenger.fields.${spec.key}`, { defaultValue: spec.key }) + (spec.required ? ' *' : '')}
        >
          <Input
            type={spec.secret ? 'password' : 'text'}
            value={values[spec.key] ?? ''}
            onChange={(e) => setValues((p) => ({ ...p, [spec.key]: e.target.value }))}
            placeholder={spec.secret && channel?.credentialSet ? t('messenger.stored') : ''}
            autoComplete="off"
          />
        </FormRow>
      ))}

      {configKeys.map((key) => (
        <FormRow key={key} label={t(`messenger.fields.${key}`, { defaultValue: key })}>
          <Input
            value={config[key] ?? ''}
            onChange={(e) => setConfig((p) => ({ ...p, [key]: e.target.value }))}
            placeholder={t(`messenger.ph.${key}`, { defaultValue: '' })}
          />
        </FormRow>
      ))}

      <FormRow label={t('messenger.autoReply')}>
        <Select value={autoReply ? 'on' : 'off'} onChange={(e) => setAutoReply(e.target.value === 'on')}>
          <option value="on">{t('messenger.on')}</option>
          <option value="off">{t('messenger.off')}</option>
        </Select>
      </FormRow>

      <p className="-mt-2 mb-3 text-xs text-gray-500">{t('messenger.autoReplyScope')}</p>

      <FormRow label={t('messenger.consentMode')}>
        <Select value={consentMode} onChange={(e) => setConsentMode(e.target.value)}>
          <option value="notice">{t('messenger.consent.notice')}</option>
          <option value="auto">{t('messenger.consent.auto')}</option>
        </Select>
      </FormRow>

      <FormRow label={t('messenger.enabledLabel')}>
        <Select value={active ? 'on' : 'off'} onChange={(e) => setActive(e.target.value === 'on')}>
          <option value="on">{t('messenger.enabled')}</option>
          <option value="off">{t('messenger.disabled')}</option>
        </Select>
      </FormRow>

      {channel && (
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
          {channel.webhookUrl && (
            <div>
              <p className="mb-1 text-xs text-gray-500">{t('messenger.webhookUrl')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-gray-50 px-2 py-1 text-[11px] text-gray-600">
                  {channel.webhookUrl}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const ok = await copy(channel.webhookUrl as string);
                    if (ok) toast.success(t('messenger.copied'));
                    else toast.error(t('messenger.copyFailed'));
                  }}
                >
                  {t('messenger.copy')}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{t('messenger.webhookHint')}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => test.mutate(channel.id)} disabled={test.isPending}>
              {test.isPending ? t('messenger.testing') : t('messenger.test')}
            </Button>
            {channel.webhookUrl && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => registerWebhook.mutate(channel.id)}
                disabled={registerWebhook.isPending}
              >
                {t('messenger.registerWebhook')}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500">{t('messenger.connectionStatus')}:</span>
            <Badge
              tone={
                channel.status === 'connected' ? 'success' : channel.status === 'error' ? 'error' : undefined
              }
            >
              {t(`messenger.state.${channel.status}`, { defaultValue: channel.status })}
            </Badge>
          </div>
          {channel.lastError && <p className="text-xs text-red-600">{channel.lastError}</p>}
        </div>
      )}
    </Modal>
  );
}

/** `social_types` is a list in the API; the form edits it as a comma string. */
function stringifyConfig(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  return value == null ? '' : String(value);
}

function parseConfig(config: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[key] = key === 'social_types' ? trimmed.split(',').map((v) => v.trim()).filter(Boolean) : trimmed;
  }
  return out;
}
