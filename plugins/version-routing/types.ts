/** Data handed to the client through setGlobalData (landing page, 404 handler). */
export interface VersionData {
  name: string;
  label: string;
  isLast: boolean;
  /** permalink of the version root, no trailing slash: /app-a or /app-a/0.1.0 */
  basePath: string;
  /** the page a visitor lands on for this version; null when there is none (build fails) */
  startPage: string | null;
}

export interface AppData {
  id: string;
  label: string;
  description: string;
  /** name of the latest version */
  latest: string;
  /** newest first; a local working copy ("current") comes first */
  versions: VersionData[];
  retired: { version: string; successor: string }[];
}

export interface GlobalData {
  apps: AppData[];
}

export interface PluginAppOptions {
  id: string;
  label: string;
  description: string;
  retired: { version: string; successor: string }[];
}

export interface VersionRoutingOptions {
  apps: PluginAppOptions[];
  /** old URL -> new path | false (dropped) | null (undecided) */
  legacy: Record<string, string | false | null>;
}

export const PLUGIN_NAME = 'version-routing';

export const stripSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
export const withSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`);
