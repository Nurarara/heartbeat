import {releaseConfiguration} from './scripts/release-config.mjs';
import path from 'node:path';
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";
import { connectorPreview } from "./build/connector-preview-plugin.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const deploymentName=process.env.HEARTBEAT_DEPLOYMENT_ENV;
const release=deploymentName?releaseConfiguration(deploymentName):null;
const localBindingConfig = {
  assets:{run_worker_first:['/prototype','/prototype/*']},
  ...(release?{name:release.name,vars:{HEARTBEAT_DEPLOYMENT_ENV:deploymentName!,HEARTBEAT_APP_MODE:'production',HEARTBEAT_APP_ORIGIN:release.origin,HEARTBEAT_AI_ENABLED:'true',HEARTBEAT_BILLING_ENABLED:String(release.billingEnabled),HEARTBEAT_AI_DAILY_LIMIT:String(release.dailyAttemptLimit),HEARTBEAT_DAILY_BUDGET_MICROS:String(release.dailyBudgetMicros),HEARTBEAT_DIRECTOR_ESTIMATE_MICROS:String(release.directorEstimateMicros),HEARTBEAT_IMAGE_ESTIMATE_MICROS:String(release.imageEstimateMicros),HEARTBEAT_PROVIDER_CONCURRENCY:String(release.providerConcurrency),HEARTBEAT_DIRECTOR_MODEL:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',HEARTBEAT_IMAGE_MODEL:'@cf/black-forest-labs/flux-1-schnell',HEARTBEAT_WEATHER_PROVIDER:'open-meteo-commercial',HEARTBEAT_TRUST_CLOUDFLARE_IP:'true'}}:{}),
  triggers: {crons:['* * * * *']},
  workflows: [{ binding: 'ARTWORK_WORKFLOW', name: release?.workflowName||'heartbeat-generation', class_name: 'HeartbeatWorkflow' }],
  main: "./build/sites-worker.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: release?.databaseName||"site-creator-d1",
          migrations_dir:path.resolve("drizzle"),
          database_id: release?.databaseId||SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: release?.bucketName||"site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      connectorPreview(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...localBindingConfig,
          ...(command === "serve"
            ? {
                services: [
                  {
                    binding: "CONNECTORS",
                    service: "sites-connector-preview",
                    entrypoint: "ConnectorPreview",
                  },
                ],
              }
            : {}),
        },
        ...(command === "serve"
          ? {
              auxiliaryWorkers: [
                {
                  config: {
                    name: "sites-connector-preview",
                    main: "./build/connector-preview-worker.mjs",
                    compatibility_date: "2026-05-15",
                  },
                },
              ],
            }
          : {}),
      }),
    ],
  };
});
