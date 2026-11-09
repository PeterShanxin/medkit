import { useState } from 'react';
import { Linking, View } from 'react-native';
import { ArrowUpRight, ClipboardList, ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import { assessRecords } from '../../application/advisor';
import {
  consultationSummary,
  medicationContext,
} from '../../application/queries';
import { localDate } from '../../domain/model';
import { saveExport } from '../../storage/export-file';
import {
  Button,
  Copy,
  Field,
  Notice,
  Panel,
  SectionTitle,
  Toggle,
} from '../components';
import { PageHeading } from '../Shell';
import { useRecords } from '../store';
import { useTheme } from '../theme';

export function AdvisorScreen() {
  const { state } = useRecords();
  const t = useTheme();
  const [question, setQuestion] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [error, setError] = useState('');
  if (!state) return null;
  const assessment = assessRecords(state, undefined, urgent);
  const context = medicationContext(state);
  return (
    <>
      <PageHeading
        title="A clearer perspective"
        description="A local review of your records. No data is sent to AI."
      />
      <Panel style={{ backgroundColor: t.soft, marginBottom: 26 }}>
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <ShieldCheck size={21} color={t.accent} />
          <Copy weight="medium">Before considering a medicine</Copy>
        </View>
        <Field
          label="Question for your pharmacist (optional)"
          value={question}
          onChange={(value) => {
            setQuestion(value);
            setReviewed(false);
          }}
          placeholder="e.g. Which medicines in my cabinet should I discuss with a pharmacist?"
          hint="Included in your consultation export. Not interpreted or saved."
          multiline
        />
        <View style={{ marginTop: 16 }}>
          <Toggle
            label="I have severe symptoms that may need urgent care"
            hint="For example, severe breathing difficulty, chest pain, or collapse."
            value={urgent}
            onChange={setUrgent}
          />
        </View>
        {urgent && (
          <View style={{ marginTop: 16 }}>
            <Notice danger>
              Seek urgent medical help now. In Singapore, call 995 for a medical
              emergency. Do not wait for this record review.
            </Notice>
          </View>
        )}
        <View style={{ marginTop: 18 }}>
          <Button
            label="Review my records"
            icon={ClipboardList}
            onPress={() => setReviewed(true)}
          />
        </View>
      </Panel>
      {reviewed && (
        <View style={{ marginBottom: 25, gap: 12 }}>
          <Copy size={25} weight="display">
            {assessment.headline}
          </Copy>
          <Notice>
            MedKit cannot determine which medicine is suitable. There is no
            validated medicine reference database connected. Take the findings
            and your recent doses to a pharmacist or clinician.
          </Notice>
          <Copy muted size={13}>
            {context.activePlans.length} active plans ·{' '}
            {
              context.recentDoses.filter(
                (dose) => !dose.voidedAt && dose.outcome === 'taken',
              ).length
            }{' '}
            confirmed dose records in the last 7 days ·{' '}
            {context.activeEpisodes.length} active episodes
          </Copy>
        </View>
      )}
      <SectionTitle title="Things to review">
        <Copy size={12} muted>
          {assessment.findings.length} findings
        </Copy>
      </SectionTitle>
      {assessment.findings.length ? (
        <View>
          {assessment.findings.map((finding, index) => (
            <View
              key={`${finding.code}-${index}`}
              style={{
                paddingVertical: 21,
                borderTopWidth: 1,
                borderColor: t.line,
                flexDirection: 'row',
                gap: 16,
              }}
            >
              <View
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 9,
                  backgroundColor:
                    finding.level === 'attention' ? t.warningBg : t.soft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Copy
                  size={14}
                  weight="bold"
                  style={{
                    color: finding.level === 'attention' ? t.warning : t.accent,
                  }}
                >
                  {finding.level === 'attention' ? '!' : '?'}
                </Copy>
              </View>
              <View style={{ flex: 1 }}>
                <Copy weight="medium">{finding.title}</Copy>
                <Copy muted size={13} style={{ marginTop: 6, maxWidth: 720 }}>
                  {finding.detail}
                </Copy>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Notice>
          No issues were found by the available record checks. This does not
          establish that a medicine or combination is safe.
        </Notice>
      )}
      <View style={{ marginTop: 28, gap: 12 }}>
        <SectionTitle title="Prepare for a conversation" />
        <Copy muted size={14} style={{ maxWidth: 640 }}>
          Bring a summary of your active plans, actual recent doses, allergies,
          and health episodes. Your clinician can review what the app cannot.
        </Copy>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button
            label="Export consultation summary"
            kind="secondary"
            onPress={() =>
              void saveExport(
                `medkit-consultation-${localDate()}.txt`,
                (question.trim()
                  ? `QUESTION FOR YOUR PHARMACIST\n${question.trim()}\n\n`
                  : '') + consultationSummary(state),
                'text/plain',
              ).catch(() =>
                setError(
                  'The summary could not be exported. Please try again.',
                ),
              )
            }
          />
          <Button
            label="Update safety context"
            kind="quiet"
            onPress={() => router.push('/settings')}
          />
        </View>
        {error && <Notice danger>{error}</Notice>}
      </View>
      <View style={{ marginTop: 32, gap: 10 }}>
        <Copy size={12} muted>
          {assessment.limitations.join(' ')}
        </Copy>
        <Button
          label="HealthHub medicine information"
          kind="quiet"
          small
          icon={ArrowUpRight}
          onPress={() =>
            void Linking.openURL(
              'https://www.healthhub.sg/medication-devices-and-treatment/medications',
            ).catch(() =>
              setError('The reference could not open. Check your connection.'),
            )
          }
        />
      </View>
    </>
  );
}
