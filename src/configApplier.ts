import {
	getAppJsonPath,
	getCommunityPluginsPath,
	getCorePluginsPath,
	getPluginDataPath,
	isPluginInstalled,
	readJsonFile,
	writeJsonFile,
} from "./fsConfig";
import { loadPluginCatalog, resolveInstallSource } from "./catalog";
import { installPluginFromCommunity, installPluginFromSource } from "./pluginInstaller";
import { resolveSettings } from "./secrets";
import type { DeviceConfig, PluginConfigEntry, PluginInstallSource, SecretsFile } from "./types";

export type ApplyResult = {
	installed: string[];
	configured: string[];
	enabled: string[];
	disabled: string[];
	errors: string[];
};

function mergeDeep(
	target: Record<string, unknown>,
	source: Record<string, unknown>
): Record<string, unknown> {
	const out = { ...target };
	for (const [key, value] of Object.entries(source)) {
		if (
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			typeof out[key] === "object" &&
			out[key] !== null &&
			!Array.isArray(out[key])
		) {
			out[key] = mergeDeep(
				out[key] as Record<string, unknown>,
				value as Record<string, unknown>
			);
		} else {
			out[key] = value;
		}
	}
	return out;
}

function readCommunityPlugins(configDir: string): string[] {
	return readJsonFile<string[]>(getCommunityPluginsPath(configDir)) ?? [];
}

function writeCommunityPlugins(configDir: string, ids: string[]): void {
	const unique = [...new Set(ids)].sort();
	writeJsonFile(getCommunityPluginsPath(configDir), unique);
}

async function ensurePluginInstalled(
	configDir: string,
	entry: PluginConfigEntry,
	autoInstall: boolean,
	catalogFolderAbs: string
): Promise<{ ok: boolean; message?: string; source?: PluginInstallSource | "already" }> {
	if (isPluginInstalled(configDir, entry.id)) {
		return { ok: true, source: "already" };
	}
	if (!autoInstall) {
		return { ok: false, message: `Плагин ${entry.id} не установлен` };
	}

	const catalog = loadPluginCatalog(catalogFolderAbs);
	const install = resolveInstallSource(entry.id, entry.install, catalog);

	if (install) {
		const result = await installPluginFromSource(configDir, entry.id, install);
		return {
			ok: result.installed,
			message: result.message,
			source: install,
		};
	}

	const community = await installPluginFromCommunity(configDir, entry.id);
	return {
		ok: community.installed,
		message: community.message,
		source: { source: "community" },
	};
}

function applyPluginSettings(
	configDir: string,
	pluginId: string,
	settings: Record<string, unknown>,
	merge: boolean
): void {
	const dataPath = getPluginDataPath(configDir, pluginId);
	const existing = readJsonFile<Record<string, unknown>>(dataPath) ?? {};
	const next = merge ? mergeDeep(existing, settings) : settings;
	writeJsonFile(dataPath, next);
}

function setPluginEnabled(configDir: string, pluginId: string, enabled: boolean): void {
	const current = readCommunityPlugins(configDir);
	if (enabled) {
		if (!current.includes(pluginId)) {
			writeCommunityPlugins(configDir, [...current, pluginId]);
		}
		return;
	}
	writeCommunityPlugins(
		configDir,
		current.filter((id) => id !== pluginId)
	);
}

function applyAppSettings(configDir: string, app: Record<string, unknown>): void {
	const path = getAppJsonPath(configDir);
	const existing = readJsonFile<Record<string, unknown>>(path) ?? {};
	writeJsonFile(path, mergeDeep(existing, app));
}

function applyCorePlugins(
	configDir: string,
	corePlugins: Record<string, boolean>
): void {
	const path = getCorePluginsPath(configDir);
	const existing = readJsonFile<Record<string, boolean>>(path) ?? {};
	writeJsonFile(path, { ...existing, ...corePlugins });
}

export async function applyDeviceConfig(
	configDir: string,
	deviceConfig: DeviceConfig,
	secretsFile: SecretsFile | null,
	deviceName: string,
	vaultName: string,
	autoInstall: boolean,
	configsFolderAbs: string
): Promise<ApplyResult> {
	const result: ApplyResult = {
		installed: [],
		configured: [],
		enabled: [],
		disabled: [],
		errors: [],
	};

	for (const entry of deviceConfig.plugins) {
		const installResult = await ensurePluginInstalled(
			configDir,
			entry,
			autoInstall,
			configsFolderAbs
		);
		if (!installResult.ok) {
			result.errors.push(installResult.message ?? `Ошибка установки ${entry.id}`);
			continue;
		}
		if (installResult.source && installResult.source !== "already") {
			result.installed.push(entry.id);
		}

		if (entry.enabled === true) {
			setPluginEnabled(configDir, entry.id, true);
			result.enabled.push(entry.id);
		} else if (entry.enabled === false) {
			setPluginEnabled(configDir, entry.id, false);
			result.disabled.push(entry.id);
		}

		if (entry.settings && Object.keys(entry.settings).length > 0) {
			const resolved = resolveSettings(
				entry.settings,
				secretsFile,
				deviceName,
				vaultName
			);
			applyPluginSettings(configDir, entry.id, resolved, true);
			result.configured.push(entry.id);
		}
	}

	if (deviceConfig.app && Object.keys(deviceConfig.app).length > 0) {
		const resolved = resolveSettings(
			deviceConfig.app,
			secretsFile,
			deviceName,
			vaultName
		);
		applyAppSettings(configDir, resolved);
	}

	if (deviceConfig.corePlugins && Object.keys(deviceConfig.corePlugins).length > 0) {
		applyCorePlugins(configDir, deviceConfig.corePlugins);
	}

	return result;
}

export function exportPluginSettings(
	configDir: string,
	pluginIds: string[]
): PluginConfigEntry[] {
	return pluginIds.map((id) => {
		const dataPath = getPluginDataPath(configDir, id);
		const settings = readJsonFile<Record<string, unknown>>(dataPath) ?? {};
		const enabled = readCommunityPlugins(configDir).includes(id);
		return {
			id,
			enabled,
			settings,
		};
	});
}

export function listInstalledPluginIds(configDir: string): string[] {
	const community = readCommunityPlugins(configDir);
	return [...new Set(community)].sort();
}
