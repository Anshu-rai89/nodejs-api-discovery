import fs from "fs";
import path from "path";
import ts from "typescript";
import esprima from "esprima";
import {
  isTsHttpMethodCall,
  extractBodyForTs,
  extractHeadersForTs,
  extractQueryParamsForTs,
  traverseForTs,
  traceFunctionDefinition as traceFunctionDefinitionForTs,
  getFunctionDescriptionForTs,
  extractScenariosFromFunction
} from "../utils/tsUtils.mjs";

import {
  extractHeadersForJs,
  extractBodyForJs,
  extractQueryParamsForJs,
  isJsHttpMethodCall,
  traverseForJs,
  traceFunctionDefinition,
  getFunctionDescriptionForJs
} from '../utils/jsUtils.mjs'

import { 
  cloneRepository,
  deleteClonedRepository,
  fetchRepoFiles
} from '../utils/index.mjs';

// // Function to find API endpoints
export async function discoverEndpoints({
  repoPath,
  framework,
  objectInstance,
  githubAPIKey,
}) {
  console.log("Discovering your APIs...");
  let localPath = "./clonedRepo";
  let isCloned = false;
  try {
    const apiEndpoints = [];
    if (repoPath.startsWith("http://") || repoPath.startsWith("https://")) {


      if(githubAPIKey) {
        await fetchRepoFiles(repoPath, githubAPIKey, localPath);
      }
      else {
        // Clone the repository
        await cloneRepository(repoPath, localPath);
      }
      
      isCloned = true;
    } else {
      // Use the local directory
      localPath = repoPath;
    }

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
          const endpoints = processJsFile(
            file,
            filePath,
            framework,
            objectInstance
          );
          apiEndpoints.push(...endpoints);
        }
      });
    }

    scanDirectory(localPath);
    return apiEndpoints;
  } catch (err) {
    throw err;
  } finally {
    isCloned && deleteClonedRepository(localPath);
  }
}


function processTsFile(file, filePath, framework, objectInstance) {
  const endpoints = [];

  const fileName = path.parse(file).name;
  let resourceName = fileName;
  let endpointPath = `/${resourceName}`;

  if (fileName !== "index") {
    const versionMatch = filePath.match(/\/v\d+\//);
    if (versionMatch) {
      const version = versionMatch[0].replace(/\//g, "");
      endpointPath = `/${version}/${resourceName}`;
    }
  }

  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  traverseForTs(sourceFile, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText() === objectInstance &&
      isTsHttpMethodCall(node, objectInstance, framework)
    ) {
      const method = node.expression.name.escapedText.toUpperCase();
      const routePath =
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])
          ? node.arguments[0].text
          : "";

      const controllerFunction = node.arguments[node.arguments.length - 1];

      function getFunctionNode(arg) {
        if (ts.isIdentifier(arg)) {
          const functionName = arg.getText();
          let functionNode = traceFunctionDefinitionForTs(
            functionName,
            sourceFile,
            filePath
          );

          if (!functionNode) {
            const importNode = findImportStatement(functionName, sourceFile);
            if (importNode) {
              const importPath = resolveImportPath(importNode, filePath);
              if (fs.existsSync(importPath)) {
                const importedContent = fs.readFileSync(importPath, "utf8");
                const importedSourceFile = ts.createSourceFile(
                  importPath,
                  importedContent,
                  ts.ScriptTarget.Latest,
                  true
                );

                functionNode = traceFunctionDefinitionForTs(
                  functionName,
                  importedSourceFile,
                  importPath
                );
              }
            }
          }
          return functionNode;
        } else if (
          ts.isArrowFunction(arg) ||
          ts.isFunctionExpression(arg) ||
          ts.isMethodDeclaration(arg)
        ) {
          return arg;
        }
        return null;
      }

      const functionNode = getFunctionNode(controllerFunction);
      const headers = extractHeadersForTs(node);
      const queryParameters = extractQueryParamsForTs(node);
      const body = extractBodyForTs(functionNode, content);

      if (
        !headers.some(
          (header) =>
            header.key.toLowerCase() === "content-type" &&
            header.value.toLowerCase() === "application/json"
        )
      ) {
        headers.push({
          key: "Content-Type",
          value: "application/json",
        });
      }

      const description = getFunctionDescriptionForTs(functionNode);

      const endpoint = {
        method,
        name: controllerFunction.getText(),
        path: `${endpointPath}${routePath}`,
        headers,
        queryParameters,
        body: { mode: "raw", raw: JSON.stringify(body) },
        file: filePath,
        resourceName,
        description,
      };

      endpoints.push(endpoint);
    }
  });

  return endpoints;
}

function resolveImportPath(importNode, filePath) {
  const moduleSpecifier = importNode.moduleSpecifier
    .getText()
    .replace(/['"]/g, "");
  const resolvedPath = path.resolve(path.dirname(filePath), moduleSpecifier);

  // Check for TypeScript and JavaScript extensions
  if (fs.existsSync(resolvedPath + ".ts")) return resolvedPath + ".ts";
  if (fs.existsSync(resolvedPath + ".js")) return resolvedPath + ".js";

  throw new Error(`Could not resolve import path: ${resolvedPath}`);
}


// Function to process JavaScript files
function processJsFile(file, filePath, framework, objectInstance) {
  const endpoints = [];
  const fileName = path.parse(file).name;

  // Determine resource name and endpoint path
  let resourceName = fileName;
  let endpointPath = `/${resourceName}`;

  // Modify endpoint path if file is not index.js
  if (fileName !== "index") {
    resourceName = fileName;

    const versionMatch = filePath.match(/\/v\d+\//);
    if (versionMatch) {
      const version = versionMatch[0].replace(/\//g, "");
      endpointPath = `/${version}/${resourceName}`;
    } else {
      endpointPath = `/${resourceName}`;
    }
  }

  // Read JavaScript files and search for route definitions based on framework
  const content = fs.readFileSync(filePath, "utf8");
  let ast;
  try {
    ast = esprima.parseScript(content, {
      tolerant: true,
      comment: true,
      range: true,
      tokens: true,
    });
  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error);
    return endpoints;
  }

  // Process AST to find and extract API endpoints
  traverseForJs(ast, (node) => {
    // Check for function declarations and function expressions
    if (
      (node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression") &&
      node.body &&
      node.body.body
    ) {
      node.body.body.forEach((bodyNode) => {
        if (
          bodyNode.type === "ExpressionStatement" &&
          bodyNode.expression.type === "CallExpression" &&
          bodyNode.expression.callee.type === "MemberExpression" &&
          bodyNode.expression.callee.object.name === objectInstance &&
          isJsHttpMethodCall(bodyNode.expression, objectInstance, framework)
        ) {
          const method = bodyNode.expression.callee.property.name.toUpperCase();
          const routePath =
            bodyNode.expression.arguments[0] &&
            bodyNode.expression.arguments[0].type === "Literal"
              ? bodyNode.expression.arguments[0].value
              : "";

          const headers = extractHeadersForJs(bodyNode);
          const queryParameters = extractQueryParamsForJs(bodyNode);
          let body = {};
          let description = "";
          let functionName = ""

          // Check all arguments for potential handler functions
          bodyNode.expression.arguments.forEach((arg) => {
            if (arg.type === "Identifier") {
              const handlerFunctionName = arg.name;
              const [tracedFunction, importPath] = traceFunctionDefinition(
                handlerFunctionName,
                filePath,
                content
              );
              if (tracedFunction) {
                functionName = handlerFunctionName;
                body = extractBodyForJs(tracedFunction, content);
                description = getFunctionDescriptionForJs(tracedFunction, importPath);

              }
            } else if (arg.type === "FunctionExpression") {
              // Handle inline function expressions
              body = extractBodyForJs(arg, content);
              description = getFunctionDescriptionForJs(arg, importPath);
            }
          });

        // Add application json header by default 
        headers.push({
          key: "Content-Type",
          value: "application/json",
        });

        // Construct endpoint object
        const endpoint = {
          method: method,
          name: functionName,
          path: `${endpointPath}${routePath}`,
          headers: headers,
          queryParameters: queryParameters,
          body: { mode: "raw", raw: JSON.stringify(body) },
          file: filePath,
          resourceName,
          description,
        };

          endpoints.push(endpoint);
        }
      });
    } else if (
      node.type === "CallExpression" &&
      node.callee &&
      node.callee.object &&
      node.callee.object.name === objectInstance &&
      isJsHttpMethodCall(node, objectInstance, framework)
    ) {
      const method = node.callee.property.name.toUpperCase();
      const routePath = node.arguments[0].value;

      // Extract headers, query parameters, and body (if available)
      const headers = extractHeadersForJs(node);
      const queryParameters = extractQueryParamsForJs(node);
      let body = {};
      let description = "";
      let functionName = "";

      // Check all arguments for potential handler functions
      node.arguments.forEach((arg) => {
        if (arg.type === "Identifier") {
          const handlerFunctionName = arg.name;
          functionName = handlerFunctionName;
          const [tracedFunction, importPath] = traceFunctionDefinition(
            handlerFunctionName,
            filePath,
            content
          );
          if (tracedFunction) {
            body = extractBodyForJs(tracedFunction, content);
            description = getFunctionDescriptionForJs(
              tracedFunction,
              importPath
            );
          }
        } else if (arg.type === "FunctionExpression") {
          // Handle inline function expressions
          body = extractBodyForJs(arg, content);
          description = getFunctionDescriptionForJs(arg, importPath);
        }
      });

      // Add application json header by default
      headers.push({
        key: "Content-Type",
        value: "application/json",
      });

      // Construct endpoint object
      const endpoint = {
        method: method,
        name: functionName,
        path: `${endpointPath}${routePath}`,
        headers: headers,
        queryParameters: queryParameters,
        body: { mode: "raw", raw: JSON.stringify(body) },
        file: filePath,
        resourceName,
        description,
      };

      endpoints.push(endpoint);
    }
  });

  return endpoints;
}

