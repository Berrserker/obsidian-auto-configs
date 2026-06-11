import { joinPath, pathExists, readJsonFile, writeJsonFile } from "./fsConfig";
import type { PluginCatalog, PluginInstallSource } from "./types";

export function catalogFilePath(configsFolderAbs: string): string {
	return joinPath(configsFolderAbs, "catalog.json");
}

export function loadPluginCatalog(configsFolderAbs: string): PluginCatalog | null {
	return readJsonFile<PluginCatalog>(catalogFilePath(configsFolderAbs));
}

export function savePluginCatalog(
	configsFolderAbs: string,
	catalog: PluginCatalog
): void {
	writeJsonFile(catalogFilePath(configsFolderAbs), catalog);
}

export function ensureDefaultCatalog(configsFolderAbs: string): void {
	const path = catalogFilePath(configsFolderAbs);
	if (pathExists(path)) {
		return;
	}
	writeJsonFile(path, {
		plugins: {
			"obsidian-telegram-bot": {
				source: "github",
				repo: "owner/obsidian-telegram-bot",
				branch: "main",
			},
			dataview: {
				source: "community",
			},
		},
	});
}

export function resolveInstallSource(
	pluginId: string,
	entryInstall: PluginInstallSource | undefined,
	catalog: PluginCatalog | null
): PluginInstallSource | null {
	if (entryInstall) {
		return entryInstall;
	}
	const fromCatalog = catalog?.plugins?.[pluginId];
	if (fromCatalog) {
		return fromCatalog;
	}
	return null;
}
