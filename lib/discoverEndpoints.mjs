import fs from "fs";
import path from "path";
import ts from "typescript";
import esprima from "esprima";
import {
  isTsHttpMethodCall,
  extractBodyForTs,
  extractHeadersForTs,
  extractQueryParamsForTs,
  extractHeadersForJs,
  extractBodyForJs,
  extractQueryParamsForJs,
  isJsHttpMethodCall
} from "./utils.mjs";

// // Function to find API endpoints
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
      } else if (stat.isFile() && file.endsWith(".ts")) {
        // Process TypeScript files
        const endpoints = processTsFile(
          file,
          filePath,
          framework,
          objectInstance
        );
        apiEndpoints.push(...endpoints);
      } else if (stat.isFile() && file.endsWith(".js")) {
        // Process JavaScript files
        const endpoints = processJsFile(file, filePath, framework, objectInstance);
        apiEndpoints.push(...endpoints);
      }
    });
  }

  scanDirectory(directoryPath);
  return apiEndpoints;
}


// Function to process TypeScript file
function processTsFile(file, filePath, framework, objectInstance) {
  const endpoints = [];

  const fileName = path.parse(file).name; // Extract file name without extension

    // Determine resource name and endpoint path
    let resourceName = fileName;
    let endpointPath = `/${resourceName}`;

    // Modify endpoint path if file is not index.ts
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

    // Read the file content
    const content = fs.readFileSync(filePath, "utf8");

    // Parse the file content as TypeScript
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    // Process AST to find and extract API endpoints
    traverse(sourceFile, (node) => {
      // Add logging to understand the node structure
      //console.log("Visiting node:", ts.SyntaxKind[node.kind]);

      // Look for route definitions based on the specified framework and object instance
      if (
        ts.isCallExpression(node) &&
        node.expression &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression &&
        node.expression.expression.escapedText === objectInstance &&
        isTsHttpMethodCall(node, objectInstance)
      ) {
        const method = node.expression.name.escapedText.toUpperCase();
        const routePath =
          node.arguments[0] && ts.isStringLiteral(node.arguments[0])
            ? node.arguments[0].text
            : "";

        // Extract headers, query parameters, and body (if available)
        const headers = extractHeadersForTs(node);
        const queryParameters = extractQueryParamsForTs(node);
        const body = extractBodyForTs(node); // Pass content of file for body extraction

        // Construct endpoint object
        const endpoint = {
          method: method,
          path: `${endpointPath}${routePath}`,
          headers: headers,
          queryParameters: queryParameters,
          body: body,
          file: filePath,
          resourceName
        };

        endpoints.push(endpoint);
      }
    });

    console.log(endpoints);
  return endpoints;
}

// Function to process JavaScript file
function processJsFile(file, filePath, framework, objectInstance) {
  const endpoints = [];
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
  traverseForJs(ast, (node) => {
    // Look for route definitions based on the specified framework and object instance
    if (
      node.type === "CallExpression" &&
      node.callee &&
      node.callee.object &&
      node.callee.object.name === objectInstance &&
      isJsHttpMethodCall(node, framework)
    ) {
      const method = node.callee.property.name.toUpperCase();
      const routePath = node.arguments[0].value;

      // Extract headers, query parameters, and body (if available)
      const headers = extractHeadersForJs(node);
      const queryParameters = extractQueryParamsForJs(node);
      const body = extractBodyForJs(node, content); // Pass content of file for body extraction

      // Construct endpoint object
      const endpoint = {
        method: method,
        path: `${endpointPath}${routePath}`,
        headers: headers,
        queryParameters: queryParameters,
        body: body,
        file: filePath,
        resourceName,
      };

      endpoints.push(endpoint);
    }
  });
   
  return endpoints;
}

// Helper function to traverse AST (for TypeScript)
function traverse(node, visitor) {
  if (!node) return;

  visitor(node);

  ts.forEachChild(node, (child) => {
    traverse(child, visitor);
  });
}

function traverseForJs(node, visitor) {
  if (!node) return;

  visitor(node);

  if (node.type === "Program" || node.type === "BlockStatement") {
    node.body.forEach((child) => {
      traverseForJs(child, visitor);
    });
  } else {
    for (const key in node) {
      if (node.hasOwnProperty(key)) {
        const child = node[key];
        if (typeof child === "object" && child !== null) {
          traverseForJs(child, visitor);
        }
      }
    }
  }
}