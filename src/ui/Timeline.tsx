import { View } from 'react-native';
import {
  Activity,
  Check,
  ClipboardList,
  Pill,
  Stethoscope,
  Undo2,
} from 'lucide-react-native';
import { type TimelineEntry } from '../application/queries';
import { type Dose } from '../domain/model';
import { Button, Copy } from './components';
import { shortDate, timeLabel } from './format';
import { useTheme } from './theme';

const icons = {
  episode: Activity,
  symptom: Activity,
  dose: Pill,
  recovery: Check,
  correction: Undo2,
  plan: ClipboardList,
  consultation: Stethoscope,
};

export function Timeline({
  entries,
  doses = [],
  onCorrect,
}: {
  entries: TimelineEntry[];
  doses?: Dose[];
  onCorrect?(dose: Dose): void;
}) {
  const t = useTheme();
  return (
    <View>
      {entries.map((entry, index) => {
        const Icon = icons[entry.kind];
        const dose = doses.find((item) => item.id === entry.doseId);
        const differentDay =
          index === 0 ||
          shortDate(entries[index - 1]!.at) !== shortDate(entry.at);
        return (
          <View key={entry.id}>
            {differentDay && (
              <Copy
                size={11}
                muted
                weight="medium"
                style={{
                  marginTop: index ? 22 : 0,
                  marginBottom: 17,
                  letterSpacing: 0.6,
                }}
              >
                {shortDate(entry.at).toUpperCase()}
              </Copy>
            )}
            <View style={{ flexDirection: 'row', gap: 16, paddingBottom: 20 }}>
              <View style={{ alignItems: 'center', width: 36 }}>
                <View
                  style={{
                    backgroundColor: t.soft,
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={17} color={t.accent} strokeWidth={1.7} />
                </View>
                {index < entries.length - 1 && (
                  <View
                    style={{
                      width: 1,
                      backgroundColor: t.line,
                      flex: 1,
                      marginTop: 8,
                      marginBottom: -13,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Copy weight="medium" style={{ flex: 1 }}>
                    {entry.title}
                  </Copy>
                  <Copy size={11} muted>
                    {timeLabel(entry.at)}
                  </Copy>
                </View>
                <Copy muted size={13}>
                  {entry.detail}
                </Copy>
                {dose && !dose.voidedAt && onCorrect && (
                  <Button
                    small
                    label="Correct record"
                    kind="quiet"
                    onPress={() => onCorrect(dose)}
                  />
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
