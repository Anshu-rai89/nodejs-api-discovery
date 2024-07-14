// src/apiDiscovery.mjs
import fs from "fs";
import path from "path";
import esprima from "esprima";
import { extractBody, extractHeaders, extractQueryParams, isHttpMethodCall } from "./endpointDetails.mjs";

// Function to find API endpoints
export async function findApiEndpoints(
  directoryPath,
  framework,
  objectInstance
) {
  const apiEndpoints = [];

  // Read all files in the directory
  const files = fs.readdirSync(directoryPath);

  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      apiEndpoints.push(
        ...(await findApiEndpoints(filePath, framework, objectInstance))
      );
    } else if (stat.isFile() && file.endsWith(".js")) {
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
            path: routePath,
            headers: headers,
            queryParameters: queryParameters,
            body: body,
            file: filePath,
          };

          apiEndpoints.push(endpoint);
        }
      });
    }
  }

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
