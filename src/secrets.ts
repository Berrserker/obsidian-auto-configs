import type { SecretsFile } from "./types";

const PLACEHOLDER_RE = /\$\{([^}]+)\}/g;

type ResolveContext = {
	secrets: Record<string, string>;
	env: Record<string, string>;
	deviceName: string;
	vaultName: string;
};

function lookup(ctx: ResolveContext, kind: string, key: string): string | undefined {
	switch (kind) {
		case "secret":
			return ctx.secrets[key];
		case "env":
			return ctx.env[key];
		case "device":
			return ctx.deviceName;
		case "vault":
			return ctx.vaultName;
		default:
			return undefined;
	}
}

function resolveString(value: string, ctx: ResolveContext): unknown {
	if (!value.includes("${")) {
		return value;
	}
	return value.replace(PLACEHOLDER_RE, (_match, expr: string) => {
		const trimmed = expr.trim();
		const colon = trimmed.indexOf(":");
		if (colon === -1) {
			return lookup(ctx, trimmed, "") ?? "";
		}
		const kind = trimmed.slice(0, colon);
		const key = trimmed.slice(colon + 1);
		const resolved = lookup(ctx, kind, key);
		return resolved ?? "";
	});
}

export function resolveValue(value: unknown, ctx: ResolveContext): unknown {
	if (typeof value === "string") {
		return resolveString(value, ctx);
	}
	if (Array.isArray(value)) {
		return value.map((item) => resolveValue(item, ctx));
	}
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
			out[key] = resolveValue(nested, ctx);
		}
		return out;
	}
	return value;
}

export function resolveSettings(
	settings: Record<string, unknown>,
	secretsFile: SecretsFile | null,
	deviceName: string,
	vaultName: string
): Record<string, unknown> {
	const ctx: ResolveContext = {
		secrets: secretsFile?.secrets ?? {},
		env: secretsFile?.env ?? {},
		deviceName,
		vaultName,
	};
	return resolveValue(settings, ctx) as Record<string, unknown>;
}

export function deviceConfigPath(
	configsFolderAbs: string,
	deviceName: string
): string {
	return `${configsFolderAbs}/devices/${deviceName}.json`;
}

export function deviceSecretsPath(
	configsFolderAbs: string,
	deviceName: string
): string {
	return `${configsFolderAbs}/devices/${deviceName}.secrets.json`;
}

export function catalogPath(configsFolderAbs: string): string {
	return `${configsFolderAbs}/catalog.json`;
}
