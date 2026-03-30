#!/usr/bin/env node

/**
 * arc — Agent Remote Control CLI
 *
 * Commands:
 *   arc setup              Interactive configuration wizard
 *   arc connect            Start a remote control session
 *   arc install-skill      Install /remote-control skill for your framework
 *   arc status             Show current configuration
 */

import { loadConfig, configExists, getConfigPath } from "./config.js";
import { connect } from "./connect.js";
import { runSetup } from "./setup.js";
import { installSkill, detectFramework } from "./skill-installer.js";

const [command, ...args] = process.argv.slice(2);

function printUsage(): void {
  console.log(`
  arc — Agent Remote Control

  Usage:
    arc setup [options]    Configure relay URL, token, and framework
    arc connect [options]  Start a remote control session
    arc install-skill      Install /remote-control skill for your framework
    arc update             Update ARC and reinstall skills
    arc status             Show current configuration
    arc help               Show this help message

  Setup options:
    --hermes                   Configure for Hermes Agent framework
    --deepagent                Configure for DeepAgent (LangChain)
    --openclaw                 Configure for OpenClaw
    --hosted                   Use hosted relay at arc.axolotl.ai (default)
    --self-hosted              Use your own relay server

  Connect options:
    --name <name>              Agent name for this session
    --session-id <id>          Custom session ID (auto-generated if omitted)
    --relay-url <url>          Override relay URL
    --token <token>            Override agent token
    --framework <fw>           Override framework (hermes|deepagent|openclaw|generic)
    --hermes-url <url>         Hermes Agent API URL (default: http://localhost:3000)
    --quiet                    Suppress output
    --json                     Output session info as JSON (for scripting)

  Environment variables:
    ARC_RELAY_URL              Relay WebSocket URL
    ARC_AGENT_TOKEN            Agent authentication token
    ARC_FRAMEWORK              Agent framework
    ARC_HOSTED=true            Use hosted relay (arc.axolotl.ai)

  Quick start:
    curl -fsSL https://arc-beta.axolotl.ai/install.sh | sh
    arc setup
    arc connect
`);
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  switch (command) {
    case "setup":
    case "init": {
      const opts = parseArgs(args);

      // Detect framework shorthand flags
      let framework: string | undefined;
      if (opts["hermes"]) framework = "hermes";
      else if (opts["deepagent"]) framework = "deepagent";
      else if (opts["openclaw"]) framework = "openclaw";

      await runSetup({
        framework: framework as any,
        hosted: opts["hosted"] === true ? true : undefined,
        selfHosted: opts["self-hosted"] === true,
      });
      break;
    }

    case "connect":
    case "start": {
      if (!configExists() && !process.env.ARC_AGENT_TOKEN) {
        console.error("Not configured. Run `arc setup` first or set ARC_AGENT_TOKEN.");
        process.exit(1);
      }

      const opts = parseArgs(args);
      const result = await connect({
        relayUrl: opts["relay-url"] as string | undefined,
        agentToken: opts["token"] as string | undefined,
        framework: opts["framework"] as any,
        sessionId: opts["session-id"] as string | undefined,
        agentName: opts["name"] as string | undefined,
        hermesApiUrl: opts["hermes-url"] as string | undefined,
        quiet: opts["quiet"] === true,
        json: opts["json"] === true,
        onDisconnect: () => {
          console.log("\nDisconnected from relay.");
          process.exit(0);
        },
      });

      // Keep process alive
      process.on("SIGINT", () => {
        console.log("\nDisconnecting...");
        result.disconnect();
        process.exit(0);
      });

      process.on("SIGTERM", () => {
        result.disconnect();
        process.exit(0);
      });

      break;
    }

    case "install-skill": {
      const config = loadConfig();
      const framework = (args[0] as any) || config.framework || detectFramework();
      const result = installSkill(framework);

      if (result.installed) {
        console.log(`✓ Installed /remote-control skill at ${result.path}`);
      } else {
        console.log(`⚠ ${result.message} (${result.path})`);
      }
      break;
    }

    case "update":
    case "upgrade": {
      const { runUpdate } = await import("./update.js");
      await runUpdate();
      break;
    }

    case "status": {
      if (!configExists()) {
        console.log("Not configured. Run `arc setup` to get started.");
        break;
      }

      const config = loadConfig();
      console.log(`
  Configuration (${getConfigPath()}):
    Relay URL:  ${config.relayUrl}
    Token:      ${config.agentToken ? config.agentToken.slice(0, 12) + "..." : "(not set)"}
    Framework:  ${config.framework}
    Hosted:     ${config.hosted}
`);
      break;
    }

    case "help":
    case "--help":
    case "-h":
    case undefined: {
      printUsage();
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
