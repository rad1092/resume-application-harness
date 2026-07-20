#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "server.mjs");
const client = new Client({ name: "resume-safe-resuml-self-test", version: "1.0.0" });
const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], cwd: here, stderr: "pipe" });

const sampleResume = JSON.stringify({
  basics: {
    name: "Test Candidate",
    label: "Operations Professional",
    email: "candidate@example.com",
    phone: "+82-10-0000-0000",
    summary: "Operations professional with delivery coordination and software testing experience.",
  },
  work: [
    {
      name: "Example Company",
      position: "Manager, Operations",
      startDate: "2022-04",
      endDate: "2025-04",
      highlights: ["Coordinated schedules, inventory, and delivery deadlines."],
    },
  ],
  education: [
    {
      institution: "Example University",
      area: "Humanities",
      studyType: "Bachelor's degree",
      startDate: "2012",
      endDate: "2020",
    },
  ],
  skills: [{ name: "Productivity", keywords: ["Microsoft Office", "Apple macOS"] }],
});

const jobDescription = "Drive an engineering vehicle, collect data, write detailed reports, use Microsoft Office and macOS, and work night shifts.";

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  const expected = ["safe_resuml_ats_check", "safe_resuml_policy", "safe_resuml_validate"].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected tool surface: ${JSON.stringify(names)}`);
  }
  if (names.some((name) => /jobs|tailor|render|pdf|init|theme/iu.test(name))) {
    throw new Error(`Unsafe tool exposed: ${JSON.stringify(names)}`);
  }
  const policy = await client.callTool({ name: "safe_resuml_policy", arguments: {} });
  const validation = await client.callTool({ name: "safe_resuml_validate", arguments: { resumeText: sampleResume } });
  const ats = await client.callTool({
    name: "safe_resuml_ats_check",
    arguments: { resumeText: sampleResume, jobDescription, language: "en" },
  });
  const extract = (result) => JSON.parse(result.content.find((item) => item.type === "text")?.text ?? "{}");
  const policyData = extract(policy);
  const validationData = extract(validation);
  const atsData = extract(ats);
  if (
    !policyData.local_only
    || !policyData.advisory_only
    || policyData.network_expected !== false
    || policyData.network_isolation_enforced !== false
    || policyData.process_network_guard !== "best-effort"
    || Object.hasOwn(policyData, "network_disabled")
  ) {
    throw new Error("Policy boundary was not reported correctly");
  }
  if (!validationData.valid) throw new Error(`Validation failed: ${JSON.stringify(validationData)}`);
  if (!atsData.valid || !atsData.advisory_only) throw new Error(`ATS check failed: ${JSON.stringify(atsData)}`);
  console.log(JSON.stringify({ valid: true, tools: names, policy: policyData, validation: validationData, ats_advisory_only: atsData.advisory_only }, null, 2));
} finally {
  await client.close().catch(() => {});
}
