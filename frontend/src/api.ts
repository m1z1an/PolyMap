const base = process.env.EXPO_PUBLIC_API_URL ?? '';

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(base + '/api' + path, {
    ...options, headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'Проверьте ключ доступа' :
    response.status === 409 ? 'Заявку уже обновили. Обновите список.' : 'Сервис заявок сейчас недоступен');
  return response.json();
}
