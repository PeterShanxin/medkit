import { router } from 'expo-router';
import { Button, Empty } from '../src/ui/components';
export default function NotFound() {
  return (
    <Empty
      title="Page not found"
      detail="Your records are still here."
      action={
        <Button label="Back to Today" onPress={() => router.replace('/')} />
      }
    />
  );
}
