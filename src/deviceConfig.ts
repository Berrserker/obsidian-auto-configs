import { normalizePath, Vault } from "obsidian";
import {
	CONFIG_GITIGNORE,
	DEVICE_CONFIG_EXAMPLE,
	DeviceConfig,
	SECRETS_EXAMPLE,
	SecretsFile,
} from "./types";
import { ensureDefaultCatalog } from "./catalog";
import { deviceConfigPath, deviceSecretsPath } from "./secrets";
import {
	ensureDir,
	joinPath,
	listFiles,
	pathExists,
	readJsonFile,
	readTextFile,
	writeJsonFile,
	writeTextFile,
} from "./fsConfig";

export function resolveConfigsFolderAbs(
	vaultBasePath: string,
	configsFolder: string
): string {
	const normalized = normalizePath(configsFolder);
	if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
		return normalized;
	}
	return joinPath(vaultBasePath, normalized);
}

export async function ensureConfigWorkspace(
	vault: Vault,
	configsFolderAbs: string,
	configsFolderRel: string
): Promise<void> {
	for (const sub of ["devices", "secrets"]) {
		ensureDir(joinPath(configsFolderAbs, sub));
		const relDir = normalizePath(`${configsFolderRel}/${sub}`);
		if (!vault.getAbstractFileByPath(relDir)) {
			try {
				await vault.createFolder(relDir);
			} catch {
				// folder may already exist on filesystem
			}
		}
	}

	const gitignorePath = joinPath(configsFolderAbs, ".gitignore");
	if (!pathExists(gitignorePath)) {
		writeTextFile(gitignorePath, CONFIG_GITIGNORE);
	}

	const readmePath = joinPath(configsFolderAbs, "README.md");
	if (!pathExists(readmePath)) {
		writeTextFile(
			readmePath,
			`# Auto Configs

Папка синхронизируется через Git. На каждом устройстве — свой файл в \`devices/\`.

- \`devices/<device>.json\` — настройки плагинов (в Git)
- \`devices/<device>.secrets.json\` — секреты (в .gitignore)
- \`catalog.json\` — откуда ставить плагины (GitHub / Community)

Плейсхолдеры в settings:
- \`\${secret:name}\` — из secrets.json
- \`\${env:VAR}\` — из env в secrets.json
- \`\${device}\` — имя устройства
- \`\${vault}\` — имя vault
`
		);
	}

	ensureDefaultCatalog(configsFolderAbs);
}

export async function createDeviceConfigTemplate(
	configsFolderAbs: string,
	deviceName: string
): Promise<string> {
	const devicesDir = joinPath(configsFolderAbs, "devices");
	ensureDir(devicesDir);

	const configPath = deviceConfigPath(configsFolderAbs, deviceName);
	if (!pathExists(configPath)) {
		const example: DeviceConfig = {
			...DEVICE_CONFIG_EXAMPLE,
			device: deviceName,
		};
		writeJsonFile(configPath, example);
	}

	const secretsPath = deviceSecretsPath(configsFolderAbs, deviceName);
	if (!pathExists(secretsPath)) {
		writeJsonFile(secretsPath, SECRETS_EXAMPLE);
	}

	return configPath;
}

export function loadDeviceConfig(
	configsFolderAbs: string,
	deviceName: string
): DeviceConfig | null {
	return readJsonFile<DeviceConfig>(deviceConfigPath(configsFolderAbs, deviceName));
}

export function loadDeviceSecrets(
	configsFolderAbs: string,
	deviceName: string
): SecretsFile | null {
	const secretsPath = deviceSecretsPath(configsFolderAbs, deviceName);
	const direct = readJsonFile<SecretsFile>(secretsPath);
	if (direct) {
		return direct;
	}
	const sharedPath = joinPath(configsFolderAbs, "secrets", `${deviceName}.json`);
	return readJsonFile<SecretsFile>(sharedPath);
}

export function listDeviceNames(configsFolderAbs: string): string[] {
	const dir = joinPath(configsFolderAbs, "devices");
	return listFiles(dir, ".json")
		.filter((name) => !name.endsWith(".secrets.json"))
		.map((name) => name.replace(/\.json$/, ""))
		.sort();
}

export function saveDeviceConfig(
	configsFolderAbs: string,
	config: DeviceConfig
): void {
	writeJsonFile(deviceConfigPath(configsFolderAbs, config.device), config);
}

export function readDeviceConfigRaw(
	configsFolderAbs: string,
	deviceName: string
): string | null {
	return readTextFile(deviceConfigPath(configsFolderAbs, deviceName));
}
