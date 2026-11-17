# PolyMap

Веб-версия навигации по СПбПУ на Expo Router, React Native Web, TypeScript и MapLibre GL JS. Поиск и расчёт маршрута выполняются на устройстве. Один набор данных используется в вебе и в нативной карте MapLibre React Native.

Карты и граф импортированы из [PolyMap СПбПУ](https://github.com/SPBSTU-indoor-navigation/PolyMap/tree/25ca67f6dfe3f780e4120833b6520bf8c7eed1e6/PolyNavi/Resources/IMDFData). Снимок содержит 18 этажей в пяти корпусах и 1307 мест. Идентификаторы мест и формат ссылок `/share/annotation` и `/share/route` сохранены. Наличие корпуса на карте кампуса не гарантирует наличия плана этажей.

## Структура проекта

- `frontend/` — приложение Expo, карты, веб-сборка и тесты Playwright.
- `backend/` — FastAPI, модели PostgreSQL и миграции Alembic.
- `devops/` — Dockerfile для веба и API и конфигурация Docker Compose.

## Запуск с заявками и PostgreSQL

В Windows с Docker Desktop запустите из PowerShell в корне проекта:

```powershell
powershell -ExecutionPolicy Bypass -File .\devops\start.ps1
```

Скрипт запустит Docker Desktop при необходимости, создаст `.env` со случайным паролем PostgreSQL, если файла ещё нет, и дождётся готовности приложения. Существующий `.env` сохраняется; пароль должен соответствовать уже созданному тому базы.

Compose использует PostgreSQL 17 (`postgres:17-alpine`) и постоянный том `polymap_polymap-db`. База доступна API внутри Docker; отдельно устанавливать или запускать PostgreSQL на Windows не требуется.

Если Docker сообщает, что не найден именованный канал (pipe), проверьте запуск Docker Desktop и его WSL 2 backend. Если загрузка образа завершается ошибкой TLS или тайм-аутом, проверьте подключение к Docker Hub и повторите запуск; скрипт делает до трёх попыток. Для остановки используйте `docker compose --env-file .env -f devops/compose.yaml down`: не добавляйте `-v`, если нужно сохранить данные PostgreSQL.

Для других систем нужен Docker с Compose. Скопируйте `.env.example` в `.env`, задайте свои значения и запустите:

```sh
docker compose --env-file .env -f devops/compose.yaml up --build
```

FastAPI выполнит миграции и опубликует входящий в проект снимок карт. Создайте сотрудника интерактивно (пароль вводится без отображения, не менее 12 символов):

```sh
docker compose --env-file .env -f devops/compose.yaml exec api python -m backend.create_employee employee
```

Откройте [PolyMap](http://localhost:8080) и войдите в «Стол заявок» под этой учётной записью. Данные PostgreSQL хранятся в томе `polymap-db`. Сеанс действует 12 часов, выход отзывает его на сервере; токен хранится только в памяти страницы.

Без Docker нужны Node.js 22+, Python 3.12+ и PostgreSQL. Из корня проекта:

```sh
npm --prefix frontend ci
npm --prefix frontend run build
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
export DATABASE_URL='postgresql+psycopg://polymap:YOUR_PASSWORD@localhost:5432/polymap'
.venv/bin/alembic -c backend/alembic.ini upgrade head
.venv/bin/python -m backend.main frontend/public/maps/campus.json
.venv/bin/python -m backend.create_employee employee
.venv/bin/uvicorn backend.main:app --port 8000
```

Во втором терминале выполните `npm --prefix frontend run preview`. Сервер веб-версии перенаправляет запросы `/api/` в FastAPI. Документация API доступна на [localhost:8000/docs](http://localhost:8000/docs).

В PowerShell из корня после установки зависимостей используйте:

```powershell
$env:DATABASE_URL='postgresql+psycopg://polymap:YOUR_PASSWORD@localhost:5432/polymap'
.venv/Scripts/python -m alembic -c backend/alembic.ini upgrade head
.venv/Scripts/python -m backend.main frontend/public/maps/campus.json
.venv/Scripts/python -m backend.create_employee employee
.venv/Scripts/python -m uvicorn backend.main:app --port 8000
```

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

При закрытии заявки сотрудник указывает результат проверки и выбирает «Исправлено» или «Не подтвердилось». Для исправления необходимо сначала опубликовать новую версию карты и указать её идентификатор. Исходная версия заявки сохраняется; исправленная версия доступна по отдельной ссылке. Старые закрытые заявки сохраняют прежний текст результата, их новый тип результата не задан.

Текущая граница публикации и кеширования — весь кампус. Для будущей загрузки отдельных корпусов нужно версионировать общий каталог кампуса и граф переходов вместе с данными корпусов, атомарно активировать только согласованные версии и хранить их в кеше. Маршруты между корпусами должны использовать один согласованный граф; разбиение данных не должно смешивать версии или ломать автономную навигацию.

План перехода к независимым пакетам корпусов (FT014, FT034–FT036 остаются открытыми):

1. Опубликовать неизменяемый манифест версии кампуса с хешами и URL каталога, пакетов корпусов и общего графа, включая межкорпусные рёбра. Планы, места и граф каждого корпуса должны ссылаться на совместимую версию манифеста.
2. Получать манифест с условными HTTP-запросами (`ETag`/`If-None-Match`); неизменяемые файлы по хешу кешировать надолго. Загружать только нужные изменившиеся корпуса, проверяя хеши и зависимости до активации.
3. Сохранять загруженные планы, места и граф в одной транзакции и переключать активный манифест только после проверки всей необходимой согласованной группы. При ошибке или отсутствии сети оставлять прежнюю версию и обеспечивать откат к ранее полной версии.
4. Для маршрута между корпусами загружать оба совместимых пакета и общий граф переходов одной версии. При недостающих данных честно сообщать о недоступном маршруте и не объединять рёбра разных публикаций.

## Модели и миграции

Pydantic-схемы в `backend/main.py` проверяют входящие и исходящие данные API; ORM-модели в `backend/db.py` описывают таблицы приложения; миграции Alembic в `backend/alembic/versions/` изменяют существующую базу и сохраняют её данные. Изменение модели само по себе не обновляет базу. После изменения модели создайте и проверьте миграцию из корня:

```sh
.venv/bin/alembic -c backend/alembic.ini revision --autogenerate -m "describe change"
.venv/bin/alembic -c backend/alembic.ini upgrade head
.venv/bin/alembic -c backend/alembic.ini check
.venv/bin/alembic -c backend/alembic.ini history
```

Проверяйте созданный файл вручную, особенно преобразование существующих данных. Применённые миграции не переписываются.

## Проверки

Перейдите в `frontend/` и выполните:

```sh
npm run check
npx playwright install chromium webkit
npm test
```

Playwright проверяет локальный сайт на порту 8080. Для проверки отправки и модерации тестовой заявки передайте `POLYMAP_TEST_USERNAME`, `POLYMAP_TEST_PASSWORD` и `POLYMAP_TEST_CORRECTION_VERSION` (идентификатор другой опубликованной версии) и используйте тестовую базу. Проверки с профилями Pixel и iPhone имитируют мобильный браузер. Физические устройства нужны для проверки Safari на iOS и Chrome на Android.

Интеграционные проверки используют PostgreSQL и создают временные схемы в указанной базе. Установите `pytest` и `httpx` в виртуальное окружение и выполните из корня:

```sh
export TEST_DATABASE_URL='postgresql+psycopg://polymap:YOUR_PASSWORD@localhost:5432/polymap_test'
.venv/bin/python -m pytest backend/tests
```

## Нативная карта

Из `frontend/` команды `npm run ios` и `npm run android` собирают Expo Development Build. Для iOS нужен Xcode, для Android — Android Studio и SDK. Нативная карта использует встроенный снимок. Для заявок задайте доступный с устройства `EXPO_PUBLIC_API_URL`, а для веб-ссылок из меню «Поделиться» — `EXPO_PUBLIC_WEB_URL`.
