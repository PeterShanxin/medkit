import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveExport(
  filename: string,
  content: string,
  mime: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      'Sharing is unavailable on this device. Try again when a sharing app is available.',
    );
  const file = new File(Paths.cache, filename);
  try {
    file.create({ overwrite: true });
    file.write(content);
    await Sharing.shareAsync(file.uri, {
      mimeType: mime,
      dialogTitle: 'Export MedKit records',
    });
  } finally {
    if (file.exists) file.delete();
  }
}
