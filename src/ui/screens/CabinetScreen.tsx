import { Pressable } from '../interaction';
import { useState } from 'react';
import { router } from 'expo-router';
import { TextInput, View } from 'react-native';
import {
  ArrowUpRight,
  Droplets,
  Pill,
  Plus,
  Search,
} from 'lucide-react-native';
import { medicineStock, searchMedicines } from '../../application/queries';
import { Button, Copy, Empty } from '../components';
import { MedicineForm } from '../forms/MedicineForm';
import { PageHeading } from '../Shell';
import { useRecords } from '../store';
import { fonts, useTheme } from '../theme';

export function CabinetScreen() {
  const { state } = useRecords();
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [adding, setAdding] = useState(false);
  if (!state) return null;
  const medicines = searchMedicines(state, query, filter === 'Archived').filter(
    (medicine) => {
      const stock = medicineStock(state, medicine.id);
      if (filter === 'Archived') return medicine.archived;
      if (medicine.archived) return false;
      if (filter === 'Available') return stock.available > 0;
      if (filter === 'Expired') return stock.expired > 0;
      if (filter === 'Low stock')
        return state.batches.some(
          (batch) =>
            batch.medicineId === medicine.id &&
            !batch.discarded &&
            batch.quantity <= batch.lowStockAt,
        );
      return true;
    },
  );
  const columns = t.width >= 1450 ? 3 : t.width >= 700 ? 2 : 1;
  return (
    <>
      <PageHeading
        title="Medicine cabinet"
        description={`${state.medicines.filter((item) => !item.archived).length} medicines · ${state.batches.filter((item) => !item.discarded).length} batches`}
      >
        <Button
          label="Add medicine"
          icon={Plus}
          onPress={() => setAdding(true)}
        />
      </PageHeading>
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          backgroundColor: t.surface,
          borderRadius: 13,
          paddingHorizontal: 18,
          marginBottom: 20,
        }}
      >
        <Search size={19} color={t.muted} />
        <TextInput
          accessibilityLabel="Search medicines"
          placeholder="Search names or ingredients"
          placeholderTextColor={t.muted}
          value={query}
          onChangeText={setQuery}
          style={{
            flex: 1,
            minHeight: 54,
            fontFamily: fonts.regular,
            fontSize: 15,
            color: t.ink,
          }}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 26,
        }}
      >
        {['All', 'Available', 'Low stock', 'Expired', 'Archived'].map(
          (name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === name }}
              onPress={() => setFilter(name)}
              style={{
                paddingHorizontal: 17,
                minHeight: 44,
                borderRadius: 22,
                justifyContent: 'center',
                backgroundColor: filter === name ? t.accent : 'transparent',
              }}
            >
              <Copy
                size={13}
                weight={filter === name ? 'medium' : 'regular'}
                style={{ color: filter === name ? t.onAccent : t.muted }}
              >
                {name}
              </Copy>
            </Pressable>
          ),
        )}
      </View>
      {medicines.length ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginHorizontal: -9,
          }}
        >
          {medicines.map((medicine) => {
            const stock = medicineStock(state, medicine.id);
            const lowStock = state.batches.some(
              (batch) =>
                batch.medicineId === medicine.id &&
                !batch.discarded &&
                batch.quantity <= batch.lowStockAt,
            );
            const ingredient = medicine.ingredients[0];
            const Icon = ['mL', 'drop'].includes(medicine.unit)
              ? Droplets
              : Pill;
            return (
              <View
                key={medicine.id}
                style={{ width: `${100 / columns}%`, padding: 9 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${medicine.name}`}
                  onPress={() =>
                    router.push({
                      pathname: '/medicine/[id]',
                      params: { id: medicine.id },
                    })
                  }
                  style={({ hovered, pressed }) => ({
                    backgroundColor: hovered ? t.soft : t.surface,
                    borderRadius: 20,
                    padding: 25,
                    minHeight: 255,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginBottom: 24,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: t.soft,
                        width: 45,
                        height: 45,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={25} color={t.accent} strokeWidth={1.25} />
                    </View>
                    <ArrowUpRight size={17} color={t.muted} />
                  </View>
                  <Copy
                    size={21}
                    weight="medium"
                    style={{ letterSpacing: -0.5 }}
                  >
                    {medicine.name}
                  </Copy>
                  <Copy muted size={12} style={{ marginTop: 5 }}>
                    {ingredient
                      ? `${ingredient.amount ?? '?'} ${ingredient.unit} / ${ingredient.per} ${medicine.unit}${medicine.ingredients.length > 1 ? ` · ${medicine.ingredients.length} ingredients` : ''}`
                      : 'Ingredients not recorded'}{' '}
                    · {medicine.form}
                  </Copy>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      marginTop: 28,
                    }}
                  >
                    <Copy size={14} weight="medium">
                      {stock.total} {medicine.unit}
                    </Copy>
                    <Copy
                      size={11}
                      style={{
                        color: medicine.archived
                          ? t.muted
                          : stock.expired
                            ? t.danger
                            : lowStock
                              ? t.warning
                              : t.muted,
                      }}
                    >
                      {medicine.archived
                        ? 'Archived'
                        : stock.expired
                          ? 'Expired stock'
                          : stock.unknownExpiry
                            ? 'Check expiry'
                            : stock.total === 0
                              ? 'Out of stock'
                              : lowStock
                                ? 'Low stock'
                                : 'In cabinet'}
                    </Copy>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <Empty
          title={
            query || filter !== 'All'
              ? 'No matching medicines'
              : 'A home for your medicines'
          }
          detail={
            query || filter !== 'All'
              ? 'Try a different name, ingredient, or filter.'
              : 'Add a package to keep its ingredients, quantity, and expiry close at hand.'
          }
          action={
            <Button
              label="Add medicine"
              icon={Plus}
              onPress={() => setAdding(true)}
            />
          }
        />
      )}
      {adding && <MedicineForm onClose={() => setAdding(false)} />}
    </>
  );
}
