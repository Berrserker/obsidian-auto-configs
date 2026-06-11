import { requestUrl } from "obsidian";
import {
	ensureDir,
	getCommunityPluginsPath,
	getPluginsDir,
	pathExists,
	readJsonFile,
	writeJsonFile,
	writeTextFile,
} from "./fsConfig";
import type { PluginInstallSource } from "./types";

type GitHubRelease = {
	tag_name: string;
	assets: Array<{ name: string; browser_download_url: string }>;
};

type GitHubRepo = {
	default_branch: string;
};

type Manifest = {
	id: string;
	name?: string;
	version?: string;
};

const PLUGIN_FILES = ["manifest.json", "main.js", "styles.css"] as const;
const FALLBACK_BRANCHES = ["main", "master"] as const;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs") as typeof import("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path") as typeof import("path");

function writeDownloaded(outPath: string, content: string | ArrayBuffer): void {
	if (typeof content === "string") {
		writeTextFile(outPath, content);
		return;
	}
	writeTextFile(outPath, new TextDecoder("utf-8").decode(content));
}

export function parseGitHubRepo(repo: string): { owner: string; name: string } {
	const cleaned = repo
		.replace(/^git@github\.com:/, "")
		.replace(/^https?:\/\/github\.com\//, "")
		.replace(/^https?:\/\/www\.github\.com\//, "")
		.replace(/\.git$/, "")
		.replace(/\/$/, "");
	const parts = cleaned.split("/").filter(Boolean);
	if (parts.length < 2) {
		throw new Error(`Некорректный GitHub repo: ${repo}`);
	}
	return { owner: parts[0], name: parts[1] };
}

async function fetchText(url: string): Promise<string | null> {
	try {
		const res = await requestUrl({ url, method: "GET" });
		if (res.status >= 400) {
			return null;
		}
		return res.text;
	} catch {
		return null;
	}
}

async function fetchBuffer(url: string): Promise<ArrayBuffer | null> {
	try {
		const res = await requestUrl({ url, method: "GET" });
		if (res.status >= 400) {
			return null;
		}
		return res.arrayBuffer;
	} catch {
		return null;
	}
}

async function getRepoMeta(owner: string, name: string): Promise<GitHubRepo | null> {
	const url = `https://api.github.com/repos/${owner}/${name}`;
	try {
		const res = await requestUrl({ url, method: "GET" });
		if (res.status >= 400) {
			return null;
		}
		return JSON.parse(res.text) as GitHubRepo;
	} catch {
		return null;
	}
}

async function getLatestRelease(
	owner: string,
	name: string
): Promise<GitHubRelease | null> {
	const url = `https://api.github.com/repos/${owner}/${name}/releases/latest`;
	try {
		const res = await requestUrl({ url, method: "GET" });
		if (res.status >= 400) {
			return null;
		}
		return JSON.parse(res.text) as GitHubRelease;
	} catch {
		return null;
	}
}

function rawBase(owner: string, name: string, ref: string, subpath?: string): string {
	const prefix = subpath ? `${subpath.replace(/^\/|\/$/g, "")}/` : "";
	return `https://raw.githubusercontent.com/${owner}/${name}/${ref}/${prefix}`;
}

async function downloadFromRelease(
	owner: string,
	name: string,
	version: string | undefined,
	pluginDir: string,
	subpath?: string
): Promise<boolean> {
	const release = await getLatestRelease(owner, name);
	if (!release) {
		return false;
	}
	const tag = version ?? release.tag_name;
	let downloaded = 0;
	for (const fileName of PLUGIN_FILES) {
		const asset = release.assets.find((a) => a.name === fileName);
		let content: string | ArrayBuffer | null = null;
		if (asset) {
			content = await fetchBuffer(asset.browser_download_url);
		}
		if (!content) {
			const rawUrl = `${rawBase(owner, name, tag, subpath)}${fileName}`;
			content = fileName.endsWith(".json")
				? await fetchText(rawUrl)
				: await fetchBuffer(rawUrl);
		}
		if (!content) {
			continue;
		}
		writeDownloaded(`${pluginDir}/${fileName}`, content);
		downloaded++;
	}
	return downloaded > 0;
}

async function downloadFromRef(
	owner: string,
	name: string,
	ref: string,
	pluginDir: string,
	subpath?: string
): Promise<boolean> {
	let downloaded = 0;
	for (const fileName of PLUGIN_FILES) {
		const url = `${rawBase(owner, name, ref, subpath)}${fileName}`;
		const text = await fetchText(url);
		if (!text) {
			continue;
		}
		writeTextFile(`${pluginDir}/${fileName}`, text);
		downloaded++;
	}
	return downloaded > 0;
}

async function resolveRefs(
	owner: string,
	name: string,
	install: Extract<PluginInstallSource, { repo: string }>
): Promise<string[]> {
	const refs: string[] = [];
	if (install.version) {
		refs.push(install.version);
	}
	if (install.ref) {
		refs.push(install.ref);
	}
	if (install.branch) {
		refs.push(install.branch);
	}
	const meta = await getRepoMeta(owner, name);
	if (meta?.default_branch) {
		refs.push(meta.default_branch);
	}
	for (const branch of FALLBACK_BRANCHES) {
		refs.push(branch);
	}
	return [...new Set(refs.filter(Boolean))];
}

export async function installPluginFromGitHub(
	configDir: string,
	install: Extract<PluginInstallSource, { repo: string }>,
	expectedId?: string
): Promise<{ pluginId: string; installed: boolean; message: string }> {
	const { owner, name } = parseGitHubRepo(install.repo);
	const pluginsRoot = getPluginsDir(configDir);
	const subpath = install.subpath?.replace(/^\/|\/$/g, "");

	let pluginId = expectedId ?? name;
	const tempDir = `${pluginsRoot}/${pluginId}`;
	ensureDir(tempDir);

	let ok = false;
	if (install.version) {
		ok = await downloadFromRelease(owner, name, install.version, tempDir, subpath);
	}
	if (!ok) {
		ok = await downloadFromRelease(owner, name, undefined, tempDir, subpath);
	}
	if (!ok) {
		const refs = await resolveRefs(owner, name, install);
		for (const ref of refs) {
			ok = await downloadFromRef(owner, name, ref, tempDir, subpath);
			if (ok) {
				break;
			}
		}
	}

	if (!ok) {
		return {
			pluginId,
			installed: false,
			message: `Не удалось скачать ${install.repo} (проверьте repo/branch/ref/subpath)`,
		};
	}

	const manifestPath = `${tempDir}/manifest.json`;
	const manifest = readJsonFile<Manifest>(manifestPath);
	if (!manifest?.id) {
		return {
			pluginId,
			installed: false,
			message: `manifest.json не найден или без id (${install.repo})`,
		};
	}

	if (manifest.id !== pluginId) {
		const correctDir = `${pluginsRoot}/${manifest.id}`;
		if (correctDir !== tempDir) {
			ensureDir(path.dirname(correctDir));
			if (pathExists(correctDir)) {
				fs.rmSync(correctDir, { recursive: true, force: true });
			}
			fs.renameSync(tempDir, correctDir);
		}
		pluginId = manifest.id;
	}

	if (!pathExists(`${pluginsRoot}/${pluginId}/main.js`)) {
		return {
			pluginId,
			installed: false,
			message: `main.js не скачан для ${install.repo}`,
		};
	}

	return {
		pluginId,
		installed: true,
		message: `Установлен ${manifest.name ?? pluginId} из GitHub: ${install.repo}`,
	};
}

export async function installPluginFromCommunity(
	configDir: string,
	pluginId: string
): Promise<{ pluginId: string; installed: boolean; message: string }> {
	const url = `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json`;
	try {
		const res = await requestUrl({ url, method: "GET" });
		const list = JSON.parse(res.text) as Array<{ id: string; repo: string }>;
		const entry = list.find((p) => p.id === pluginId);
		if (!entry) {
			return {
				pluginId,
				installed: false,
				message: `Плагин ${pluginId} не найден в Community plugins — укажите install.source: "github"`,
			};
		}
		return installPluginFromGitHub(
			configDir,
			{ source: "github", repo: entry.repo },
			pluginId
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { pluginId, installed: false, message };
	}
}

export async function installPluginFromSource(
	configDir: string,
	pluginId: string,
	install: PluginInstallSource
): Promise<{ pluginId: string; installed: boolean; message: string }> {
	if (install.source === "community") {
		return installPluginFromCommunity(configDir, pluginId);
	}
	return installPluginFromGitHub(configDir, install, pluginId);
}

export function enablePluginInCommunityList(configDir: string, pluginId: string): void {
	const current = readJsonFile<string[]>(getCommunityPluginsPath(configDir)) ?? [];
	if (!current.includes(pluginId)) {
		writeJsonFile(getCommunityPluginsPath(configDir), [...current, pluginId].sort());
	}
}
