import { useState } from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { router } from 'expo-router';
import { type Regimen, localDate } from '../../domain/model';
import { Button, Copy, Empty, FormDialog, Panel } from '../components';
import { DoseForm } from '../forms/DoseForm';
import { PlanForm } from '../forms/PlanForm';
import { PageHeading } from '../Shell';
import { useRecords } from '../store';
import { useTheme } from '../theme';

export function PlansScreen() {
  const { state, run } = useRecords();
  const t = useTheme();
  const [adding, setAdding] = useState(false);
  const [dose, setDose] = useState<Regimen | null>(null);
  const [change, setChange] = useState<{
    plan: Regimen;
    status: Regimen['status'];
  } | null>(null);
  if (!state) return null;
  const hasMedicine = state.medicines.some((medicine) => !medicine.archived);
  return (
    <>
      <PageHeading
        title="Medication plans"
        description="Your instructions, kept separate from doses taken."
      >
        <Button
          label="Add plan"
          icon={Plus}
          onPress={() =>
            hasMedicine ? setAdding(true) : router.push('/cabinet')
          }
        />
      </PageHeading>
      {state.regimens.length ? (
        <View style={{ gap: 18 }}>
          {[...state.regimens].reverse().map((plan) => (
            <Panel key={plan.id}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 20,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Copy size={23} weight="medium">
                    {plan.medicine.name}
                  </Copy>
                  <Copy muted size={13} style={{ marginTop: 6 }}>
                    {plan.amount} {plan.unit} ·{' '}
                    {plan.kind === 'as-needed'
                      ? 'As needed'
                      : plan.times.join(', ')}
                  </Copy>
                </View>
                <Copy size={12} weight="medium" style={{ color: t.accent }}>
                  {plan.status === 'active' &&
                  plan.endOn &&
                  plan.endOn < localDate()
                    ? 'End date passed'
                    : plan.status === 'active' && plan.startOn > localDate()
                      ? 'Starts later'
                      : plan.status}
                </Copy>
              </View>
              <Copy size={14} style={{ marginTop: 20 }}>
                {plan.instructions}
              </Copy>
              <Copy size={12} muted style={{ marginTop: 10 }}>
                {plan.startOn}
                {plan.endOn ? ` to ${plan.endOn}` : ' · no end date'} ·{' '}
                {plan.source === 'clinician'
                  ? 'Clinician provided'
                  : 'User entered'}
              </Copy>
              {['active', 'paused'].includes(plan.status) && (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 20,
                  }}
                >
                  <Button
                    label="Record dose"
                    kind="secondary"
                    small
                    onPress={() => setDose(plan)}
                  />
                  <Button
                    label={plan.status === 'active' ? 'Pause' : 'Resume'}
                    kind="quiet"
                    small
                    onPress={() =>
                      setChange({
                        plan,
                        status: plan.status === 'active' ? 'paused' : 'active',
                      })
                    }
                  />
                  <Button
                    label="Complete"
                    kind="quiet"
                    small
                    onPress={() => setChange({ plan, status: 'completed' })}
                  />
                  <Button
                    label="Discontinue"
                    kind="quiet"
                    small
                    onPress={() => setChange({ plan, status: 'discontinued' })}
                  />
                </View>
              )}
            </Panel>
          ))}
        </View>
      ) : (
        <Empty
          title="Keep instructions close"
          detail={
            hasMedicine
              ? 'Record a clinician-provided or personal plan. MedKit will never turn a schedule into a dose taken.'
              : 'Add a medicine to your cabinet, then record its instructions here.'
          }
          action={
            <Button
              label={hasMedicine ? 'Create your first plan' : 'Open cabinet'}
              icon={Plus}
              onPress={() =>
                hasMedicine ? setAdding(true) : router.push('/cabinet')
              }
            />
          }
        />
      )}
      {adding && <PlanForm onClose={() => setAdding(false)} />}
      {dose && <DoseForm plan={dose} onClose={() => setDose(null)} />}
      {change && (
        <FormDialog
          title="Update plan status"
          onClose={() => setChange(null)}
          submitLabel="Confirm status"
          onSubmit={(edit) =>
            run(
              [
                {
                  type: 'regimen.status',
                  id: change.plan.id,
                  status: change.status,
                },
              ],
              edit,
            )
          }
        >
          <Copy>
            Mark {change.plan.medicine.name} as {change.status}.
          </Copy>
          <Copy muted>
            This records a decision already made. It is not advice to start,
            stop, or change medication. Follow your clinician’s instructions.
          </Copy>
        </FormDialog>
      )}
    </>
  );
}
