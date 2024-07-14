import fs from "fs";
import { discoverEndpoints } from "./lib/discoverEndpoints.mjs";
import { generatePostmanCollection } from "./lib/generatePostmanCollection.mjs";

// Load configuration
const configPath = './config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Function to run API discovery and collection generation
async function runTool(writeCollection = false) {
  try {
    const endpoints = await discoverEndpoints(
      config.directoryToScan,
      config.framework,
      config.objectInstance
    );

    await generatePostmanCollection(endpoints, config.baseUrl, writeCollection);
    console.log("Postman collection generated successfully!");
  } catch (error) {
    console.error("Error generating Postman collection:", error);
  }
}

// Run the tool when this file is executed directly
if (import.meta.main) {
    runTool(true);
}


export { discoverEndpoints, generatePostmanCollection };