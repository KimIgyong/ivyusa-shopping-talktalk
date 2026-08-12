import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Select } from '@/components/Field';
import { useTenantMenus, useSaveTenantMenus } from './admin.hooks';
import type { MenuProvisionMode, TenantMenuRow } from './admin.service';

const MODES: MenuProvisionMode[] = ['plan', 'on', 'off'];

/** Plan default + override → what the tenant actually gets. */
function isProvided(row: TenantMenuRow, mode: MenuProvisionMode): boolean {
  return mode === 'plan' ? row.planDefault : mode === 'on';
}

/**
 * Which console menus a tenant is provisioned (PLN-260812 S2, layer ①).
 *
 * The plan preset is the baseline and each row can be pinned against it, so a
 * later plan change still flows through to every menu nobody made an exception
 * for. The right-hand column shows the resulting state as the operator edits —
 * a three-way select whose effect you can only learn by saving is a trap.
 */
export function TenantMenusModal({
  tenantUuid,
  tenantName,
  open,
  onClose,
}: {
  tenantUuid: string;
  tenantName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('tenants');
  const { t: tn } = useTranslation('nav');
  const { t: tc } = useTranslation('common');
  const { data, isLoading, error } = useTenantMenus(tenantUuid, open);
  const save = useSaveTenantMenus(tenantUuid);

  const [modes, setModes] = useState<Record<string, MenuProvisionMode>>({});

  // Server state is the source of truth; reset the draft whenever it arrives.
  useEffect(() => {
    if (!data) return;
    setModes(Object.fromEntries(data.menus.map((m) => [m.code, m.mode])));
  }, [data]);

  const rows = data?.menus ?? [];
  const modeOf = (row: TenantMenuRow): MenuProvisionMode => modes[row.code] ?? row.mode;

  const planCount = useMemo(() => rows.filter((r) => r.planDefault).length, [rows]);
  const exceptionCount = useMemo(
    () => rows.filter((r) => modeOf(r) !== 'plan').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, modes],
  );

  const onSave = async () => {
    try {
      await save.mutateAsync(rows.map((r) => ({ code: r.code, mode: modeOf(r) })));
      onClose();
    } catch {
      /* error toast is raised by the hook; keep the modal open to retry */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('menus.title', { name: tenantName })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button onClick={onSave} disabled={save.isPending || isLoading || !!error}>
            {tc('save')}
          </Button>
        </>
      }
    >
      {isLoading && <p className="text-sm text-gray-500">{tc('loading')}</p>}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

      {!isLoading && !error && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>{t('plan')}</span>
            <Badge tone="primary">{data?.plan ?? t('menus.noPlan')}</Badge>
            <span>{t('menus.planCount', { count: planCount, total: rows.length })}</span>
          </div>
          <p className="mb-4 text-xs text-gray-400">{t('menus.planHint')}</p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium">{t('menus.menu')}</th>
                  <th className="py-2 pr-3 font-medium">{t('menus.planDefault')}</th>
                  <th className="py-2 pr-3 font-medium">{t('menus.thisTenant')}</th>
                  <th className="py-2 font-medium">{t('menus.result')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const mode = modeOf(row);
                  const provided = isProvided(row, mode);
                  return (
                    <tr key={row.code} className="border-b border-gray-100">
                      <td className="py-2 pr-3 text-gray-900">{tn(row.labelKey)}</td>
                      <td className="py-2 pr-3 text-gray-500">
                        {row.planDefault ? t('menus.provided') : t('menus.notProvided')}
                      </td>
                      <td className="py-2 pr-3">
                        <Select
                          aria-label={tn(row.labelKey)}
                          value={mode}
                          onChange={(e) =>
                            setModes((prev) => ({
                              ...prev,
                              [row.code]: e.target.value as MenuProvisionMode,
                            }))
                          }
                        >
                          {MODES.map((m) => (
                            <option key={m} value={m}>
                              {t(`menus.mode.${m}`)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2">
                        <span className={provided ? 'text-gray-900' : 'text-gray-400'}>
                          {provided ? t('menus.provided') : t('menus.notProvided')}
                        </span>
                        {mode !== 'plan' && <span className="ml-1 text-primary-600">*</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-gray-400">
            {t('menus.exceptions', { count: exceptionCount })}
          </p>
          {/* The issue board carries a second, older entitlement; provisioning
              it alone would leave a 'base' tenant staring at a notice screen. */}
          <p className="mt-1 text-xs text-gray-400">{t('menus.issuesNote')}</p>
        </>
      )}
    </Modal>
  );
}
