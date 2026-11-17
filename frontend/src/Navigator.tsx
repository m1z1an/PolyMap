import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CampusMap from './CampusMap';
import { Button, colors as c } from './controls';
import { searchPlaces, type Building, type Coordinates, type Place, type Snapshot } from './model';
import { createRouter, routeShapes } from './route';
import { loadSnapshot } from './snapshot';
import { share } from './share';
import { request } from './api';

const empty: never[] = [];
const pick = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value)?.toLowerCase();

export default function Navigator() {
  const params = useLocalSearchParams();
  const annotation = pick(params.annotation);
  const sharedFrom = pick(params.from);
  const sharedTo = pick(params.to);
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [failure, setFailure] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [buildingId, setBuilding] = useState<string | null>(null);
  const [floorId, setFloor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Place>();
  const [from, setFrom] = useState<Place>();
  const [to, setTo] = useState<Place>();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [asphalt, setAsphalt] = useState(pick(params.asphalt) !== 'false');
  const [serviceRoute, setServiceRoute] = useState(pick(params.serviceRoute) === 'true');
  const [focus, setFocus] = useState<{ points: Coordinates[]; zoom: number }>({ points: [], zoom: 15.4 });
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteMode, setFavoriteMode] = useState(false);
  const [report, setReport] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [copyPath, setCopyPath] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let current = true;
    setFailure(false);
    loadSnapshot().then(value => { if (current) setSnapshot(value); })
      .catch(() => { if (current) setFailure(true); });
    return () => { current = false; };
  }, [retry]);

  useEffect(() => {
    AsyncStorage.getItem('polymap-favorites').then(value => {
      if (value) setFavorites(JSON.parse(value));
    }).catch(() => {});
  }, []);

  const data = snapshot?.data;
  const building = data?.buildings.find(item => item.id === buildingId);
  const floor = building?.floors.find(item => item.id === floorId);
  const places = data?.places ?? empty;
  const buildings = data?.buildings ?? empty;
  const byId = useMemo(() => new Map(places.map(place => [place.id.toLowerCase(), place])), [places]);
  const computeRoute = useMemo(() => data && createRouter(data), [data]);
  const route = useMemo(() => from && to && computeRoute ? computeRoute(from, to, { asphalt, serviceRoute }) : null,
    [from, to, computeRoute, asphalt, serviceRoute]);
  const results = useMemo(() => query.trim() ? searchPlaces(places, buildings, query, buildingId)
    : favoriteMode ? places.filter(place => favorites.includes(place.id)) : empty, [places, buildings, query, buildingId, favoriteMode, favorites]);

  const floorGeometry = useMemo(() => {
    const primary = new Map(places.filter(place => place.level === floorId && place.unit)
      .map(place => [place.unit, place.id]));
    return floor?.geometry.map(shape => {
      const place = primary.get(String(shape.id));
      return place ? { ...shape, properties: { ...shape.properties, place } } : shape;
    }) ?? empty;
  }, [floor, floorId, places]);
  const mapPlaces = useMemo(() => places.filter(place => floorId
    ? place.level === floorId : !place.level && (place.building || buildingId === place.building && selected?.id === place.id)),
  [places, floorId, buildingId, selected]);
  const lines = useMemo(() => routeShapes(route, floorId), [route, floorId]);

  function goToPlace(place: Place) {
    const target = buildings.find(item => item.id === place.building);
    setBuilding(target?.id ?? null);
    setFloor(place.level ?? target?.floors.find(item => item.ordinal === 1)?.id ?? target?.floors[0]?.id ?? null);
    setFocus({ points: [place.position], zoom: place.level ? (compact ? 19.6 : 20.1) : 18.2 });
  }

  useEffect(() => {
    if (!data || (!annotation && !sharedFrom && !sharedTo)) return;
    if (annotation) {
      const place = byId.get(annotation);
      if (place) { setSelected(place); goToPlace(place); }
      else setNotice('Место из ссылки отсутствует в этой версии карты.');
    } else {
      const start = byId.get(sharedFrom ?? '');
      const end = byId.get(sharedTo ?? '');
      if (start && end) { setFrom(start); setTo(end); }
      else setNotice('Одна из точек маршрута отсутствует в этой версии карты.');
    }
  }, [data, byId, annotation, sharedFrom, sharedTo]);

  useEffect(() => {
    if (route?.segments.length) {
      const first = route.segments[0];
      setBuilding(first.building ?? buildings.find(b => b.floors.some(f => f.id === first.floor))?.id ?? null);
      setFloor(first.floor);
      setFocus({ points: first.points, zoom: first.floor ? 20.6 : 18.6 });
    }
  }, [route, buildings]);

  function choose(place: Place) {
    setQuery('');
    setNotice('');
    setCopyPath('');
    setReport(false);
    if (picking === 'from') setFrom(place);
    else if (picking === 'to') setTo(place);
    else { setSelected(place); goToPlace(place); }
    setPicking(null);
  }

  function chooseBuilding(target: Building) {
    const place = places.find(item => item.building === target.id && !item.level);
    if (place) { choose(place); return; }
    setSelected(undefined);
    setBuilding(target.id);
    setFloor(target.floors.find(item => item.ordinal === 1)?.id ?? target.floors[0]?.id ?? null);
    if (target.position) setFocus({ points: [target.position], zoom: 18.8 });
  }

  function reset() {
    setQuery(''); setSelected(undefined); setFrom(undefined); setTo(undefined); setPicking(null);
    setFloor(null); setBuilding(null); setFocus({ points: [[30.3759, 60.0076]], zoom: 15.4 });
    setReport(false); setNotice(''); setCopyPath(''); setFavoriteMode(false);
  }

  function toggleFavorite() {
    if (!selected) return;
    const ids = favorites.includes(selected.id) ? favorites.filter(id => id !== selected.id) : [...favorites, selected.id];
    setFavorites(ids);
    AsyncStorage.setItem('polymap-favorites', JSON.stringify(ids)).catch(() => setNotice('Не удалось сохранить избранное.'));
  }

  async function copy(path: string) {
    try {
      if (await share(path)) setNotice('Ссылка готова к отправке.');
      else setCopyPath(new URL(path, location.origin).href);
    } catch { setNotice('Не удалось поделиться ссылкой.'); }
  }

  async function sendReport() {
    if (!selected || !snapshot || sending || message.trim().length < 10) return;
    setSending(true);
    setNotice('');
    try {
      const result = await request<{ id: number }>('/reports', { method: 'POST', body: JSON.stringify({
        map_version: snapshot.version, building_id: selected.building, place_id: selected.id, message: message.trim(),
      }) });
      setMessage('');
      setReport(false);
      setNotice(`Сообщение отправлено. Номер заявки: №${result.id}`);
    } catch (error) { setNotice((error as Error).message); }
    finally { setSending(false); }
  }

  const listedBuildings = useMemo(() => buildings.filter(item => item.floors.length)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true })), [buildings]);
  const buildingName = (id: string | null) => buildings.find(item => item.id === id)?.name;
  const levelName = (id: string | null) => buildings.flatMap(item => item.floors).find(item => item.id === id)?.name;
  const placeContext = (place: Place) => [place.level && buildingName(place.building), place.level && `этаж ${levelName(place.level)}`]
    .filter(Boolean).join(' · ') || (place.level ? '' : 'Кампус');

  return <View style={s.root}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="PolyMap — к карте кампуса" onPress={reset} style={s.brand}>
        <View style={s.glyph}><Text style={s.glyphText}>P</Text></View>
        <View><Text style={s.brandText}>PolyMap</Text><Text style={s.brandSub}>СПбПУ · Навигация</Text></View>
      </Pressable>
      <View style={s.row}>
        <Link href="/reports" style={s.headerLink}>Стол заявок</Link>
      </View>
    </View>
    <View style={[s.body, compact && s.compact]}>
      <View style={[s.sidebar, compact && s.mobileSidebar]}>
        <View style={s.search}>
          {!compact && <Text style={s.title}>Карта Политеха</Text>}
          <TextInput accessibilityLabel="Поиск аудитории, корпуса или места" placeholder={picking === 'from'
            ? 'Выберите точку отправления' : picking === 'to' ? 'Выберите точку назначения' : 'Аудитория, корпус или место'}
            value={query} onChangeText={setQuery} style={s.input} placeholderTextColor={c.muted}
            autoCorrect={false} autoCapitalize="none" />
          <View style={s.row}>
            <Button label="Кампус" onPress={reset} active={!building && !picking} />
            <Button label="Избранное" active={favoriteMode} onPress={() => { setFavoriteMode(!favoriteMode); setQuery(''); setSelected(undefined); }} />
            {picking && <Button label="Отмена" onPress={() => { setPicking(null); setQuery(''); }} />}
          </View>
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {!snapshot && (failure ? <View style={s.card}>
            <Text style={s.text}>Не удалось загрузить карту.</Text><Button label="Повторить" onPress={() => setRetry(retry + 1)} />
          </View> : <ActivityIndicator color={c.green} accessibilityLabel="Загрузка карты" />)}
          {!!notice && <Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
          {!!copyPath && <Text selectable style={s.notice}>{copyPath}</Text>}
          {snapshot && (query.trim() || favoriteMode || picking ? <>
            <Text style={s.section}>{query.trim() ? 'Результаты поиска' : favoriteMode ? 'Избранные места' : 'Точка маршрута'}</Text>
            {!results.length && <Text style={s.muted}>{query.trim() ? 'Места не найдены.' :
              favoriteMode ? 'Здесь появятся сохранённые места.' : 'Введите название или номер аудитории.'}</Text>}
            {results.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => choose(place)} style={s.result}>
              <Text style={s.resultTitle}>{place.name}</Text><Text style={s.muted}>{placeContext(place)}</Text>
            </Pressable>)}
          </> : <>
            {(from || to) && <View style={s.card}>
              <Text style={s.section}>Маршрут</Text>
              <Button label={from ? `Откуда · ${from.name}` : 'Указать точку отправления'} onPress={() => setPicking('from')} />
              <Button label={to ? `Куда · ${to.name}` : 'Указать точку назначения'} onPress={() => setPicking('to')} />
              <View style={s.row}>
                <Button label="По асфальту" active={asphalt} onPress={() => setAsphalt(!asphalt)} />
                <Button label="Служебные проходы" active={serviceRoute} onPress={() => setServiceRoute(!serviceRoute)} />
              </View>
              {from && to && (route ? <>
                <Text testID="route-summary" style={s.metric}>{route.meters} м · {route.minutes} мин пешком</Text>
                {route.segments.map((segment, index) => <Button key={index}
                  active={floorId === segment.floor}
                  label={segment.floor ? `${buildingName(segment.building) ?? 'Корпус'} · этаж ${levelName(segment.floor)}` : 'По кампусу'}
                  onPress={() => {
                    setFloor(segment.floor);
                    setBuilding(segment.building ?? buildings.find(item => item.floors.some(item => item.id === segment.floor))?.id ?? null);
                    setFocus({ points: segment.points, zoom: segment.floor ? 20.6 : 18.6 });
                  }} />)}
                <Button label="Скопировать ссылку на маршрут" onPress={() => copy(`/share/route?from=${from.id}&to=${to.id}&asphalt=${asphalt}&serviceRoute=${serviceRoute}`)} />
              </> : <Text style={s.muted}>{from.id === to.id ? 'Выберите разные точки.' : 'Между точками нет пути в графе PolyMap.'}</Text>)}
              <Button label="Очистить маршрут" onPress={() => { setFrom(undefined); setTo(undefined); setNotice(''); setCopyPath(''); }} />
            </View>}
            {selected && <View style={s.card}>
              <Text style={s.muted}>{placeContext(selected)}</Text>
              <Text style={s.placeTitle} testID="place-title">{selected.name}</Text>
              {!!selected.address && <Text style={s.muted}>{selected.address}</Text>}
              {!!selected.description && <Text style={s.text}>{selected.description}</Text>}
              {selected.building && !buildings.find(b => b.id === selected.building)?.floors.length &&
                <Text style={s.muted}>Для этого корпуса в PolyMap пока доступна карта кампуса.</Text>}
              <View style={s.row}>
                <Button primary label="Маршрут сюда" onPress={() => {
                  setFrom(from ?? byId.get(data?.defaultStart.toLowerCase() ?? '')); setTo(selected); setNotice(''); setCopyPath('');
                }} />
                <Button label={favorites.includes(selected.id) ? 'Убрать из избранного' : 'В избранное'} onPress={toggleFavorite} />
              </View>
              <View style={s.row}>
                <Button label="Ссылка на место" onPress={() => copy(`/share/annotation?annotation=${selected.id}`)} />
                <Button label="Сообщить об ошибке" onPress={() => setReport(!report)} />
              </View>
              {report && <>
                <TextInput accessibilityLabel="Описание ошибки на карте" placeholder="Что нужно исправить?" style={[s.input, { minHeight: 80 }]}
                  value={message} onChangeText={setMessage} multiline maxLength={2000} placeholderTextColor={c.muted} />
                <Button primary label={sending ? 'Отправляем…' : 'Отправить'} disabled={sending || message.trim().length < 10} onPress={sendReport} />
              </>}
            </View>}
            <Text style={s.section}>Корпуса с планами</Text>
            {listedBuildings.map(target => <Pressable key={target.id} onPress={() => chooseBuilding(target)}
              accessibilityRole="button" style={[s.result, target.id === buildingId && s.activeResult]}>
              <View style={s.resultIcon}><Text style={s.resultIconText}>⌂</Text></View>
              <View style={s.resultBody}><Text style={s.resultTitle}>{target.name}</Text>
                <Text style={s.muted}>Этажей на карте — {target.floors.length}</Text></View>
              <Text style={s.arrow}>›</Text>
            </Pressable>)}
          </>)}
        </ScrollView>
      </View>
      <View style={[s.map, compact && s.mobileMap]}>
        {data && <CampusMap campus={data.campus} floor={floorGeometry} lines={lines} places={mapPlaces}
          selected={selected?.id} focus={focus} onPlace={id => { const place = byId.get(id); if (place) choose(place); }} />}
        <View style={[s.overlay, compact && { top: 10, left: 10, right: 10 }]} pointerEvents="box-none">
          <View style={s.mapCaption} pointerEvents="none">
            <Text numberOfLines={1} style={s.mapText}>{building?.name ?? 'Кампус СПбПУ'}</Text>
            <Text style={s.muted}>{floor ? `Этаж ${floor.name}` : 'Карта территории'}</Text>
          </View>
          {!!building?.floors.length && <View style={s.floors}>
            {building.floors.map(item => <Button key={item.id} label={`Этаж ${item.name}`} active={item.id === floorId}
              onPress={() => setFloor(item.id)} />)}
          </View>}
        </View>
        <View style={s.credit} pointerEvents="none"><Text style={s.creditText}>Планы и граф · PolyMap СПбПУ</Text></View>
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'android' ? 20 : 0, backgroundColor: c.dark },
  header: { minHeight: 65, paddingHorizontal: 22, paddingVertical: 9, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: c.dark },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  glyph: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.lime },
  glyphText: { color: c.dark, fontSize: 24, lineHeight: 29, fontWeight: '900' },
  brandText: { color: 'white', fontSize: 21, fontWeight: '800', letterSpacing: -0.7 },
  brandSub: { color: '#d4e5da', fontSize: 11 },
  headerLink: { color: '#ecf4eb', fontSize: 13, fontWeight: '600', padding: 8 },
  body: { flex: 1, flexDirection: 'row', backgroundColor: '#f5f7f1', minHeight: 0 },
  compact: { flexDirection: 'column-reverse' },
  sidebar: { width: 365, borderRightWidth: 1, borderColor: c.border, backgroundColor: '#f5f7f1', minHeight: 0 },
  mobileSidebar: { width: '100%', flex: 1, borderRightWidth: 0, borderTopWidth: 1 },
  search: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 11, gap: 8, borderBottomWidth: 1, borderColor: c.border },
  title: { color: c.ink, fontSize: 31, letterSpacing: -1.25, fontWeight: '800' },
  input: { borderRadius: 10, borderWidth: 1, borderColor: '#abbfb1', backgroundColor: c.white, color: c.ink,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, minHeight: 43 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  scroll: { flex: 1 },
  content: { padding: 15, gap: 8, paddingBottom: 24 },
  section: { fontSize: 15, fontWeight: '800', color: c.ink, marginVertical: 4 },
  card: { padding: 13, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.white, gap: 8 },
  text: { color: c.ink, fontSize: 14, lineHeight: 20 },
  muted: { color: c.muted, fontSize: 12, lineHeight: 17 },
  placeTitle: { color: c.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  result: { padding: 11, gap: 8, minHeight: 54, borderRadius: 11, borderWidth: 1, borderColor: c.border, backgroundColor: c.white },
  activeResult: { backgroundColor: '#ebf4d5', borderColor: '#a8c27c' },
  resultTitle: { fontSize: 14, fontWeight: '700', color: c.ink },
  resultBody: { marginTop: -34, marginLeft: 37, marginRight: 17 },
  resultIcon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: c.pale },
  resultIconText: { fontSize: 19, fontWeight: '700', color: c.green },
  arrow: { position: 'absolute', right: 11, top: 13, color: c.green, fontSize: 21 },
  notice: { padding: 10, backgroundColor: '#e9efdb', borderRadius: 8, color: c.ink },
  metric: { fontSize: 17, color: c.green, fontWeight: '800', paddingVertical: 3 },
  map: { flex: 1, overflow: 'hidden', position: 'relative', backgroundColor: '#e8eee5' },
  mobileMap: { flex: 0.92 },
  overlay: { position: 'absolute', top: 17, left: 17, right: 17, flexDirection: 'row', gap: 7, alignItems: 'flex-start', flexWrap: 'wrap' },
  mapCaption: { backgroundColor: c.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderColor: c.border, borderWidth: 1, maxWidth: '100%' },
  mapText: { color: c.ink, fontSize: 14, fontWeight: '800' },
  floors: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  credit: { position: 'absolute', bottom: 7, left: 7, padding: 4, backgroundColor: c.white, borderRadius: 4 },
  creditText: { color: c.muted, fontSize: 10 },
});
