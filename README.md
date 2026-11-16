# PolyMap

Веб-версия навигации по СПбПУ на Expo Router, React Native Web, TypeScript и MapLibre GL JS. Поиск и расчёт маршрута выполняются на устройстве. Один набор данных используется в вебе и в нативной карте MapLibre React Native.

Карты и граф импортированы из [PolyMap СПбПУ](https://github.com/SPBSTU-indoor-navigation/PolyMap/tree/25ca67f6dfe3f780e4120833b6520bf8c7eed1e6/PolyNavi/Resources/IMDFData). Снимок содержит 18 этажей в пяти корпусах и 1307 мест. Идентификаторы мест и формат ссылок `/share/annotation` и `/share/route` сохранены. Наличие корпуса на карте кампуса не гарантирует наличия плана этажей.

## Структура проекта

- `frontend/` — приложение Expo, карты, веб-сборка и тесты Playwright.
- `backend/` — FastAPI, модели PostgreSQL и миграции Alembic.
- `devops/` — Dockerfile для веба и API и конфигурация Docker Compose.

## Запуск с заявками и PostgreSQL

Нужен Docker с Compose. Скопируйте `.env.example` в `.env`, задайте свои значения и запустите:

```sh
docker compose --env-file .env -f devops/compose.yaml up --build
```

Откройте [PolyMap](http://localhost:8080). FastAPI выполнит миграции и опубликует входящий в проект снимок карт. В «Столе заявок» введите значение `POLYMAP_ADMIN_KEY`. Данные PostgreSQL хранятся в томе `polymap-db`.

Без Docker нужны Node.js 22+, Python 3.12+ и PostgreSQL. Из корня проекта:

```sh
npm --prefix frontend ci
npm --prefix frontend run build
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
export DATABASE_URL='postgresql+psycopg://polymap:YOUR_PASSWORD@localhost:5432/polymap'
export POLYMAP_ADMIN_KEY='YOUR_ADMIN_KEY'
.venv/bin/alembic -c backend/alembic.ini upgrade head
.venv/bin/python -m backend.main frontend/public/maps/campus.json
.venv/bin/uvicorn backend.main:app --port 8000
```

Во втором терминале выполните `npm --prefix frontend run preview`. Сервер веб-версии перенаправляет запросы `/api/` в FastAPI. Документация API доступна на [localhost:8000/docs](http://localhost:8000/docs).

## Размещение

`npm --prefix frontend run build` создаёт статическую веб-сборку в `frontend/dist/`. Карта, поиск, этажи, ссылки и маршруты доступны со снимком из сборки. При первом успешном открытии IndexedDB сохраняет согласованный пакет карты, а service worker сохраняет файлы сайта для повторного открытия без сети.

Для работы заявок и получения новых версий карт разверните FastAPI и PostgreSQL. При размещении API на отдельном домене перед сборкой веба задайте `EXPO_PUBLIC_API_URL` с адресом API и укажите разрешённый адрес сайта в `POLYMAP_ORIGINS` на сервере. При общем домене направьте `/api/` в FastAPI, а `/share/annotation`, `/share/route` и `/reports` в соответствующие страницы из `frontend/dist/`.

Для упаковки веб-сборки в Sites выполните `node devops/prepare-sites.mjs` из корня проекта. Команда копирует файлы из `frontend/dist/` в каталог публикации `dist/`.

## Обновление карт

```sh
python3 frontend/scripts/import-imdf.py /path/to/PolyMap/PolyNavi/Resources/IMDFData --revision <commit>
.venv/bin/python -m backend.main frontend/public/maps/campus.json
```

Пакет содержит геометрию, каталог и ориентированный граф. Публикация получает версию по содержимому. Браузер меняет активную версию и данные корпусов за одну транзакцию IndexedDB. Предыдущие опубликованные версии сохраняются в PostgreSQL, поскольку заявки ссылаются на конкретную версию.

## Проверки

Перейдите в `frontend/` и выполните:

```sh
npm run check
npx playwright install chromium webkit
npm test
```

Playwright проверяет локальный сайт на порту 8080. Для проверки отправки и модерации тестовой заявки передайте `POLYMAP_TEST_ADMIN_KEY` и используйте тестовую базу. Проверки с профилями Pixel и iPhone имитируют мобильный браузер. Физические устройства нужны для проверки Safari на iOS и Chrome на Android.

## Нативная карта

Из `frontend/` команды `npm run ios` и `npm run android` собирают Expo Development Build. Для iOS нужен Xcode, для Android — Android Studio и SDK. Нативная карта использует встроенный снимок. Для заявок задайте доступный с устройства `EXPO_PUBLIC_API_URL`, а для веб-ссылок из меню «Поделиться» — `EXPO_PUBLIC_WEB_URL`.
