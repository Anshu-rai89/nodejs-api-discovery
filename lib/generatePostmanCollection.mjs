
import fs from 'fs'
import { uploadPostmanCollection } from './utils.mjs';

// Function to generate Postman collection JSON with baseUrl prefix
export async function generatePostmanCollection(
  apiEndpoints,
  baseUrl,
  postmanKey,
  workspaceId,
  collectionName,
  writeCollection
) {

  console.log('Generating your collections...')
  const collection = {
    info: {
      name: collectionName ? collectionName: "API Collection",
      description: "Collection generated programmatically from Node.js server",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [],
  };

  // Group endpoints by resourceName
  const groupedEndpoints = groupEndpointsByResource(apiEndpoints);

  // Create Postman collection structure
  Object.keys(groupedEndpoints).forEach((resourceName) => {
    const resourceEndpoints = groupedEndpoints[resourceName];
    const folderItem = {
      name: resourceName,
      item: resourceEndpoints.map((endpoint) => ({
        name: endpoint.method + " " + endpoint.resourceName,
        request: {
          url: baseUrl + endpoint.path,
          method: endpoint.method.toLowerCase(),
          header: endpoint.headers,
          body: endpoint.body,
          description:
            endpoint.method + " " + endpoint.resourceName + " " + endpoint.file,
        },
        response: [],
      })),
    };
    collection.item.push(folderItem);
  });

  if (writeCollection) {
    await writePostmanCollection(collection, "./postman_collection.json");
  }

  if(postmanKey && workspaceId) {
    await uploadPostmanCollection(postmanKey, collection, workspaceId);
  }


  return collection;
}

// Helper function to group endpoints by resourceName
function groupEndpointsByResource(apiEndpoints) {
  const groupedEndpoints = {};
  apiEndpoints.forEach((endpoint) => {
    const resourceName = endpoint.resourceName;
    if (!groupedEndpoints[resourceName]) {
      groupedEndpoints[resourceName] = [];
    }
    groupedEndpoints[resourceName].push(endpoint);
  });
  return groupedEndpoints;
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

