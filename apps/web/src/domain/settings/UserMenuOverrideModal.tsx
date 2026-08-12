import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { Select } from '@/components/Field';
import { useSaveUserOverrides } from './menu-access.hooks';
import type { MenuAccessMode, MenuCatalogRow, RoleMatrixView, UserOverrideRow } from './menu-access.service';

const MODES: MenuAccessMode[] = ['default', 'allow', 'deny'];

/**
 * One member's exceptions to their rank's menus (PLN-260812 S3).
 *
 * An `allow` here also waives the job-label gate: when a master opens a screen
 * for one named person they mean it, and having to hand out a whole job label
 * to do it would grant far more than they intended.
 */
export function UserMenuOverrideModal({
  user,
  menus,
  roleMatrix,
  onClose,
}: {
  user: UserOverrideRow;
  menus: MenuCatalogRow[];
  roleMatrix: RoleMatrixView | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation('settings');
  const { t: tn } = useTranslation('nav');
  const { t: tc } = useTranslation('common');
  const save = useSaveUserOverrides();

  const [modes, setModes] = useState<Record<string, MenuAccessMode>>({});
  useEffect(() => {
    setModes({ ...user.overrides });
  }, [user]);

  const rankRow = roleMatrix?.ranks.find((r) => r.rank === user.rank);
  const modeOf = (code: string): MenuAccessMode => modes[code] ?? 'default';
  const rankDefault = (code: string): boolean => rankRow?.menus[code] ?? false;
  const effective = (code: string): boolean => {
    const mode = modeOf(code);
    return mode === 'default' ? rankDefault(code) : mode === 'allow';
  };

  const onSave = async () => {
    try {
      await save.mutateAsync({
        userId: user.userId,
        menus: menus.map((m) => ({ code: m.code, mode: modeOf(m.code) })),
      });
      onClose();
    } catch {
      /* error toast is raised by the hook; keep the modal open to retry */
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('menuAccess.editFor', {
        who: user.name || user.email,
        rank: t(`menuAccess.rank.${user.rank}`),
      })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {tc('save')}
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-2 pr-3 font-medium">{t('menuAccess.menu')}</th>
              <th className="py-2 pr-3 font-medium">{t('menuAccess.rankDefault')}</th>
              <th className="py-2 pr-3 font-medium">{t('menuAccess.thisUser')}</th>
              <th className="py-2 font-medium">{t('menuAccess.result')}</th>
            </tr>
          </thead>
          <tbody>
            {menus.map((m) => {
              const mode = modeOf(m.code);
              return (
                <tr key={m.code} className="border-b border-gray-100">
                  <td className="py-2 pr-3 text-gray-900">
                    {tn(m.labelKey)}
                    {m.requiredLabel && (
                      <span className="ml-1 text-xs text-gray-400">
                        {t('menuAccess.needsLabel', { label: m.requiredLabel })}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-500">
                    {m.provided
                      ? rankDefault(m.code)
                        ? t('menuAccess.allowed')
                        : t('menuAccess.blocked')
                      : t('menuAccess.notProvided')}
                  </td>
                  <td className="py-2 pr-3">
                    {m.provided ? (
                      <Select
                        aria-label={tn(m.labelKey)}
                        value={mode}
                        onChange={(e) =>
                          setModes((prev) => ({
                            ...prev,
                            [m.code]: e.target.value as MenuAccessMode,
                          }))
                        }
                      >
                        {MODES.map((v) => (
                          <option key={v} value={v}>
                            {t(`menuAccess.mode.${v}`)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    <span
                      className={m.provided && effective(m.code) ? 'text-gray-900' : 'text-gray-400'}
                    >
                      {m.provided && effective(m.code)
                        ? t('menuAccess.canAccess')
                        : t('menuAccess.cannotAccess')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">{t('menuAccess.allowWaivesLabel')}</p>
    </Modal>
  );
}
