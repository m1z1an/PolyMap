import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
export default function Html({ children }: PropsWithChildren) {
  return <html lang="ru"><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#123b30" />
    <meta name="description" content="Карта кампуса Политеха, поиск аудиторий и маршруты по этажам." />
    <title>PolyMap — навигация по Политеху</title>
    <link rel="stylesheet" href="/polymap.css" />
    <ScrollViewStyleReset />
  </head><body>{children}</body></html>;
}
