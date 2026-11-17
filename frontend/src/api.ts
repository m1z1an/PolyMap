const base = process.env.EXPO_PUBLIC_API_URL ?? '';

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(base + '/api' + path, {
    ...options, headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(response.status === 401 ? 'Проверьте имя сотрудника и пароль или войдите снова' :
      response.status === 409 ? 'Заявку уже обновили. Обновите список.' :
      response.status === 422 && typeof body?.detail === 'string' ? body.detail : 'Сервис заявок сейчас недоступен');
  }
  return response.json();
}
