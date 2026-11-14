import { useState } from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { healthTimeline } from '../../application/queries';
import { type Dose, type Episode } from '../../domain/model';
import {
  Button,
  Choice,
  Copy,
  Empty,
  Panel,
  SectionTitle,
} from '../components';
import { CorrectDoseForm } from '../forms/DoseForm';
import {
  ConsultationForm,
  EpisodeForm,
  ObservationForm,
  ResolveForm,
} from '../forms/EpisodeForm';
import { shortDate } from '../format';
import { PageHeading } from '../Shell';
import { useRecords } from '../store';
import { useTheme } from '../theme';
import { Timeline } from '../Timeline';

export function HistoryScreen() {
  const { state } = useRecords();
  const t = useTheme();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState('');
  const [observe, setObserve] = useState<Episode | null>(null);
  const [resolve, setResolve] = useState<Episode | null>(null);
  const [consult, setConsult] = useState<Episode | null>(null);
  const [correction, setCorrection] = useState<Dose | null>(null);
  if (!state) return null;
  const entries = healthTimeline(state, selected || undefined);
  return (
    <>
      <PageHeading
        title="Health history"
        description="One timeline. The details that matter."
      >
        <Button
          label="Start episode"
          icon={Plus}
          onPress={() => setAdding(true)}
        />
      </PageHeading>
      <View
        style={{ flexDirection: t.width >= 1200 ? 'row' : 'column', gap: 32 }}
      >
        <View style={{ flex: 0.9, gap: 16 }}>
          <SectionTitle title="Episodes" />
          {state.episodes.length ? (
            [...state.episodes].reverse().map((episode) => (
              <Panel
                key={episode.id}
                style={{
                  backgroundColor: episode.resolvedAt ? t.surface : t.soft,
                }}
              >
                <Copy
                  size={11}
                  weight="medium"
                  style={{
                    letterSpacing: 0.8,
                    color: episode.resolvedAt ? t.muted : t.accent,
                  }}
                >
                  {episode.resolvedAt ? 'RECOVERED' : 'ACTIVE'}
                </Copy>
                <Copy size={24} weight="display" style={{ marginTop: 12 }}>
                  {episode.title}
                </Copy>
                <Copy muted size={12} style={{ marginTop: 8 }}>
                  {shortDate(episode.onsetAt)}
                  {episode.resolvedAt
                    ? ` - ${shortDate(episode.resolvedAt)}`
                    : ' - ongoing'}
                </Copy>
                {!!episode.notes && (
                  <Copy size={13} style={{ marginTop: 14 }}>
                    {episode.notes}
                  </Copy>
                )}
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 4,
                    marginTop: 16,
                  }}
                >
                  {!episode.resolvedAt && (
                    <>
                      <Button
                        label="Update symptoms"
                        kind="secondary"
                        small
                        onPress={() => setObserve(episode)}
                      />
                      <Button
                        label="Mark recovered"
                        kind="quiet"
                        small
                        onPress={() => setResolve(episode)}
                      />
                    </>
                  )}
                  <Button
                    label="Consultation"
                    kind="quiet"
                    small
                    onPress={() => setConsult(episode)}
                  />
                  <Button
                    label="View timeline"
                    kind="quiet"
                    small
                    onPress={() => setSelected(episode.id)}
                  />
                </View>
              </Panel>
            ))
          ) : (
            <Empty
              title="A clearer picture over time"
              detail="Start an episode when symptoms begin. Add observations as things change, then mark your recovery."
            />
          )}
        </View>
        <View style={{ flex: 1.2 }}>
          <View style={{ marginBottom: 24 }}>
            <Choice
              label="Timeline"
              value={selected}
              onChange={setSelected}
              options={[
                { value: '', label: 'All records' },
                ...state.episodes.map((episode) => ({
                  value: episode.id,
                  label: episode.title,
                })),
              ]}
            />
          </View>
          {entries.length ? (
            <Timeline
              entries={entries}
              doses={state.doses}
              onCorrect={setCorrection}
            />
          ) : (
            <Empty
              title="No records yet"
              detail="Your dose records, symptoms, consultations, and recoveries appear here."
            />
          )}
        </View>
      </View>
      {adding && <EpisodeForm onClose={() => setAdding(false)} />}
      {observe && (
        <ObservationForm episode={observe} onClose={() => setObserve(null)} />
      )}
      {resolve && (
        <ResolveForm episode={resolve} onClose={() => setResolve(null)} />
      )}
      {consult && (
        <ConsultationForm episode={consult} onClose={() => setConsult(null)} />
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
