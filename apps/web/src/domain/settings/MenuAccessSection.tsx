import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { useRoleMatrix, useSaveRoleMatrix, useUserOverrides } from './menu-access.hooks';
import { UserMenuOverrideModal } from './UserMenuOverrideModal';
import type { UserOverrideRow } from './menu-access.service';

type Tab = 'roles' | 'users';

/**
 * Who on the team reaches which console screen (PLN-260812 S3, layer ②).
 *
 * Two tabs because the two questions are different: the matrix answers "what
 * does this rank normally get", the exceptions tab answers "and what about
 * this one person". Doing it all per-person would mean re-deciding sixteen
 * menus for every new hire.
 *
 * Master rows are read-only throughout. A tenant able to revoke its own
 * master's settings and user-management screens would have locked itself out
 * with no way back in.
 */
export function MenuAccessSection() {
  const { t } = useTranslation('settings');
  const { t: tn } = useTranslation('nav');
  const [tab, setTab] = useState<Tab>('roles');

  const roles = useRoleMatrix();
  const users = useUserOverrides(tab === 'users');
  const saveRoles = useSaveRoleMatrix();

  // Draft matrix: rank -> menu -> allowed. Reset whenever the server answers.
  const [draft, setDraft] = useState<Record<string, Record<string, boolean>>>({});
  useEffect(() => {
    if (!roles.data) return;
    setDraft(Object.fromEntries(roles.data.ranks.map((r) => [r.rank, { ...r.menus }])));
  }, [roles.data]);

  const [editing, setEditing] = useState<UserOverrideRow | null>(null);

  const menus = roles.data?.menus ?? [];
  const rankRows = roles.data?.ranks ?? [];

  const toggle = (rank: string, code: string) =>
    setDraft((prev) => ({
      ...prev,
      [rank]: { ...prev[rank], [code]: !prev[rank]?.[code] },
    }));

  const onSaveRoles = () => {
    saveRoles.mutate(
      rankRows
        .filter((r) => r.editable)
        .flatMap((r) =>
          menus.map((m) => ({
            rank: r.rank,
            menuCode: m.code,
            allowed: draft[r.rank]?.[m.code] ?? r.menus[m.code] ?? false,
          })),
        ),
    );
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'roles', label: t('menuAccess.tabRoles') },
    { key: 'users', label: t('menuAccess.tabUsers') },
  ];

  return (
    <Card title={t('menuAccess.title')}>
      <p className="mb-4 text-sm text-gray-500">{t('menuAccess.subtitle')}</p>

      <div className="mb-4 flex gap-1 border-b border-gray-100">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setTab(x.key)}
            className={
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (tab === x.key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700')
            }
          >
            {x.label}
          </button>
        ))}
      </div>

      {roles.isLoading && <p className="text-sm text-gray-500">{t('menuAccess.loading')}</p>}
      {roles.error && <p className="text-sm text-red-600">{(roles.error as Error).message}</p>}

      {tab === 'roles' && !roles.isLoading && !roles.error && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="py-2 pr-3 text-left font-medium">{t('menuAccess.rankColumn')}</th>
                  {menus.map((m) => (
                    <th key={m.code} className="px-2 py-2 text-center font-medium">
                      <span className={m.provided ? '' : 'text-gray-300 line-through'}>
                        {tn(m.labelKey)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankRows.map((r) => (
                  <tr key={r.rank} className="border-b border-gray-100">
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-900">
                      {t(`menuAccess.rank.${r.rank}`)}
                      {!r.editable && (
                        <span className="ml-2">
                          <Badge tone="info">{t('menuAccess.readOnly')}</Badge>
                        </span>
                      )}
                    </td>
                    {menus.map((m) => {
                      const checked = draft[r.rank]?.[m.code] ?? r.menus[m.code] ?? false;
                      return (
                        <td key={m.code} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 disabled:opacity-40"
                            aria-label={`${t(`menuAccess.rank.${r.rank}`)} · ${tn(m.labelKey)}`}
                            checked={checked && m.provided}
                            disabled={!r.editable || !m.provided}
                            onChange={() => toggle(r.rank, m.code)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-1 text-xs text-gray-400">
            <li>{t('menuAccess.masterNote')}</li>
            <li>{t('menuAccess.labelNote')}</li>
            <li>{t('menuAccess.notProvidedNote')}</li>
          </ul>

          <div className="mt-4 flex justify-end">
            <Button onClick={onSaveRoles} disabled={saveRoles.isPending}>
              {t('menuAccess.save')}
            </Button>
          </div>
        </>
      )}

      {tab === 'users' && (
        <>
          {users.isLoading && <p className="text-sm text-gray-500">{t('menuAccess.loading')}</p>}
          {users.error && <p className="text-sm text-red-600">{(users.error as Error).message}</p>}
          {users.data && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium">{t('menuAccess.member')}</th>
                  <th className="py-2 pr-3 font-medium">{t('menuAccess.rankColumn')}</th>
                  <th className="py-2 pr-3 font-medium">{t('menuAccess.exceptions')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {users.data.users.map((u) => {
                  const entries = Object.entries(u.overrides);
                  const isMaster = u.rank === 'master';
                  return (
                    <tr key={u.userId} className="border-b border-gray-100">
                      <td className="py-2 pr-3 text-gray-900">{u.name || u.email}</td>
                      <td className="py-2 pr-3 text-gray-500">
                        {t(`menuAccess.rank.${u.rank}`)}
                      </td>
                      <td className="py-2 pr-3 text-gray-500">
                        {isMaster ? (
                          <span className="text-gray-400">{t('menuAccess.masterExempt')}</span>
                        ) : entries.length === 0 ? (
                          '—'
                        ) : (
                          entries
                            .map(
                              ([code, mode]) =>
                                `${tn(
                                  users.data.menus.find((m) => m.code === code)?.labelKey ?? code,
                                )} ${mode === 'allow' ? '+' : '−'}`,
                            )
                            .join(' · ')
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {!isMaster && (
                          <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>
                            {t('menuAccess.edit')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {editing && users.data && (
        <UserMenuOverrideModal
          user={editing}
          menus={users.data.menus}
          roleMatrix={roles.data}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
