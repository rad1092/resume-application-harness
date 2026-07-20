#!/usr/bin/env node

import { createRequire, syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validate as validateJsonResume } from "@jsonresume/schema";
import { analyzeAts } from "resuml/ats";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const WRAPPER_VERSION = "1.0.0";
const PINNED_RESUML_VERSION = "3.2.0";
const MAX_RESUME_CHARS = 250_000;
const MAX_JOB_DESCRIPTION_CHARS = 150_000;
const require = createRequire(import.meta.url);
const installedResuml = require("resuml/package.json");

if (installedResuml.version !== PINNED_RESUML_VERSION) {
  throw new Error(`Unsafe resuml version: expected ${PINNED_RESUML_VERSION}, got ${installedResuml.version}`);
}

function denyNetwork() {
  throw new Error("Network access is disabled in resume-safe-resuml");
}

globalThis.fetch = async () => denyNetwork();
http.request = denyNetwork;
http.get = denyNetwork;
https.request = denyNetwork;
https.get = denyNetwork;
net.connect = denyNetwork;
net.createConnection = denyNetwork;
tls.connect = denyNetwork;
syncBuiltinESMExports();

function parseResume(text) {
  const value = parseYaml(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Resume must parse to a JSON/YAML object");
  }
  return value;
}

function schemaValidation(resume) {
  return new Promise((resolve) => {
    validateJsonResume(resume, (errors, isValid) => {
      resolve({ valid: Boolean(isValid), errors: errors ?? [] });
    });
  });
}

function textResult(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

const server = new McpServer({ name: "resume-safe-resuml", version: WRAPPER_VERSION });

server.registerTool(
  "safe_resuml_policy",
  {
    title: "Safe resuml Policy",
    description: "Report the pinned local-computation boundary and its best-effort process guards. This tool does not read resume data.",
  },
  () => textResult({
    wrapper_version: WRAPPER_VERSION,
    resuml_version: installedResuml.version,
    local_only: true,
    advisory_only: true,
    language: "en",
    network_expected: false,
    network_isolation_enforced: false,
    process_network_guard: "best-effort",
    file_reads: false,
    file_writes: false,
    prompts: [],
    resources: [],
    allowed_tools: ["safe_resuml_policy", "safe_resuml_validate", "safe_resuml_ats_check"],
    unavailable_capabilities: ["jobs", "tailor", "optimize", "init", "themes", "render", "pdf", "auto-install"],
    non_gating_checks: ["quantification-density", "word-count-total", "bullets-per-role", "has-linkedin"],
  }),
);

server.registerTool(
  "safe_resuml_validate",
  {
    title: "Validate English JSON/YAML Resume",
    description: "Parse and validate an English JSON/YAML Resume in the local process. The tool does not intentionally use network, files, prompts, rendering, or rewriting.",
    inputSchema: {
      resumeText: z.string().min(2).max(MAX_RESUME_CHARS).describe("Approved English JSON/YAML Resume content"),
    },
  },
  async ({ resumeText }) => {
    try {
      const resume = parseResume(resumeText);
      const result = await schemaValidation(resume);
      return textResult({ ...result, local_only: true, advisory_only: false, resuml_version: installedResuml.version }, !result.valid);
    } catch (error) {
      return textResult({ valid: false, local_only: true, error: String(error.message ?? error) }, true);
    }
  },
);

server.registerTool(
  "safe_resuml_ats_check",
  {
    title: "Run Local English ATS Diagnostic",
    description: "Run resuml's deterministic English ATS diagnostic locally. Results are advisory and may omit driving, vehicle, safety, and ADAS concepts.",
    inputSchema: {
      resumeText: z.string().min(2).max(MAX_RESUME_CHARS).describe("Approved English JSON/YAML Resume content"),
      jobDescription: z.string().min(1).max(MAX_JOB_DESCRIPTION_CHARS).optional().describe("Official job-description text already obtained by the user or agent"),
      language: z.literal("en").default("en").describe("Only English is permitted by this restricted wrapper"),
    },
  },
  async ({ resumeText, jobDescription }) => {
    try {
      const resume = parseResume(resumeText);
      const validation = await schemaValidation(resume);
      if (!validation.valid) return textResult({ valid: false, schema: validation, error: "ATS check requires a schema-valid resume" }, true);
      const result = analyzeAts(resume, { language: "en", ...(jobDescription ? { jobDescription } : {}) });
      return textResult({
        valid: true,
        local_only: true,
        advisory_only: true,
        resuml_version: installedResuml.version,
        interpretation_limits: [
          "Not an employer ATS or hiring-probability score",
          "English analyzer only",
          "Bundled skill index may omit ADAS, driving, vehicle, and safety concepts",
          "Quantification and recruiter-convention checks cannot override the fact ledger",
        ],
        non_gating_checks: ["quantification-density", "word-count-total", "bullets-per-role", "has-linkedin"],
        result,
      });
    } catch (error) {
      return textResult({ valid: false, local_only: true, error: String(error.message ?? error) }, true);
    }
  },
);

await server.connect(new StdioServerTransport());
