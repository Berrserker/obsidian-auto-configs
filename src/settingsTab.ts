import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type AutoConfigsPlugin from "./main";
import { listDeviceNames } from "./deviceConfig";

export class AutoConfigsSettingTab extends PluginSettingTab {
	plugin: AutoConfigsPlugin;

	constructor(app: App, plugin: AutoConfigsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Auto Configs" });

		this.renderStatus(containerEl);

		new Setting(containerEl)
			.setName("Имя устройства")
			.setDesc("Уникальный идентификатор: macbook-work, iphone, desktop-linux …")
			.addText((text) =>
				text
					.setPlaceholder("macbook-work")
					.setValue(this.plugin.settings.deviceName)
					.onChange(async (value) => {
						this.plugin.settings.deviceName = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Папка конфигов")
			.setDesc("Путь в vault, синхронизируемый через Git (например .obsidian/auto-configs)")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.configsFolder)
					.onChange(async (value) => {
						this.plugin.settings.configsFolder = value.trim() || ".obsidian/auto-configs";
						await this.plugin.saveSettings();
						this.plugin.refreshPaths();
					})
			);

		new Setting(containerEl)
			.setName("Автоприменение при запуске")
			.setDesc("Применить конфиг текущего устройства после загрузки Obsidian")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoApplyOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.autoApplyOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Автоустановка плагинов")
			.setDesc("Скачивать отсутствующие плагины: GitHub (приоритет) или Community catalog")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoInstallPlugins)
					.onChange(async (value) => {
						this.plugin.settings.autoInstallPlugins = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Установка из GitHub" });

		let gitRepo = "";
		let gitBranch = "main";
		let gitSubpath = "";
		let gitRef = "";

		new Setting(containerEl)
			.setName("GitHub repo")
			.setDesc("owner/repo, https://github.com/owner/repo или git@github.com:owner/repo.git")
			.addText((text) =>
				text.setPlaceholder("sevatar/obsidian-telegram-bot").onChange((value) => {
					gitRepo = value.trim();
				})
			);

		new Setting(containerEl)
			.setName("Branch")
			.setDesc("Ветка для raw-файлов, если нет release")
			.addText((text) =>
				text.setValue("main").onChange((value) => {
					gitBranch = value.trim();
				})
			);

		new Setting(containerEl)
			.setName("Ref / tag / commit")
			.setDesc("Опционально — конкретный tag или commit вместо branch")
			.addText((text) =>
				text.setPlaceholder("v1.0.0").onChange((value) => {
					gitRef = value.trim();
				})
			);

		new Setting(containerEl)
			.setName("Subpath")
			.setDesc("Если manifest.json лежит в подпапке монорепо")
			.addText((text) =>
				text.setPlaceholder("packages/obsidian-plugin").onChange((value) => {
					gitSubpath = value.trim();
				})
			);

		new Setting(containerEl)
			.setName("Установить из GitHub")
			.setDesc("Скачивает manifest.json, main.js, styles.css — без Community Store")
			.addButton((btn) =>
				btn.setButtonText("Установить").onClick(() => {
					void this.plugin
						.installFromGitHub(gitRepo, {
							branch: gitBranch || undefined,
							ref: gitRef || undefined,
							subpath: gitSubpath || undefined,
						})
						.then((msg) => new Notice(msg));
				})
			);

		new Setting(containerEl)
			.setName("Инициализировать папку")
			.setDesc("Создать devices/, secrets/, .gitignore и шаблон конфига")
			.addButton((btn) =>
				btn.setButtonText("Создать структуру").onClick(() => {
					void this.plugin.initWorkspace().then((msg) => new Notice(msg));
				})
			);

		new Setting(containerEl)
			.setName("Применить конфиг")
			.setDesc("Установить плагины, прокинуть секреты и записать settings")
			.addButton((btn) =>
				btn.setButtonText("Применить сейчас").onClick(() => {
					void this.plugin.applyCurrentDeviceConfig().then((msg) => new Notice(msg));
				})
			);

		new Setting(containerEl)
			.setName("Экспорт текущих настроек")
			.setDesc("Сохранить data.json установленных плагинов в devices/<device>.json")
			.addButton((btn) =>
				btn.setButtonText("Экспорт").onClick(() => {
					void this.plugin.exportCurrentSettings().then((msg) => new Notice(msg));
				})
			);

		const devices = listDeviceNames(this.plugin.configsFolderAbs);
		if (devices.length > 0) {
			containerEl.createEl("h3", { text: "Устройства в vault" });
			const list = containerEl.createEl("ul");
			for (const name of devices) {
				const item = list.createEl("li");
				item.setText(name);
				if (name === this.plugin.settings.deviceName) {
					item.createEl("strong", { text: " ← текущее" });
				}
			}
		}
	}

	private renderStatus(containerEl: HTMLElement): void {
		const git = this.plugin.getGitStatus();
		const cls = git.ok ? "ok" : "error";
		const block = containerEl.createDiv({ cls: `auto-configs-status ${cls}` });
		block.createEl("div", { text: git.message });
		if (this.plugin.settings.deviceName) {
			block.createEl("div", {
				text: `Конфиг: ${this.plugin.settings.configsFolder}/devices/${this.plugin.settings.deviceName}.json`,
			});
		} else {
			block.createEl("div", { text: "Задайте имя устройства" });
		}
	}
}
