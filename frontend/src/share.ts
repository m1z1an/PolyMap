import { Share } from 'react-native';
import * as Linking from 'expo-linking';
export async function share(path: string) {
  const origin = process.env.EXPO_PUBLIC_WEB_URL;
  await Share.share({ message: origin ? new URL(path, origin).href : Linking.createURL(path) });
  return true;
}
