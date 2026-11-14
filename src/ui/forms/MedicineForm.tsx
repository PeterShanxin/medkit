import { useState } from 'react';
import { View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';
import {
  type Batch,
  type Medicine,
  type Unit,
  localDate,
} from '../../domain/model';
import { type Command } from '../../domain/commands';
import {
  Button,
  Choice,
  Copy,
  Field,
  FormDialog,
  Toggle,
  TwoColumns,
} from '../components';
import { useRecords, uuid } from '../store';

export const unitOptions = [
  'tablet',
  'capsule',
  'mL',
  'sachet',
  'puff',
  'drop',
  'application',
].map((value) => ({ value, label: value }));

export function MedicineForm({
  medicine,
  onClose,
}: {
  medicine?: Medicine;
  onClose(): void;
}) {
  const { run } = useRecords();
  const [name, setName] = useState(medicine?.name ?? '');
  const [genericName, setGeneric] = useState(medicine?.genericName ?? '');
  const [form, setForm] = useState(medicine?.form ?? 'Tablet');
  const [unit, setUnit] = useState<Unit>(medicine?.unit ?? 'tablet');
  const [ingredients, setIngredients] = useState(
    medicine?.ingredients.map((item) => ({
      ...item,
      amount: item.amount?.toString() ?? '',
      per: item.per.toString(),
    })) ?? [{ name: '', amount: '', unit: 'mg' as const, per: '1' }],
  );
  const [checked, setChecked] = useState(medicine?.labelChecked ?? false);
  const [quantity, setQuantity] = useState('');
  const [expiry, setExpiry] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState(medicine?.notes ?? '');
  const [aliases, setAliases] = useState(medicine?.aliases.join(', ') ?? '');
  const [classification, setClassification] = useState(
    medicine?.classification ?? 'unknown',
  );
  const [classificationSource, setClassificationSource] = useState(
    medicine?.classificationSource ?? '',
  );
  const [advanced, setAdvanced] = useState(false);

  return (
    <FormDialog
      title={medicine ? 'Edit medicine' : 'Add medicine'}
      onClose={onClose}
      submitLabel={medicine ? 'Save medicine' : 'Add to cabinet'}
      onSubmit={async (edit) => {
        const id = medicine?.id ?? uuid();
        const commands: Command[] = [
          {
            type: 'medicine.save',
            id,
            data: {
              name,
              genericName,
              form,
              unit,
              notes,
              labelChecked: checked,
              aliases: aliases
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
              classification,
              classificationSource,
              ingredients: ingredients
                .filter((item) => item.name.trim() || item.amount)
                .map((item) => ({
                  ...item,
                  amount: item.amount === '' ? null : Number(item.amount),
                  per: Number(item.per),
                })),
            },
          },
        ];
        if (!medicine)
          commands.push({
            type: 'batch.add',
            id: uuid(),
            data: {
              medicineId: id,
              quantity: Number(quantity),
              expiresOn: expiry || null,
              acquiredOn: null,
              location,
              lowStockAt: 5,
            },
          });
        if (!medicine && !quantity.trim())
          throw new Error(
            'Enter the quantity, including zero if the pack is empty.',
          );
        await run(commands, edit);
      }}
    >
      <Field
        label="Medicine name"
        value={name}
        onChange={setName}
        placeholder="Name on the package"
      />
      <Field
        label="Generic or Chinese name (optional)"
        value={genericName}
        onChange={setGeneric}
        placeholder="通用名 / 中文名"
      />
      <TwoColumns>
        <View style={{ flex: 1 }}>
          <Field
            label="Form"
            value={form}
            onChange={setForm}
            placeholder="Tablet, liquid, cream…"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Choice
            label="Stock and dose unit"
            value={unit}
            onChange={(value) => {
              setChecked(false);
              setUnit(value as Unit);
            }}
            options={unitOptions}
          />
        </View>
      </TwoColumns>
      <View style={{ gap: 14 }}>
        <Copy weight="medium">Active ingredients</Copy>
        {ingredients.map((ingredient, index) => (
          <View key={index} style={{ gap: 10 }}>
            <Field
              label={`Ingredient ${index + 1}`}
              value={ingredient.name}
              onChange={(value) => {
                setChecked(false);
                setIngredients(
                  ingredients.map((item, i) =>
                    i === index ? { ...item, name: value } : item,
                  ),
                );
              }}
              placeholder="Copy from the label"
            />
            <TwoColumns>
              <View style={{ flex: 1 }}>
                <Field
                  label={`Strength ${index + 1}`}
                  value={ingredient.amount}
                  keyboard="decimal-pad"
                  onChange={(value) => {
                    setChecked(false);
                    setIngredients(
                      ingredients.map((item, i) =>
                        i === index ? { ...item, amount: value } : item,
                      ),
                    );
                  }}
                  placeholder="Unknown"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Choice
                  label={`Strength unit ${index + 1}`}
                  value={ingredient.unit}
                  onChange={(value) => {
                    setChecked(false);
                    setIngredients(
                      ingredients.map((item, i) =>
                        i === index
                          ? { ...item, unit: value as typeof item.unit }
                          : item,
                      ),
                    );
                  }}
                  options={['mg', 'mcg', 'g', 'IU', '%'].map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label={`Per ${unit}`}
                  value={ingredient.per}
                  keyboard="decimal-pad"
                  onChange={(value) => {
                    setChecked(false);
                    setIngredients(
                      ingredients.map((item, i) =>
                        i === index ? { ...item, per: value } : item,
                      ),
                    );
                  }}
                />
              </View>
            </TwoColumns>
            {ingredients.length > 1 && (
              <Button
                label={`Remove ingredient ${index + 1}`}
                icon={Trash2}
                kind="quiet"
                onPress={() => {
                  setChecked(false);
                  setIngredients(ingredients.filter((_, i) => i !== index));
                }}
              />
            )}
          </View>
        ))}
        <Button
          label="Add ingredient"
          icon={Plus}
          kind="quiet"
          onPress={() =>
            setIngredients([
              ...ingredients,
              { name: '', amount: '', unit: 'mg', per: '1' },
            ])
          }
        />
        <Toggle
          label="I checked the ingredients and strength against the package"
          value={checked}
          onChange={setChecked}
          hint="This records your label check, not a clinical verification."
        />
      </View>
      {!medicine && (
        <>
          <TwoColumns>
            <View style={{ flex: 1 }}>
              <Field
                label={`Quantity (${unit})`}
                value={quantity}
                onChange={setQuantity}
                keyboard="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Expiry date (optional)"
                value={expiry}
                onChange={setExpiry}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </TwoColumns>
          <Field
            label="Storage location (optional)"
            value={location}
            onChange={setLocation}
            placeholder="Bedroom drawer"
          />
        </>
      )}
      <Button
        label={advanced ? 'Fewer details' : 'More details'}
        kind="quiet"
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced && (
        <>
          <Field
            label="Other names (comma-separated)"
            value={aliases}
            onChange={setAliases}
          />
          <Choice
            label="Classification"
            value={classification}
            onChange={(value) =>
              setClassification(value as typeof classification)
            }
            options={[
              { value: 'unknown', label: 'Not verified' },
              { value: 'otc', label: 'OTC' },
              { value: 'prescription', label: 'Prescription' },
            ]}
          />
          {classification !== 'unknown' && (
            <Field
              label="Classification source"
              value={classificationSource}
              onChange={setClassificationSource}
              placeholder="Verified source or pharmacist confirmation"
            />
          )}
          <Field label="Notes" value={notes} onChange={setNotes} multiline />
        </>
      )}
    </FormDialog>
  );
}

export function BatchForm({
  medicine,
  batch,
  onClose,
}: {
  medicine: Medicine;
  batch?: Batch;
  onClose(): void;
}) {
  const { run } = useRecords();
  const [quantity, setQuantity] = useState('');
  const [expiry, setExpiry] = useState(batch?.expiresOn ?? '');
  const [acquired, setAcquired] = useState(
    batch ? (batch.acquiredOn ?? '') : localDate(),
  );
  const [location, setLocation] = useState(batch?.location ?? '');
  const [low, setLow] = useState(batch?.lowStockAt.toString() ?? '5');
  return (
    <FormDialog
      title={batch ? 'Edit batch details' : 'Add a batch'}
      onClose={onClose}
      submitLabel={batch ? 'Save batch' : 'Add batch'}
      onSubmit={async (edit) => {
        if (!batch && !quantity.trim()) throw new Error('Enter a quantity.');
        if (!low.trim())
          throw new Error(
            'Enter a low-stock threshold, including zero if needed.',
          );
        const data = {
          expiresOn: expiry || null,
          acquiredOn: acquired || null,
          location,
          lowStockAt: Number(low),
        };
        await run(
          [
            batch
              ? { type: 'batch.update', id: batch.id, data }
              : {
                  type: 'batch.add',
                  id: uuid(),
                  data: {
                    ...data,
                    medicineId: medicine.id,
                    quantity: Number(quantity),
                  },
                },
          ],
          edit,
        );
      }}
    >
      <Copy size={20} weight="medium">
        {medicine.name}
      </Copy>
      {!batch && (
        <Field
          label={`Quantity (${medicine.unit})`}
          value={quantity}
          onChange={setQuantity}
          keyboard="decimal-pad"
        />
      )}
      <Field
        label="Expiry date (optional)"
        value={expiry}
        onChange={setExpiry}
        placeholder="YYYY-MM-DD"
      />
      <Field
        label="Acquisition date (optional)"
        value={acquired}
        onChange={setAcquired}
        placeholder="YYYY-MM-DD"
      />
      <Field label="Storage location" value={location} onChange={setLocation} />
      <Field
        label={`Low-stock threshold (${medicine.unit})`}
        value={low}
        onChange={setLow}
        keyboard="decimal-pad"
      />
    </FormDialog>
  );
}
