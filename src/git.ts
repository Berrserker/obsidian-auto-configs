import { FileSystemAdapter } from "obsidian";
import { joinPath, pathExists } from "./fsConfig";

export type GitStatus = {
	ok: boolean;
	message: string;
	gitDir: string;
};

export function checkVaultGit(adapter: FileSystemAdapter): GitStatus {
	const base = adapter.getBasePath();
	const gitDir = joinPath(base, ".git");
	if (pathExists(gitDir)) {
		return { ok: true, message: "Git-репозиторий найден", gitDir };
	}
	return {
		ok: false,
		message: "В корне vault нет .git — конфиги не будут синхронизироваться через GitHub",
		gitDir,
	};
}
