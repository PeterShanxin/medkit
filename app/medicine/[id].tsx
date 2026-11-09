import { useLocalSearchParams } from 'expo-router';
import { MedicineScreen } from '../../src/ui/screens/MedicineScreen';
export default function MedicineRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MedicineScreen id={id} />;
}
