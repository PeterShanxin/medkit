import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { ArrowLeft, Edit3, Plus } from 'lucide-react-native';
import { healthTimeline, medicineStock } from '../../application/queries';
import { type Batch, type Dose, localDate } from '../../domain/model';
import {
  Button,
  Copy,
  Empty,
  Field,
  FormDialog,
  Notice,
  Panel,
  SectionTitle,
} from '../components';
import { BatchForm, MedicineForm } from '../forms/MedicineForm';
import { CorrectDoseForm, DoseForm } from '../forms/DoseForm';
import { PlanForm } from '../forms/PlanForm';
import { shortDate } from '../format';
import { PageHeading } from '../Shell';
import { useRecords } from '../store';
import { useTheme } from '../theme';
import { Timeline } from '../Timeline';

export function MedicineScreen({ id }: { id: string }) {
  const { state, run } = useRecords();
  const t = useTheme();
  const [dialog, setDialog] = useState<
    'edit' | 'batch' | 'dose' | 'plan' | 'archive' | null
  >(null);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [adjust, setAdjust] = useState<Batch | null>(null);
  const [discard, setDiscard] = useState<Batch | null>(null);
  const [correction, setCorrection] = useState<Dose | null>(null);
  const medicine = state?.medicines.find((item) => item.id === id);
  if (!medicine || !state)
    return (
      <Empty
        title="Medicine not found"
        detail="This record may have been removed when data was deleted."
        action={
          <Button
            label="Back to cabinet"
            onPress={() => router.replace('/cabinet')}
          />
        }
      />
    );
  const stock = medicineStock(state, id);
  const batches = state.batches.filter((item) => item.medicineId === id);
  const doses = state.doses.filter((item) => item.medicineId === id);
  const history = healthTimeline(state).filter((entry) =>
    doses.some((dose) => dose.id === entry.doseId),
  );
  return (
    <>
      <View style={{ marginBottom: 18 }}>
        <Button
          label="Cabinet"
          icon={ArrowLeft}
          kind="quiet"
          small
          onPress={() => router.push('/cabinet')}
        />
      </View>
      <PageHeading
        title={medicine.name}
        description={medicine.genericName || medicine.form}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button
            label="Edit medicine"
            icon={Edit3}
            kind="secondary"
            onPress={() => setDialog('edit')}
          />
          {!medicine.archived && (
            <Button
              label="Record a dose"
              icon={Plus}
              onPress={() => setDialog('dose')}
            />
          )}
        </View>
      </PageHeading>
      {medicine.archived && (
        <View style={{ marginBottom: 20 }}>
          <Notice>Archived. Your historical records are preserved.</Notice>
        </View>
      )}
      <View
        style={{
          flexDirection: t.compact ? 'column' : 'row',
          gap: 24,
          marginBottom: 30,
        }}
      >
        <Panel style={{ flex: 1 }}>
          <SectionTitle title="Formulation" />
          {medicine.ingredients.length ? (
            medicine.ingredients.map((item, index) => (
              <View
                key={index}
                style={{
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderColor: t.line,
                }}
              >
                <Copy weight="medium">{item.name}</Copy>
                <Copy muted size={13}>
                  {item.amount ?? 'Unknown strength'}{' '}
                  {item.amount ? item.unit : ''} / {item.per} {medicine.unit}
                </Copy>
              </View>
            ))
          ) : (
            <Copy muted>No ingredients recorded.</Copy>
          )}
          <Copy size={12} muted style={{ marginTop: 16 }}>
            {medicine.labelChecked
              ? 'Label checked by you. Not clinically verified.'
              : 'Ingredients and strength not checked against the package.'}
          </Copy>
          <Copy size={12} muted style={{ marginTop: 9 }}>
            {medicine.classification === 'unknown'
              ? 'OTC / prescription status not verified'
              : `${medicine.classification.toUpperCase()} · ${medicine.classificationSource}`}
          </Copy>
          {!!medicine.notes && (
            <Copy size={13} style={{ marginTop: 18 }}>
              {medicine.notes}
            </Copy>
          )}
          {!!medicine.aliases.length && (
            <Copy size={12} muted style={{ marginTop: 12 }}>
              Also known as: {medicine.aliases.join(', ')}
            </Copy>
          )}
        </Panel>
        <Panel style={{ flex: 1, backgroundColor: t.soft }}>
          <SectionTitle title="On hand" />
          <Copy weight="display" size={48}>
            {stock.total}
            <Copy size={16} muted>
              {' '}
              {medicine.unit}
            </Copy>
          </Copy>
          <Copy size={13} muted style={{ marginTop: 6 }}>
            {stock.available} within recorded expiry
            {stock.expired > 0 ? ` · ${stock.expired} expired` : ''}
            {stock.unknownExpiry > 0
              ? ` · ${stock.unknownExpiry} expiry unknown`
              : ''}
          </Copy>
          <View style={{ marginTop: 24 }}>
            <Button
              label="Add a medication plan"
              kind="secondary"
              disabled={medicine.archived}
              onPress={() => setDialog('plan')}
            />
          </View>
        </Panel>
      </View>
      <SectionTitle title="Inventory batches">
        <Button
          label="Add batch"
          icon={Plus}
          kind="secondary"
          small
          disabled={medicine.archived}
          onPress={() => setDialog('batch')}
        />
      </SectionTitle>
      {batches.length ? (
        batches.map((batch, index) => (
          <View
            key={batch.id}
            style={{
              borderTopWidth: 1,
              borderColor: t.line,
              paddingVertical: 20,
              gap: 13,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <View style={{ flex: 1 }}>
                <Copy weight="medium">
                  {batch.location || `Batch ${index + 1}`}
                </Copy>
                <Copy size={13} muted style={{ marginTop: 4 }}>
                  {batch.expiresOn
                    ? `Expiry ${shortDate(batch.expiresOn)}`
                    : 'Expiry not recorded'}
                  {batch.acquiredOn
                    ? ` · acquired ${shortDate(batch.acquiredOn)}`
                    : ''}
                </Copy>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Copy weight="medium">
                  {batch.quantity} {medicine.unit}
                </Copy>
                <Copy
                  size={12}
                  style={{
                    color: batch.discarded
                      ? t.muted
                      : batch.expiresOn && batch.expiresOn < localDate()
                        ? t.danger
                        : t.muted,
                  }}
                >
                  {batch.discarded
                    ? 'Discarded'
                    : batch.expiresOn && batch.expiresOn < localDate()
                      ? 'Expired'
                      : batch.quantity <= batch.lowStockAt
                        ? 'Low stock'
                        : 'In cabinet'}
                </Copy>
              </View>
            </View>
            {!batch.discarded && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Button
                  label={`Edit batch ${index + 1}`}
                  kind="quiet"
                  small
                  onPress={() => setEditBatch(batch)}
                />
                <Button
                  label={`Adjust batch ${index + 1}`}
                  kind="quiet"
                  small
                  onPress={() => setAdjust(batch)}
                />
                <Button
                  label={`Discard batch ${index + 1}`}
                  kind="quiet"
                  small
                  onPress={() => setDiscard(batch)}
                />
              </View>
            )}
          </View>
        ))
      ) : (
        <Empty
          title="No batches yet"
          detail="Add the quantity and expiry for each package you own."
        />
      )}
      <View style={{ marginTop: 30 }}>
        <SectionTitle title="Dose history" />
        {history.length ? (
          <Timeline entries={history} doses={doses} onCorrect={setCorrection} />
        ) : (
          <Copy muted>No actual doses recorded for this medicine.</Copy>
        )}
      </View>
      <View style={{ marginTop: 30 }}>
        <Button
          label={medicine.archived ? 'Restore medicine' : 'Archive medicine'}
          kind="quiet"
          onPress={() => setDialog('archive')}
        />
      </View>
      {dialog === 'edit' && (
        <MedicineForm medicine={medicine} onClose={() => setDialog(null)} />
      )}
      {dialog === 'batch' && (
        <BatchForm medicine={medicine} onClose={() => setDialog(null)} />
      )}
      {dialog === 'dose' && (
        <DoseForm medicineId={medicine.id} onClose={() => setDialog(null)} />
      )}
      {dialog === 'plan' && (
        <PlanForm medicineId={medicine.id} onClose={() => setDialog(null)} />
      )}
      {dialog === 'archive' && (
        <FormDialog
          title={medicine.archived ? 'Restore medicine' : 'Archive medicine'}
          onClose={() => setDialog(null)}
          submitLabel={medicine.archived ? 'Restore' : 'Archive'}
          onSubmit={(operationId) =>
            run(
              [{ type: 'medicine.archive', id, archived: !medicine.archived }],
              operationId,
            )
          }
        >
          <Copy>
            {medicine.archived
              ? 'This medicine will return to your cabinet.'
              : 'This removes the medicine from your active cabinet. Batches and historical doses remain available in Archived. Complete or discontinue active and paused plans first.'}
          </Copy>
        </FormDialog>
      )}
      {editBatch && (
        <BatchForm
          medicine={medicine}
          batch={editBatch}
          onClose={() => setEditBatch(null)}
        />
      )}
      {adjust && (
        <AdjustStockForm
          batch={adjust}
          unit={medicine.unit}
          onClose={() => setAdjust(null)}
        />
      )}
      {discard && (
        <FormDialog
          title="Discard this batch?"
          submitLabel="Mark discarded"
          destructive
          onClose={() => setDiscard(null)}
          onSubmit={(operationId) =>
            run([{ type: 'batch.discard', id: discard.id }], operationId)
          }
        >
          <Copy>
            Only confirm after you have discarded this stock. The batch stays in
            history and will no longer count as available.
          </Copy>
        </FormDialog>
      )}
      {correction && (
        <CorrectDoseForm
          dose={correction}
          onClose={() => setCorrection(null)}
        />
      )}
    </>
  );
}

function AdjustStockForm({
  batch,
  unit,
  onClose,
}: {
  batch: Batch;
  unit: string;
  onClose(): void;
}) {
  const { run } = useRecords();
  const [quantity, setQuantity] = useState(batch.quantity.toString());
  const [reason, setReason] = useState('');
  return (
    <FormDialog
      title="Adjust stock"
      onClose={onClose}
      submitLabel="Update stock"
      onSubmit={async (operationId) => {
        if (!quantity.trim()) throw new Error('Enter a quantity.');
        await run(
          [
            {
              type: 'batch.adjust',
              id: batch.id,
              quantity: Number(quantity),
              reason,
            },
          ],
          operationId,
        );
      }}
    >
      <Field
        label={`Actual quantity (${unit})`}
        value={quantity}
        onChange={setQuantity}
        keyboard="decimal-pad"
      />
      <Field
        label="Reason"
        value={reason}
        onChange={setReason}
        placeholder="Recount, damaged pack…"
      />
      <Copy muted size={13}>
        This adjusts inventory only. It does not record consumption.
      </Copy>
    </FormDialog>
  );
}
