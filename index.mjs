#!/usr/bin/env node

import fs from "fs";
import { program } from "commander";
import { discoverEndpoints, generatePostmanCollection } from "./lib/index.mjs";

// Load configuration based on provided config file
program
  .option("-c, --config <configPath>", "Specify config file path")
  .parse(process.argv);

// Extract configPath from command-line arguments or fallback to default
const configPath = program.config || "./config.json";

// Read and parse the configuration file
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  console.error("Error reading or parsing configuration file:", err);
  process.exit(1);
}

// Function to run API discovery and collection generation
async function runTool(writeCollection = false) {
  try {
    const endpoints = await discoverEndpoints(config);

    await generatePostmanCollection(
      endpoints,
      config.baseUrl,
      config.postmanKey,
      config.workspaceId,
      config.collectionName,
      writeCollection
    );
    console.log("Postman collection generated successfully!");
  } catch (error) {
    console.error("Error generating Postman collection:", error.message);
  }
}

// Run the tool based on command-line arguments
runTool(true); // Always write collection in CLI mode
