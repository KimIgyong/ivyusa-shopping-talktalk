import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { FormRow, Select } from '@/components/Field';
import { useSetTenantPlan, useSetTenantWorkflowMode } from './admin.hooks';
import type { Tenant } from './admin.service';

// Local mirrors of TENANT_PLAN / WORKFLOW_MODE (@ivy/types values cannot be
// imported in web bundles — LESSON 2026-07-16; the API validates with @IsIn).
export const TENANT_PLANS = ['starter', 'growth', 'enterprise', 'custom'] as const;
const WORKFLOW_MODES = ['base', 'bridge', 'native'] as const;

/**
 * Plan + add-on editor for one tenant (PLN-260825 D1: one modal, two PATCHes).
 *
 * Menu exposure and feature entitlement are different axes — the plan preset
 * feeds the provided-menus computation, while workflow mode is the server-side
 * gate the /issues board judges. Editing both here is what closes the
 * "menu shows but the feature refuses" confusion from REQ-260825.
 */
export function TenantPlanModal({
  tenant,
  open,
  onClose,
}: {
  tenant: Tenant;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('tenants');
  const { t: tc } = useTranslation('common');
  const setPlan = useSetTenantPlan();
  const setMode = useSetTenantWorkflowMode();

  const [plan, setPlanValue] = useState(tenant.plan ?? 'custom');
  const [mode, setModeValue] = useState(tenant.workflowMode ?? 'base');

  // Re-arm the form each time the modal opens for a (possibly different) tenant.
  useEffect(() => {
    if (!open) return;
    setPlanValue(tenant.plan ?? 'custom');
    setModeValue(tenant.workflowMode ?? 'base');
  }, [open, tenant]);

  const planDirty = plan !== (tenant.plan ?? 'custom');
  const modeDirty = mode !== (tenant.workflowMode ?? 'base');
  const saving = setPlan.isPending || setMode.isPending;

  const save = async () => {
    // Independent PATCHes (D1): a failure in one leaves the other's toast/state
    // honest instead of pretending a combined save half-happened silently.
    if (planDirty) await setPlan.mutateAsync({ id: tenant.uuid, plan });
    if (modeDirty) await setMode.mutateAsync({ id: tenant.uuid, mode });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('planAddonTitle', { name: tenant.name })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button onClick={save} disabled={saving || (!planDirty && !modeDirty)}>
            {saving ? tc('saving') : tc('save')}
          </Button>
        </>
      }
    >
      <FormRow label={t('plan')}>
        <Select value={plan} onChange={(e) => setPlanValue(e.target.value)}>
          {TENANT_PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        {/* D2: one-line preset preview so a downgrade isn't a save-and-see trap. */}
        <p className="mt-1.5 text-xs text-gray-500">
          {t(`planPreview.${TENANT_PLANS.includes(plan as (typeof TENANT_PLANS)[number]) ? plan : 'custom'}`)}
        </p>
        {planDirty && <p className="mt-1 text-xs text-amber-600">{t('planOverridesKept')}</p>}
      </FormRow>

      <FormRow label={t('workflowAddon')}>
        <div className="space-y-2">
          {WORKFLOW_MODES.map((m) => (
            <label key={m} className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="workflow-mode"
                checked={mode === m}
                onChange={() => setModeValue(m)}
                className="mt-0.5 h-4 w-4 border-gray-300"
              />
              <span>
                <span className="font-medium">{m}</span>
                <span className="ml-1 text-gray-500">— {t(`workflowMode.${m}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </FormRow>
    </Modal>
  );
}
