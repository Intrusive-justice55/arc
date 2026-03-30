/**
 * @axolotlai/arc-cli — public API
 *
 * Can be imported programmatically by framework plugins:
 *   import { connect } from "@axolotlai/arc-cli";
 *   const session = await connect({ framework: "openclaw" });
 */

export { connect } from "./connect.js";
export type { ConnectOptions, ConnectResult } from "./connect.js";
export { loadConfig, saveConfig } from "./config.js";
export type { ArcConfig } from "./config.js";
export { installSkill, installAllSkills, detectFramework, detectAllFrameworks } from "./skill-installer.js";
export type { InstallResult } from "./skill-installer.js";
