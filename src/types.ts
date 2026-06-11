export type PluginInstallSource =
	| {
			source: "github" | "git";
			repo: string;
			branch?: string;
			ref?: string;
			version?: string;
			subpath?: string;
	  }
	| {
			source: "community";
	  };

export type PluginCatalog = {
	plugins: Record<string, PluginInstallSource>;
};

export type PluginConfigEntry = {
	id: string;
	enabled?: boolean;
	install?: PluginInstallSource;
	settings?: Record<string, unknown>;
};

export type DeviceConfig = {
	device: string;
	description?: string;
	plugins: PluginConfigEntry[];
	app?: Record<string, unknown>;
	corePlugins?: Record<string, boolean>;
};

export type SecretsFile = {
	secrets?: Record<string, string>;
	env?: Record<string, string>;
};

export type PluginSettings = {
	deviceName: string;
	configsFolder: string;
	autoApplyOnStartup: boolean;
	autoInstallPlugins: boolean;
};

export const DEFAULT_SETTINGS: PluginSettings = {
	deviceName: "",
	configsFolder: ".obsidian/auto-configs",
	autoApplyOnStartup: true,
	autoInstallPlugins: true,
};

export const CONFIG_GITIGNORE = `# Auto Configs — не коммитьте секреты
devices/*.secrets.json
secrets/
*.local.json
`;

export const DEVICE_CONFIG_EXAMPLE: DeviceConfig = {
	device: "macbook-work",
	description: "Рабочий MacBook",
	plugins: [
		{
			id: "obsidian-telegram-bot",
			enabled: true,
			install: {
				source: "github",
				repo: "owner/obsidian-telegram-bot",
				branch: "main",
			},
			settings: {
				notesFolder: "Telegram/notes",
				botToken: "${secret:telegram_bot_token}",
				ragApiKey: "${env:RAG_API_KEY}",
			},
		},
	],
};

export const SECRETS_EXAMPLE: SecretsFile = {
	secrets: {
		telegram_bot_token: "123456:ABC-DEF",
	},
	env: {
		RAG_API_KEY: "sk-...",
	},
};
