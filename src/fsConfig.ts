import { FileSystemAdapter } from "obsidian";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs") as typeof import("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path") as typeof import("path");

export function getVaultBasePath(adapter: FileSystemAdapter): string {
	return adapter.getBasePath();
}

export function joinPath(...parts: string[]): string {
	return path.join(...parts);
}

export function pathExists(fullPath: string): boolean {
	try {
		return fs.existsSync(fullPath);
	} catch {
		return false;
	}
}

export function readTextFile(fullPath: string): string | null {
	try {
		if (!fs.existsSync(fullPath)) {
			return null;
		}
		return fs.readFileSync(fullPath, "utf8");
	} catch {
		return null;
	}
}

export function writeTextFile(fullPath: string, content: string): void {
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, content, "utf8");
}

export function readJsonFile<T>(fullPath: string): T | null {
	const raw = readTextFile(fullPath);
	if (!raw) {
		return null;
	}
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export function writeJsonFile(fullPath: string, data: unknown): void {
	writeTextFile(fullPath, JSON.stringify(data, null, 2) + "\n");
}

export function listFiles(dir: string, extension?: string): string[] {
	if (!pathExists(dir)) {
		return [];
	}
	try {
		return fs
			.readdirSync(dir)
			.filter((name) => {
				const full = path.join(dir, name);
				if (!fs.statSync(full).isFile()) {
					return false;
				}
				if (!extension) {
					return true;
				}
				return name.endsWith(extension);
			})
			.sort();
	} catch {
		return [];
	}
}

export function ensureDir(fullPath: string): void {
	fs.mkdirSync(fullPath, { recursive: true });
}

export function getConfigDir(configDir: string): string {
	return configDir;
}

export function getPluginsDir(configDir: string): string {
	return path.join(configDir, "plugins");
}

export function getPluginDataPath(configDir: string, pluginId: string): string {
	return path.join(getPluginsDir(configDir), pluginId, "data.json");
}

export function getCommunityPluginsPath(configDir: string): string {
	return path.join(configDir, "community-plugins.json");
}

export function getAppJsonPath(configDir: string): string {
	return path.join(configDir, "app.json");
}

export function getCorePluginsPath(configDir: string): string {
	return path.join(configDir, "core-plugins.json");
}

export function isPluginInstalled(configDir: string, pluginId: string): boolean {
	const manifestPath = path.join(getPluginsDir(configDir), pluginId, "manifest.json");
	return pathExists(manifestPath);
}
