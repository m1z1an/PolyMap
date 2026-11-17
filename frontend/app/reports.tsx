import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { request } from '../src/api';
import { Button, colors as c } from '../src/controls';
import { loadSnapshot } from '../src/snapshot';
import type { Building } from '../src/model';

const statuses = { new: 'Новая', review: 'На проверке', closed: 'Закрыта' } as const;
type Status = keyof typeof statuses;
type Outcome = 'fixed' | 'not_confirmed';
type Ticket = { id: number; building_id: string | null; place_id: string; message: string; status: Status;
  resolution: string; outcome: Outcome | null; correction_map_version: string | null; place_name: string;
  building_name: string; revision: number; created_at: string; map_version: string };
const pageSize = 30;

export default function Reports() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credential, setCredential] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [status, setStatus] = useState<Status | ''>('');
  const [building, setBuilding] = useState('');
  const [buildingQuery, setBuildingQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSnapshot().then(({ data }) => {
      setBuildings(data.buildings);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!credential) return;
    const controller = new AbortController();
    const search = new URLSearchParams({ offset: String(offset), limit: String(pageSize) });
    if (status) search.set('status', status);
    if (building) search.set('building_id', building);
    setWorking(true);
    setMessage('');
    request<Ticket[]>(`/reports?${search}`, {
      headers: { Authorization: `Bearer ${credential}` }, signal: controller.signal,
    }).then(setTickets).catch(error => {
      if (!controller.signal.aborted) { setTickets([]); setMessage(error.message); }
    }).finally(() => { if (!controller.signal.aborted) setWorking(false); });
    return () => controller.abort();
  }, [credential, status, building, offset, refresh]);

  async function save(ticket: Ticket, next: Status, resolution: string, outcome: Outcome | null, correction_map_version: string | null) {
    const saved = await request<Ticket>(`/reports/${ticket.id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${credential}` },
      body: JSON.stringify({ status: next, resolution, outcome, correction_map_version, revision: ticket.revision }),
    });
    setTickets(previous => status && status !== saved.status
      ? previous.filter(item => item.id !== saved.id)
      : previous.map(item => item.id === saved.id ? saved : item));
    setRefresh(value => value + 1);
  }

  return <ScrollView style={s.page} contentContainerStyle={s.frame} keyboardShouldPersistTaps="handled">
    <Link href="/" style={s.link}>← Карта Политеха</Link>
    <Text style={s.title}>Стол заявок</Text>
    {!credential ? <>
      <TextInput style={s.input} placeholder="Имя сотрудника" accessibilityLabel="Имя сотрудника"
        placeholderTextColor={c.muted} autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput style={s.input} secureTextEntry placeholder="Пароль" accessibilityLabel="Пароль"
        placeholderTextColor={c.muted} autoCapitalize="none" value={password} onChangeText={setPassword} />
      <Button primary label="Войти" disabled={!username.trim() || !password || working} onPress={async () => {
        setWorking(true); setMessage('');
        try {
          const result = await request<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) });
          setCredential(result.token); setPassword(''); setOffset(0);
        } catch (error) { setMessage((error as Error).message); }
        finally { setWorking(false); }
      }} />
      {!!message && <Text accessibilityRole="alert" style={s.muted}>{message}</Text>}
    </> : <Button label="Выйти" onPress={async () => {
      try { await request('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${credential}` } }); }
      catch { /* Clear local credentials even if the session has expired. */ }
      setCredential(''); setTickets([]); setMessage(''); setWorking(false);
    }} />}
    {!!credential && <>
      <Button label="Обновить список" onPress={() => setRefresh(value => value + 1)} />
      <View style={s.row}>
        <Button label="Все статусы" active={!status} onPress={() => { setStatus(''); setOffset(0); }} />
        {(Object.keys(statuses) as Status[]).map(item => <Button key={item} label={statuses[item]}
          active={status === item} onPress={() => { setStatus(item); setOffset(0); }} />)}
      </View>
      <TextInput style={s.input} value={buildingQuery} onChangeText={setBuildingQuery}
        placeholder="Фильтр по корпусу" accessibilityLabel="Фильтр по корпусу" placeholderTextColor={c.muted} />
      <View style={s.row}>
        <Button label="Все корпуса" active={!building} onPress={() => {
          setBuilding(''); setBuildingQuery(''); setOffset(0);
        }} />
        {buildings.filter(item => item.id === building ||
          (buildingQuery.trim() && item.name.toLowerCase().includes(buildingQuery.trim().toLowerCase())))
          .slice(0, 10).map(item => <Button key={item.id} label={item.name} active={building === item.id} onPress={() => {
            setBuilding(item.id); setBuildingQuery(''); setOffset(0);
          }} />)}
      </View>
      {!!message && <Text accessibilityRole="alert" style={s.muted}>{message}</Text>}
      {working ? <Text style={s.muted}>Загружаем заявки…</Text> : <>
        {!tickets.length && !message && <Text style={s.muted}>Заявок по выбранным фильтрам пока нет.</Text>}
        {tickets.map(ticket => <TicketCard key={`${ticket.id}-${ticket.revision}`} ticket={ticket}
          building={ticket.building_name} place={ticket.place_name} onSave={save} />)}
        <View style={s.row}>
          {offset > 0 && <Button label="Предыдущая страница" onPress={() => setOffset(offset - pageSize)} />}
          {tickets.length === pageSize && <Button label="Следующая страница" onPress={() => setOffset(offset + pageSize)} />}
        </View>
      </>}
    </>}
  </ScrollView>;
}

function TicketCard({ ticket, building, place, onSave }: {
  ticket: Ticket; building: string; place: string;
  onSave: (ticket: Ticket, status: Status, resolution: string, outcome: Outcome | null, version: string | null) => Promise<void>;
}) {
  const [resolution, setResolution] = useState(ticket.resolution);
  const [outcome, setOutcome] = useState<Outcome | null>(ticket.outcome);
  const [version, setVersion] = useState(ticket.correction_map_version ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function submit(status: Status) {
    setWorking(true);
    setError('');
    try { await onSave(ticket, status, resolution.trim(), status === 'closed' ? outcome : null,
      status === 'closed' && outcome === 'fixed' ? version.trim() : null); }
    catch (problem) { setError((problem as Error).message); }
    finally { setWorking(false); }
  }
  return <View style={s.card}>
    <Text style={s.heading}>№{ticket.id} · {statuses[ticket.status]}</Text>
    <Text style={s.muted}>{building} · {place} · {new Date(ticket.created_at).toLocaleDateString('ru-RU')}</Text>
    <Text style={s.body}>{ticket.message}</Text>
    <Text style={s.muted}>Исходная версия: {ticket.map_version}</Text>
    {!!ticket.correction_map_version && <Text accessibilityRole="link" style={s.link} onPress={() =>
      Linking.openURL(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/api/maps/${ticket.correction_map_version}/bundle`)}>
      Исправленная версия: {ticket.correction_map_version}</Text>}
    <TextInput style={s.input} value={resolution} onChangeText={setResolution} multiline maxLength={2000}
      accessibilityLabel="Результат проверки" placeholder="Результат проверки" placeholderTextColor={c.muted} />
    <View style={s.row}>
      <Button label="Исправлено" active={outcome === 'fixed'} onPress={() => setOutcome('fixed')} />
      <Button label="Не подтвердилось" active={outcome === 'not_confirmed'} onPress={() => setOutcome('not_confirmed')} />
    </View>
    {outcome === 'fixed' && <TextInput style={s.input} value={version} onChangeText={setVersion} autoCapitalize="none"
      accessibilityLabel="Версия исправленной карты" placeholder="Версия исправленной карты" placeholderTextColor={c.muted} />}
    <View style={s.row}>
      <Button label="На проверку" disabled={working} onPress={() => submit('review')} />
      <Button label="Закрыть заявку" primary disabled={working || !resolution.trim() || !outcome || (outcome === 'fixed' && !/^[a-f0-9]{16}$/.test(version.trim()))} onPress={() => submit('closed')} />
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.muted}>{error}</Text>}
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7f1' },
  frame: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 22, gap: 14 },
  link: { color: c.green, fontWeight: '700', fontSize: 15 },
  title: { color: c.ink, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  input: { borderWidth: 1, borderColor: '#abbfb1', borderRadius: 10, backgroundColor: c.white,
    padding: 12, color: c.ink, fontSize: 16 },
  row: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  card: { padding: 14, gap: 9, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.white },
  heading: { color: c.ink, fontSize: 18, fontWeight: '800' },
  body: { color: c.ink, fontSize: 15, lineHeight: 23 },
  muted: { color: c.muted, fontSize: 13 },
});
