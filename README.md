# Auto Configs (Obsidian)

Плагин для **синхронизации настроек между устройствами** через Git. На каждом устройстве — свой JSON-конфиг; секреты хранятся отдельно и не попадают в репозиторий.

## Требования

- Obsidian **desktop** (нужен доступ к `.obsidian/` и файловой системе)
- **Git** в корне vault (конфиги синхронизируются через GitHub/GitLab и т.п.)

## Быстрый старт

1. Установите плагин в `.obsidian/plugins/obsidian-auto-configs/`
2. Включите **Auto Configs** в Community plugins
3. В настройках задайте:
   - **Имя устройства** — например `macbook-work`, `iphone`, `desktop-linux`
   - **Папка конфигов** — по умолчанию `.obsidian/auto-configs`
4. Нажмите **«Создать структуру»** — появятся `devices/`, `secrets/`, `.gitignore`
5. Отредактируйте `devices/<device>.json` и `devices/<device>.secrets.json`
6. Закоммитьте JSON **без** `.secrets.json` → синхронизируйте vault
7. На другом устройстве задайте своё имя и нажмите **«Применить конфиг»**

## Структура папки

```
.obsidian/auto-configs/
  .gitignore
  README.md
  devices/
    macbook-work.json          ← в Git
    macbook-work.secrets.json  ← в .gitignore
    iphone.json
  secrets/                     ← опционально, общие секреты по устройствам
```

## Установка плагинов

Плагин поддерживает **два источника** — явно указываются в JSON:

| source | Откуда ставится |
|--------|-----------------|
| `"github"` / `"git"` | Любой GitHub-репозиторий (не только Community Store) |
| `"community"` | Официальный каталог Obsidian → скачивается repo автора |

### Из GitHub (любой репозиторий)

В `devices/<device>.json`:

```json
{
  "id": "my-private-plugin",
  "enabled": true,
  "install": {
    "source": "github",
    "repo": "https://github.com/owner/obsidian-my-plugin",
    "branch": "main",
    "ref": "v1.2.0",
    "subpath": "packages/plugin"
  }
}
```

Поддерживаются форматы repo:
- `owner/repo`
- `https://github.com/owner/repo`
- `git@github.com:owner/repo.git`

Скачивание: release assets → raw по tag → raw по branch/ref (main/master/default).

### Из Community Store

```json
{
  "id": "dataview",
  "enabled": true,
  "install": { "source": "community" }
}
```

### Общий каталог `catalog.json`

Чтобы не дублировать `install` на каждом устройстве:

```json
{
  "plugins": {
    "obsidian-telegram-bot": {
      "source": "github",
      "repo": "owner/obsidian-telegram-bot",
      "branch": "main"
    },
    "dataview": { "source": "community" }
  }
}
```

В device-конфиге достаточно `"id": "obsidian-telegram-bot"` — источник возьмётся из catalog.

Порядок поиска источника: `install` в device JSON → `catalog.json` → Community catalog.

### UI и команды

- В настройках плагина — блок **«Установка из GitHub»** (repo, branch, ref, subpath)
- Команда *Install plugin from GitHub repository*

## Формат `devices/<device>.json`

```json
{
  "device": "macbook-work",
  "plugins": [
    {
      "id": "obsidian-telegram-bot",
      "enabled": true,
      "install": {
        "source": "github",
        "repo": "owner/obsidian-telegram-bot",
        "branch": "main",
        "version": "1.0.0"
      },
      "settings": {
        "botToken": "${secret:telegram_bot_token}",
        "ragApiKey": "${env:RAG_API_KEY}",
        "mainDeviceId": "${device}"
      }
    }
  ],
  "app": { "attachmentFolderPath": "attachments" },
  "corePlugins": { "daily-notes": true }
}
```

### Плейсхолдеры

| Плейсхолдер | Источник |
|-------------|----------|
| `${secret:name}` | `devices/<device>.secrets.json` → `secrets.name` |
| `${env:VAR}` | `devices/<device>.secrets.json` → `env.VAR` |
| `${device}` | имя устройства из настроек плагина |
| `${vault}` | имя vault |

## Возможности

- **Установка из GitHub** — любой репозиторий, branch/tag/commit, subpath в монорепо
- **Установка из Community Store** — `"source": "community"`
- **Каталог `catalog.json`** — общие источники для всех устройств
- **Включение/выключение** плагинов (`enabled`)
- **Запись settings** в `.obsidian/plugins/<id>/data.json`
- **Секреты** через отдельный файл, не коммитится в Git
- **Экспорт** текущих настроек всех включённых плагинов в JSON
- **Автоприменение** при запуске Obsidian

## Команды

- *Apply device config* — применить конфиг текущего устройства
- *Initialize config folder* — создать структуру папок
- *Export plugin settings to device config* — экспорт в JSON
- *Install plugin from GitHub repository* — установка напрямую из Git

## Сборка и деплой

```bash
cd obsidian_auto_configs
npm install
npm run build
OBSIDIAN_VAULT=/path/to/vault ./scripts/deploy.sh
```

Примеры конфигов: `examples/devices/`.

## Перезагрузка после установки плагинов

Obsidian может потребовать **Reload plugins** или перезапуск после установки новых плагинов из GitHub.
