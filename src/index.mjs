import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findApiEndpoints } from "./apiDiscovery.mjs";
import {
  generatePostmanCollection,
  writePostmanCollection,
} from "./postmanCollection.mjs";

// Get current module file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration from config.json
const configPath = path.join(__dirname, "..", "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Main function to orchestrate the process
async function generateApiCollection() {
  try {
    // Find API endpoints
    const apiEndpoints = await findApiEndpoints(
      path.join(__dirname, "..", config.directoryToScan),
      config.framework,
      config.objectInstance
    );

    // Generate Postman collection with baseUrl prefix
    const collection = generatePostmanCollection(apiEndpoints, config.baseUrl);

    // Write collection to file
    const collectionFilePath = path.join(
      __dirname,
      "..",
      config.postmanCollectionFile
    );
    await writePostmanCollection(collection, collectionFilePath);

    console.log(`Postman collection saved to: ${collectionFilePath}`);
  } catch (error) {
    console.error("Error generating API collection:", error);
  }
}

// Execute main function
generateApiCollection();
