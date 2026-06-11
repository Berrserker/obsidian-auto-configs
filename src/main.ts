import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { AutoConfigsSettingTab } from "./settingsTab";
import {
	applyDeviceConfig,
	exportPluginSettings,
	listInstalledPluginIds,
} from "./configApplier";
import {
	createDeviceConfigTemplate,
	ensureConfigWorkspace,
	loadDeviceConfig,
	loadDeviceSecrets,
	resolveConfigsFolderAbs,
	saveDeviceConfig,
} from "./deviceConfig";
import { checkVaultGit } from "./git";
import {
	enablePluginInCommunityList,
	installPluginFromGitHub,
	parseGitHubRepo,
} from "./pluginInstaller";
import { DEFAULT_SETTINGS, DeviceConfig, PluginSettings } from "./types";

export default class AutoConfigsPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	configsFolderAbs = "";
	private vaultBasePath = "";

	async onload(): Promise<void> {
		await this.loadSettings();
		this.refreshPaths();

		this.addSettingTab(new AutoConfigsSettingTab(this.app, this));

		this.addCommand({
			id: "auto-configs-apply",
			name: "Apply device config",
			callback: () => void this.applyCurrentDeviceConfig().then((m) => new Notice(m)),
		});

		this.addCommand({
			id: "auto-configs-init",
			name: "Initialize config folder",
			callback: () => void this.initWorkspace().then((m) => new Notice(m)),
		});

		this.addCommand({
			id: "auto-configs-export",
			name: "Export plugin settings to device config",
			callback: () => void this.exportCurrentSettings().then((m) => new Notice(m)),
		});

		this.addCommand({
			id: "auto-configs-install-github",
			name: "Install plugin from GitHub repository",
			callback: () => void this.promptInstallFromGitHub(),
		});

		if (this.settings.autoApplyOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				void this.applyCurrentDeviceConfig(true);
			});
		}
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshPaths(): void {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			return;
		}
		this.vaultBasePath = adapter.getBasePath();
		this.configsFolderAbs = resolveConfigsFolderAbs(
			this.vaultBasePath,
			this.settings.configsFolder
		);
	}

	getGitStatus() {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			return { ok: false, message: "Только desktop vault с FileSystemAdapter", gitDir: "" };
		}
		return checkVaultGit(adapter);
	}

	private requireDesktop(): string | null {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			return "Auto Configs работает только на desktop";
		}
		return null;
	}

	private requireReady(): string | null {
		const err = this.requireDesktop();
		if (err) {
			return err;
		}
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		const git = checkVaultGit(adapter);
		if (!git.ok) {
			return git.message;
		}
		if (!this.settings.deviceName) {
			return "Укажите имя устройства в настройках плагина";
		}
		this.refreshPaths();
		return null;
	}

	async initWorkspace(): Promise<string> {
		const err = this.requireReady();
		if (err) {
			return err;
		}
		await ensureConfigWorkspace(
			this.app.vault,
			this.configsFolderAbs,
			this.settings.configsFolder
		);
		const configPath = await createDeviceConfigTemplate(
			this.configsFolderAbs,
			this.settings.deviceName
		);
		return `Структура создана: ${configPath}`;
	}

	async applyCurrentDeviceConfig(silent = false): Promise<string> {
		const err = this.requireReady();
		if (err) {
			return err;
		}

		await ensureConfigWorkspace(
			this.app.vault,
			this.configsFolderAbs,
			this.settings.configsFolder
		);

		const deviceConfig = loadDeviceConfig(
			this.configsFolderAbs,
			this.settings.deviceName
		);
		if (!deviceConfig) {
			const msg = `Нет конфига devices/${this.settings.deviceName}.json — нажмите «Создать структуру»`;
			if (!silent) {
				return msg;
			}
			console.warn("[Auto Configs]", msg);
			return msg;
		}

		const secrets = loadDeviceSecrets(
			this.configsFolderAbs,
			this.settings.deviceName
		);

		const result = await applyDeviceConfig(
			this.app.vault.configDir,
			deviceConfig,
			secrets,
			this.settings.deviceName,
			this.app.vault.getName(),
			this.settings.autoInstallPlugins,
			this.configsFolderAbs
		);

		const parts: string[] = [];
		if (result.installed.length) {
			parts.push(`установлено: ${result.installed.join(", ")}`);
		}
		if (result.configured.length) {
			parts.push(`настроено: ${result.configured.join(", ")}`);
		}
		if (result.enabled.length) {
			parts.push(`включено: ${result.enabled.join(", ")}`);
		}
		if (result.errors.length) {
			parts.push(`ошибки: ${result.errors.join("; ")}`);
		}

		const summary = parts.length ? parts.join(" | ") : "Конфиг применён";
		if (result.configured.length > 0 || result.installed.length > 0) {
			console.log("[Auto Configs]", summary, result);
		}
		return summary;
	}

	async exportCurrentSettings(): Promise<string> {
		const err = this.requireReady();
		if (err) {
			return err;
		}

		await ensureConfigWorkspace(
			this.app.vault,
			this.configsFolderAbs,
			this.settings.configsFolder
		);

		const pluginIds = listInstalledPluginIds(this.app.vault.configDir);
		const entries = exportPluginSettings(this.app.vault.configDir, pluginIds);

		const existing = loadDeviceConfig(
			this.configsFolderAbs,
			this.settings.deviceName
		);

		const config: DeviceConfig = existing ?? {
			device: this.settings.deviceName,
			plugins: [],
		};

		config.device = this.settings.deviceName;
		config.plugins = entries;
		saveDeviceConfig(this.configsFolderAbs, config);

		return `Экспортировано ${entries.length} плагинов → devices/${this.settings.deviceName}.json`;
	}

	async installFromGitHub(
		repo: string,
		options?: { branch?: string; ref?: string; subpath?: string; enable?: boolean; pluginId?: string }
	): Promise<string> {
		const err = this.requireDesktop();
		if (err) {
			return err;
		}
		if (!repo.trim()) {
			return "Укажите GitHub repo (owner/name или URL)";
		}

		try {
			parseGitHubRepo(repo);
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}

		const result = await installPluginFromGitHub(
			this.app.vault.configDir,
			{
				source: "github",
				repo: repo.trim(),
				branch: options?.branch,
				ref: options?.ref,
				subpath: options?.subpath,
			},
			options?.pluginId
		);

		if (result.installed && options?.enable !== false) {
			enablePluginInCommunityList(this.app.vault.configDir, result.pluginId);
		}

		return result.message;
	}

	promptInstallFromGitHub(): void {
		const repo = prompt("GitHub repo (owner/name или URL):");
		if (!repo) {
			return;
		}
		const branch = prompt("Branch (пусто = auto)", "main") ?? "";
		const subpath = prompt("Subpath в репо (если плагин в подпапке):", "") ?? "";
		void this.installFromGitHub(repo, {
			branch: branch.trim() || undefined,
			subpath: subpath.trim() || undefined,
		}).then((msg) => new Notice(msg));
	}
}
