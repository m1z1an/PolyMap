# Skills проекта

Upstream файлы установлены через системный `skill-installer`, без изменения содержимого skills. Основные правила использования и оркестрации — в [AGENTS.md](../../AGENTS.md). Skills доступны для чтения сейчас и обнаруживаются через AGENTS.md в следующих сессиях.

| Источник | Commit | Установленные skills |
| --- | --- | --- |
| https://github.com/upstash/context7 | c36522f3d4446288a272aedd727d665f7b8175f2 | context7-cli, find-docs |
| https://github.com/repowise-dev/repowise | e6272a7556f1ed852f7a145f721b09ca7670675e | architectural-decisions, change-review, code-health, codebase-exploration, dead-code-cleanup, pre-modification-check, settings |
| https://github.com/vercel-labs/skills | 57217cf86ba38148a57af9e90d14a4c049558330 | find-skills |

Context7: `npx --yes ctx7@latest library Alembic "target_metadata autogenerate"`, затем `npx --yes ctx7@latest docs <полученный-library-id> "migration template"`.

Repowise: установить CLI отдельно (`uv tool install repowise`), выполнить `repowise init --yes --no-prose --no-editor-setup` в корне, затем `repowise risk --target backend/main.py` и `repowise risk` для рабочего diff. Индекс не заменяет проверку исходников и PostgreSQL тесты.

Find Skills: `npx skills find <тема>`. Сам каталог skills не устанавливает MCP-серверы, не подключает аккаунты и не меняет настройки редактора.
