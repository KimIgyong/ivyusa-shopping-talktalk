import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormRow, Input } from '@/components/Field';
import { usePrivacyNotice, useUpdatePrivacyNotice } from './privacy-notice.hooks';

/** Empty is allowed (clears the link); otherwise http(s) URL, max 512 (server rule). */
function isValidPolicyUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (v.length > 512) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Mirrors the server rule: alnum start, then [A-Za-z0-9._-], max 32. Empty = keep/default. */
function isValidVersion(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return v.length <= 32 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v);
}

/**
 * Privacy notice settings (wireframe 5.3, master/director via the `settings`
 * capability). Bumping the version re-prompts every customer for consent.
 */
export function PrivacyNoticePage() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { data, isLoading, error } = usePrivacyNotice();
  const update = useUpdatePrivacyNotice();

  const [policyUrl, setPolicyUrl] = useState('');
  const [version, setVersion] = useState('');
  const [urlInvalid, setUrlInvalid] = useState(false);
  const [versionInvalid, setVersionInvalid] = useState(false);

  // Seed the form once the current settings arrive (or after a refetch).
  useEffect(() => {
    if (data) {
      setPolicyUrl(data.privacyPolicyUrl ?? '');
      setVersion(data.consentNoticeVersion ?? '');
    }
  }, [data]);

  const onSave = () => {
    const urlOk = isValidPolicyUrl(policyUrl);
    const versionOk = isValidVersion(version);
    setUrlInvalid(!urlOk);
    setVersionInvalid(!versionOk);
    if (!urlOk || !versionOk) return;
    const trimmedVersion = version.trim();
    update.mutate({
      privacy_policy_url: policyUrl.trim() || null,
      ...(trimmedVersion ? { consent_notice_version: trimmedVersion } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('privacyNotice.title')} subtitle={t('privacyNotice.subtitle')} />

      <Card title={t('privacyNotice.cardTitle')}>
        {isLoading ? (
          <p className="text-sm text-gray-500">{tc('loading')}</p>
        ) : error ? (
          <p className="text-sm text-error">{(error as Error).message}</p>
        ) : (
          <div className="max-w-xl">
            <FormRow label={t('privacyNotice.policyUrl')}>
              <Input
                type="url"
                value={policyUrl}
                onChange={(e) => {
                  setPolicyUrl(e.target.value);
                  if (urlInvalid && isValidPolicyUrl(e.target.value)) setUrlInvalid(false);
                }}
                placeholder={t('privacyNotice.policyUrlPlaceholder')}
                maxLength={512}
                aria-invalid={urlInvalid}
              />
              {urlInvalid && (
                <p className="mt-1 text-xs text-error" role="alert">
                  {t('privacyNotice.invalidUrl')}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-400">{t('privacyNotice.policyUrlHint')}</p>
            </FormRow>

            <FormRow label={t('privacyNotice.version')}>
              <Input
                value={version}
                onChange={(e) => {
                  setVersion(e.target.value);
                  if (versionInvalid && isValidVersion(e.target.value)) setVersionInvalid(false);
                }}
                placeholder={t('privacyNotice.versionPlaceholder')}
                maxLength={32}
                aria-invalid={versionInvalid}
              />
              {versionInvalid && (
                <p className="mt-1 text-xs text-error" role="alert">
                  {t('privacyNotice.invalidVersion')}
                </p>
              )}
              {/* Stored null = platform default version is in effect. */}
              {!version.trim() && (
                <p className="mt-1 text-xs text-gray-400">{t('privacyNotice.versionDefaultHint')}</p>
              )}
            </FormRow>

            {/* Version bump re-prompts every customer — make that unmissable. */}
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed text-gray-700">
                {t('privacyNotice.versionWarning')}
              </p>
            </div>

            <Button onClick={onSave} disabled={update.isPending}>
              {update.isPending ? tc('saving') : tc('save')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
