// src/apiDiscovery.mjs

import fs from "fs";
import path from "path";
import esprima from "esprima";
import {
  extractBody,
  extractHeaders,
  extractQueryParams,
  isHttpMethodCall,
} from "./utils.mjs";

// Function to find API endpoints
export async function discoverEndpoints(
  directoryPath,
  framework,
  objectInstance
) {
  const apiEndpoints = [];

  // Recursively scan directory for route files
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Handle directories recursively
        scanDirectory(filePath);
      } else if (stat.isFile() && file.endsWith(".js")) {
        const fileName = path.parse(file).name; // Extract file name without extension

        // Determine resource name and endpoint path
        let resourceName = fileName;
        let endpointPath = `/${resourceName}`;

        // Modify endpoint path if file is not index.js
        if (fileName !== "index") {
          // Use file name for resource name
          resourceName = fileName;

          // Handle API versioning and resource modules
          const versionMatch = filePath.match(/\/v\d+\//);
          if (versionMatch) {
            const version = versionMatch[0].replace(/\//g, ""); // Extract version from file path
            endpointPath = `/${version}/${resourceName}`;
          } else {
            endpointPath = `/${resourceName}`;
          }
        }

        // Read JavaScript files and search for route definitions based on framework
        const content = fs.readFileSync(filePath, "utf8");
        const ast = esprima.parseScript(content);

        // Process AST to find and extract API endpoints
        traverse(ast, (node) => {
          // Look for route definitions based on the specified framework and object instance
          if (
            node.type === "CallExpression" &&
            node.callee &&
            node.callee.object &&
            node.callee.object.name === objectInstance &&
            isHttpMethodCall(node, framework)
          ) {
            const method = node.callee.property.name.toUpperCase();
            const routePath = node.arguments[0].value;

            // Extract headers, query parameters, and body (if available)
            const headers = extractHeaders(node);
            const queryParameters = extractQueryParams(node);
            const body = extractBody(node, content); // Pass content of file for body extraction

            // Construct endpoint object
            const endpoint = {
              method: method,
              path: `${endpointPath}${routePath}`,
              headers: headers,
              queryParameters: queryParameters,
              body: body,
              file: filePath,
            };

            apiEndpoints.push(endpoint);
          }
        });
      }
    });
  }

  scanDirectory(directoryPath);
  return apiEndpoints;
}

// Helper function to traverse AST
function traverse(node, visitor) {
  if (!node) return;

  visitor(node);

  for (const key in node) {
    if (node.hasOwnProperty(key)) {
      const child = node[key];
      if (typeof child === "object" && child !== null) {
        traverse(child, visitor);
      }
    }
  }
}
