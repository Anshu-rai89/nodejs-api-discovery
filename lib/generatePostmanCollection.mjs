
import fs from 'fs'

// Function to generate Postman collection JSON with baseUrl prefix
export async function generatePostmanCollection(apiEndpoints, baseUrl, writeCollection) {
  const collection = {
    info: {
      name: "API Collection",
      description: "Collection generated programmatically from Node.js server",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: apiEndpoints.map((endpoint) => ({
      name: endpoint.method + " " + baseUrl + endpoint.path, // Prefix with baseUrl
      request: {
        url: baseUrl + endpoint.path, // Prefix with baseUrl
        method: endpoint.method.toLowerCase(),
        header: endpoint.headers,
        body: endpoint.body,
        description: endpoint.file, 
      },
      response: [], 
    })),
  };
 
   if(writeCollection) {
      await writePostmanCollection(collection, "./postman_collection.json");
   }

  return collection;
}

// Function to write Postman collection to file
 async function writePostmanCollection(collection, filePath) {
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(collection, null, 2));
    console.log(`Postman collection saved to: ${filePath}`);
  } catch (error) {
    throw new Error(`Failed to write Postman collection: ${error.message}`);
  }
}

