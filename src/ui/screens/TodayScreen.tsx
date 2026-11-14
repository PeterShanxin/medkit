import { Pressable } from '../interaction';
import { useState } from 'react';
import { Link, router } from 'expo-router';
import { View } from 'react-native';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CirclePlus,
  Pill,
  Plus,
  Sprout,
} from 'lucide-react-native';
import {
  activeMedications,
  healthTimeline,
  inventoryAlerts,
  recentDoses,
} from '../../application/queries';
import { type Episode, type Regimen } from '../../domain/model';
import { Button, Copy, Empty, Panel, SectionTitle } from '../components';
import { DoseForm } from '../forms/DoseForm';
import {
  EpisodeForm,
  ObservationForm,
  ResolveForm,
} from '../forms/EpisodeForm';
import { MedicineForm } from '../forms/MedicineForm';
import { PageHeading } from '../Shell';
import { useRecords } from '../store';
import { useTheme } from '../theme';
import { Timeline } from '../Timeline';

export function TodayScreen() {
  const { state, setMode, mode } = useRecords();
  const t = useTheme();
  const [dialog, setDialog] = useState<'dose' | 'episode' | 'medicine' | null>(
    null,
  );
  const [observe, setObserve] = useState<Episode | null>(null);
  const [resolve, setResolve] = useState<Episode | null>(null);
  const [dosePlan, setDosePlan] = useState<Regimen | null>(null);
  if (!state) return null;
  const episodes = state.episodes.filter((episode) => !episode.resolvedAt);
  const plans = activeMedications(state);
  const alerts = inventoryAlerts(state);
  const entries = healthTimeline(state).slice(0, 4);
  const cabinet = state.medicines.filter((medicine) => !medicine.archived);
  const isNew = !cabinet.length && !state.episodes.length;
  return (
    <>
      <PageHeading title="Today">
        <Button
          label="Record a dose"
          icon={Plus}
          onPress={() => setDialog(cabinet.length ? 'dose' : 'medicine')}
        />
      </PageHeading>
      <View
        style={{
          flexDirection: t.width > 1200 ? 'row' : 'column',
          gap: 24,
          marginBottom: 34,
        }}
      >
        <Panel
          style={{
            flex: t.width > 1200 ? 1.7 : undefined,
            backgroundColor: t.soft,
            padding: t.compact ? 25 : 34,
            minHeight: 245,
          }}
        >
          {episodes.length ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 22,
                }}
              >
                <Copy size={10} weight="bold" style={{ letterSpacing: 1.7 }}>
                  LOOKING AFTER YOU
                </Copy>
                <Sprout size={24} color={t.accent} strokeWidth={1.4} />
              </View>
              <Copy
                size={t.compact ? 29 : 35}
                weight="display"
                style={{ maxWidth: 420, lineHeight: t.compact ? 38 : 45 }}
              >
                {episodes[0]!.title}
              </Copy>
              <Copy muted size={13} style={{ marginTop: 12, marginBottom: 23 }}>
                {state.observations
                  .filter((item) => item.episodeId === episodes[0]!.id)
                  .slice(-1)
                  .map((item) => `${item.symptom} · ${item.severity}`)
                  .join('') || 'No symptom update yet'}
              </Copy>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  label="Update symptoms"
                  kind="primary"
                  small
                  onPress={() => setObserve(episodes[0]!)}
                />
                <Button
                  label="Mark recovered"
                  icon={Check}
                  kind="quiet"
                  small
                  onPress={() => setResolve(episodes[0]!)}
                />
              </View>
              {episodes.length > 1 && (
                <Button
                  label={`View all ${episodes.length} active episodes`}
                  kind="quiet"
                  onPress={() => router.push('/history')}
                />
              )}
            </>
          ) : (
            <>
              <Sprout size={30} color={t.accent} strokeWidth={1.3} />
              <Copy
                size={t.compact ? 30 : 38}
                weight="display"
                style={{ lineHeight: t.compact ? 39 : 48, marginTop: 20 }}
              >
                {isNew
                  ? 'A little care.\nAll in one place.'
                  : 'Space for your\neveryday health.'}
              </Copy>
              <Copy muted size={14} style={{ marginTop: 14, marginBottom: 20 }}>
                {isNew
                  ? 'Start with what’s in your medicine cabinet.'
                  : 'No active episodes recorded.'}
              </Copy>
              <Button
                label={isNew ? 'Add your first medicine' : 'Start an episode'}
                icon={Plus}
                kind="primary"
                onPress={() => setDialog(isNew ? 'medicine' : 'episode')}
              />
            </>
          )}
        </Panel>
        <Panel
          style={{
            flex: t.width > 1200 ? 1 : undefined,
            minWidth: t.compact ? undefined : 250,
          }}
        >
          <SectionTitle title="Your cabinet">
            <Link href="/cabinet" asChild>
              <Pressable
                accessibilityLabel="Open cabinet"
                style={{ padding: 10 }}
              >
                <ArrowUpRight size={19} color={t.muted} />
              </Pressable>
            </Link>
          </SectionTitle>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 9,
              marginBottom: 20,
            }}
          >
            <Copy size={48} weight="display" style={{ lineHeight: 55 }}>
              {cabinet.length}
            </Copy>
            <Copy muted size={14}>
              {cabinet.length === 1 ? 'medicine' : 'medicines'}
            </Copy>
          </View>
          {alerts.length ? (
            alerts.slice(0, 2).map((alert) => (
              <Pressable
                key={`${alert.batchId}-${alert.kind}`}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/medicine/[id]',
                    params: { id: alert.medicineId },
                  })
                }
                style={{
                  borderTopWidth: 1,
                  borderColor: t.line,
                  paddingVertical: 11,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Copy size={13} weight="medium">
                    {alert.medicineName}
                  </Copy>
                  <Copy
                    size={12}
                    style={{
                      color: alert.kind === 'expired' ? t.danger : t.warning,
                    }}
                  >
                    {alert.detail}
                  </Copy>
                </View>
                <ArrowRight size={15} color={t.muted} />
              </Pressable>
            ))
          ) : (
            <Copy muted size={13}>
              {cabinet.length
                ? 'No expiry or stock alerts in your recorded batches.'
                : 'Names, ingredients, stock, and expiry. Ready when you need them.'}
            </Copy>
          )}
          {isNew && mode === 'personal' && (
            <View style={{ marginTop: 17 }}>
              <Button
                label="Explore sample data"
                icon={ArrowRight}
                kind="quiet"
                onPress={() => setMode('demo')}
              />
            </View>
          )}
        </Panel>
      </View>
      <View
        style={{ flexDirection: t.width > 1200 ? 'row' : 'column', gap: 34 }}
      >
        <View style={{ flex: 1.15 }}>
          <SectionTitle title="Medication plans">
            <Button
              label="View all"
              kind="quiet"
              small
              onPress={() => router.push('/plans')}
            />
          </SectionTitle>
          {plans.length ? (
            plans.map((plan) => (
              <View
                key={plan.id}
                style={{
                  paddingVertical: 20,
                  borderTopWidth: 1,
                  borderColor: t.line,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: t.soft,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Pill size={23} color={t.accent} strokeWidth={1.3} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Copy weight="medium">{plan.medicine.name}</Copy>
                  <Copy size={12} muted>
                    {plan.amount} {plan.unit} ·{' '}
                    {plan.kind === 'as-needed'
                      ? 'As needed'
                      : plan.times.join(', ')}
                  </Copy>
                </View>
                <Button
                  label="Record"
                  small
                  kind="secondary"
                  onPress={() => setDosePlan(plan)}
                />
              </View>
            ))
          ) : (
            <Empty
              title="No active plans"
              detail="Keep your instructions here. Record doses separately when you take them."
              action={
                <Button
                  label="Add a plan"
                  icon={Plus}
                  kind="quiet"
                  onPress={() => router.push('/plans')}
                />
              }
            />
          )}
          {!!recentDoses(state).length && (
            <Copy size={12} muted style={{ marginTop: 14 }}>
              Only confirmed doses change your medication history.
            </Copy>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <SectionTitle title="Recently recorded">
            <Button
              label="History"
              kind="quiet"
              small
              onPress={() => router.push('/history')}
            />
          </SectionTitle>
          {entries.length ? (
            <Timeline entries={entries} />
          ) : (
            <Empty
              title="Your story starts here"
              detail="Episodes, symptom updates, and actual doses will form one connected timeline."
              action={
                <Button
                  label="Start an episode"
                  kind="quiet"
                  icon={CirclePlus}
                  onPress={() => setDialog('episode')}
                />
              }
            />
          )}
        </View>
      </View>
      {dialog === 'dose' && <DoseForm onClose={() => setDialog(null)} />}
      {dialog === 'medicine' && (
        <MedicineForm onClose={() => setDialog(null)} />
      )}
      {dialog === 'episode' && <EpisodeForm onClose={() => setDialog(null)} />}
      {observe && (
        <ObservationForm episode={observe} onClose={() => setObserve(null)} />
      )}
      {resolve && (
        <ResolveForm episode={resolve} onClose={() => setResolve(null)} />
      )}
      {dosePlan && (
        <DoseForm plan={dosePlan} onClose={() => setDosePlan(null)} />
      )}
    </>
  );
}
