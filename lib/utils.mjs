import ts from "typescript";
import axios from "axios";
import fs from "fs";
import simpleGit from "simple-git";

// Updated function to check if it's an HTTP method call for TypeScript
export function isTsHttpMethodCall(node, objectInstance, framework) {
  switch (framework) {
    case "express":
      return (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.escapedText === objectInstance &&
        ["get", "post", "put", "delete"].includes(
          node.expression.name.escapedText
        )
      );
    case "fastify":
      return (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.escapedText === objectInstance &&
        ["get", "post", "put", "delete", "route"].includes(
          node.expression.name.escapedText
        )
      );
    case "nest":
      return (
        ts.isDecorator(node) &&
        ts.isCallExpression(node.expression) &&
        ["Get", "Post", "Put", "Delete"].includes(
          node.expression.expression.escapedText
        )
      );
    default:
      return false;
  }
}


export function isJsHttpMethodCall(node, objectInstance, framework) {
  switch (framework) {
    case "express":
      return ["get", "post", "put", "delete"].includes(
        node.callee.property.name
      );
    case "fastify":
      return ["get", "post", "put", "delete", "route"].includes(
        node.callee.property.name
      );
    case "nest":
      return (
        node.callee.name &&
        ["Get", "Post", "Put", "Delete"].includes(node.callee.name)
      );
    default:
      return false;
  }
}

export function extractHeadersForTs(node) {
  const headers = [];

  if (
    ts.isCallExpression(node) &&
    node.arguments.length > 1 &&
    ts.isObjectLiteralExpression(node.arguments[1])
  ) {
    const properties = node.arguments[1];
    
    properties.properties.forEach((prop) => {
      if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
        headers.push({
          key: prop.name.getText(),
          value: prop.initializer.text,
        });
      }
    });
  }

  return headers;
}

export function extractHeadersForJs(node) {
  const headers = [];

  // Example logic: Extract headers from function arguments or AST nodes
  if (
    node.arguments.length > 1 &&
    node.arguments[1].type === "ObjectExpression"
  ) {
    node.arguments[1].properties.forEach((prop) => {
      if (
        prop.key &&
        prop.key.type === "Identifier" &&
        prop.value &&
        prop.value.type === "Literal"
      ) {
        headers.push({
          key: prop.key.name,
          value: prop.value.value,
        });
      }
    });
  }

  return headers;
}
export function extractQueryParamsForTs(node) {
  const queryParameters = [];

  if (
    ts.isCallExpression(node) &&
    node.arguments.length > 0 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    const pathValue = node.arguments[0].text;
    const pathParams = pathValue.match(/:[a-zA-Z0-9_-]+/g) || [];

    pathParams.forEach((param) => {
      queryParameters.push({
        key: param.substring(1), // Remove leading ":"
        value: "", // Replace with logic to get default or example value
      });
    });
  }

  return queryParameters;
}

// Function to extract query parameters from a route definition node
export function extractQueryParamsForJs(node) {
  const queryParameters = [];

  // Example logic: Extract query parameters from route path
  const pathValue = node.arguments[0].value;
  const pathParams = pathValue.match(/:[a-zA-Z0-9_-]+/g) || [];

  pathParams.forEach((param) => {
    queryParameters.push({
      key: param.substring(1), // Remove leading ":"
      value: "exampleValue", // Replace with logic to get default or example value
    });
  });

  return queryParameters;
}

export function extractBodyForTs(node) {
  let body = {};

  // Parse the code to AST
  const ast = tsParse(node.getSourceFile().getText());

  // Traverse the AST to find assignment to req.body
  traverseForTs(ast, (node) => {
    if (
      node.kind === ts.SyntaxKind.BinaryExpression &&
      node.left.kind === ts.SyntaxKind.PropertyAccessExpression &&
      node.left.expression.getText() === "req" &&
      node.left.name.getText() === "body"
    ) {
      // Extract the body value from the assignment
      body = extractValueForTs(node.right);
    }
  });

  return body;
}

/**
 * Extracts key-value pairs from request.body in a JavaScript node.
 * @param {object} node - AST node representing JavaScript code.
 * @param {string} content - Content of the JavaScript file.
 * @returns {object} - Extracted key-value pairs from request.body.
 */
export function extractBodyForJs(node, content) {
  let body = {};

  // Find assignment to req.body
  traverseForJs(node, (childNode) => {
    if (
      childNode.type === "AssignmentExpression" &&
      childNode.left &&
      childNode.left.type === "MemberExpression" &&
      childNode.left.object &&
      childNode.left.object.name === "req" &&
      childNode.left.property &&
      childNode.left.property.name === "body"
    ) {
      // Extract the body value from the assignment
      body = extractValueForJs(childNode.right, content);
    }
  });

  return body;
}

/**
 * Traverse function to recursively visit each node in the AST.
 * @param {object} node - AST node to visit.
 * @param {function} visitor - Visitor function to apply to each node.
 */
function traverseForJs(node, visitor) {
  if (!node) return;

  visitor(node);

  for (const key in node) {
    if (node.hasOwnProperty(key)) {
      const child = node[key];
      if (typeof child === "object" && child !== null) {
        traverseForJs(child, visitor);
      }
    }
  }
}

/**
 * Extracts value from an AST node representing JavaScript code.
 * @param {object} node - AST node from which to extract the value.
 * @param {string} content - Content of the JavaScript file.
 * @returns {any} - Extracted value.
 */
function extractValueForJs(node, content) {
  if (node.type === "ObjectExpression") {
    // Extract key-value pairs from object literal
    let obj = {};
    node.properties.forEach(prop => {
      if (prop.key && prop.key.type === "Identifier" && prop.value) {
        obj[prop.key.name] = extractValue(prop.value, content);
      }
    });
    return obj;
  } else if (node.type === "Literal") {
    return node.value;
  } else if (node.type === "Identifier") {
    // Handle identifiers (variables)
    const identifierName = node.name;
    // Implement logic to fetch value from file content or other sources if needed
    // For simplicity, returning a placeholder value
    return `value of ${identifierName}`;
  }
  // Handle other types as needed
  return null;
}

// Example parse and traverse functions, adjust as per your setup
function tsParse(code) {
  return ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true);
}


// Helper function to convert ObjectExpression AST node to object
function objectFromAst(node) {
  const obj = {};
  node.properties.forEach((prop) => {
    obj[prop.key.name] = extractValue(prop.value);
  });
  return obj;
}

/**
 * Traverse function to recursively visit each node in the TypeScript AST.
 * @param {object} node - AST node to visit.
 * @param {function} visitor - Visitor function to apply to each node.
 */
function traverseForTs(node, visitor) {
  if (!node) return;

  visitor(node);

  if (node.kind === ts.SyntaxKind.SourceFile) {
    ts.forEachChild(node, (child) => {
      traverseForTs(child, visitor);
    });
  } else {
    node.forEachChild((childNode) => {
      traverseForTs(childNode, visitor);
    });
  }
}

/**
 * Extracts value from a TypeScript AST node representing TypeScript code.
 * @param {object} node - AST node from which to extract the value.
 * @param {string} content - Content of the TypeScript file.
 * @returns {any} - Extracted value.
 */
function extractValueForTs(node, content) {
  if (ts.isObjectLiteralExpression(node)) {
    // Extract key-value pairs from object literal
    let obj = {};
    node.properties.forEach(prop => {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ts.isStringLiteral(prop.initializer)) {
        obj[prop.name.getText()] = prop.initializer.text;
      }
    });
    return obj;
  } else if (ts.isLiteralExpression(node)) {
    return node.text;
  } else if (ts.isIdentifier(node)) {
    // Handle identifiers (variables)
    const identifierName = node.text;
    // Implement logic to fetch value from file content or other sources if needed
    // For simplicity, returning a placeholder value
    return `value of ${identifierName}`;
  }
  // Handle other types as needed
  return null;
}


// Function to upload or update Postman collection to Postman workspace
export async function uploadPostmanCollection(apiKey, collection, workspaceId) {
  console.log('Syncing your collections...');
  const collectionName = collection.info.name;

  // Fetch all collections in the workspace
  const response = await axios.get(
    `https://api.getpostman.com/collections`,
    {
      headers: {
        'X-Api-Key': apiKey,
      },
      params: {
        workspace: workspaceId,
      },
    }
  );

  const collections = response.data.collections;
  const existingCollection = collections.find((col) => col.name === collectionName);

  if (existingCollection) {
    // Update existing collection
    const updateResponse = await axios.put(
      `https://api.getpostman.com/collections/${existingCollection.uid}`,
      {
        collection: collection,
      },
      {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    return updateResponse.data;
  } else {
    // Create new collection
    const createResponse = await axios.post(
      `https://api.getpostman.com/collections`,
      {
        collection: collection,
      },
      {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        params: {
          workspace: workspaceId,
        },
      }
    );
    return createResponse.data;
  }
}


// Function to clone a GitHub repository
export async function cloneRepository(repoUrl, localPath) {
  try{
    const git = simpleGit();
    await git.clone(repoUrl, localPath);
  }catch(error) {
    console.log(error);
    throw new Error("Incorrect URL");
  }
}

// Function to delete the cloned repository
export function deleteClonedRepository(localPath) {
  fs.rmSync(localPath, { recursive: true, force: true });
}

export async function fetchRepoFiles(repoUrl, authToken, localPath) {
  let updatedUrl = repoUrl.replaceAll(".git", "");
  let apiUrl =
    updatedUrl.replace("https://github.com/", "https://api.github.com/repos/") +
    "/contents";

    
    console.log("API url", apiUrl);
  try {
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `token ${authToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const files = response.data;
    for (const file of files) {
      if (file.type === "file") {
        const filePath = path.join(localPath, file.name);
        const fileContent = (
          await axios.get(file.download_url, {
            headers: {
              Authorization: `token ${authToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          })
        ).data;

        fs.writeFileSync(filePath, fileContent);
      } else if (file.type === "dir") {
        const newDir = path.join(localPath, file.name);
        fs.mkdirSync(newDir, { recursive: true });
        await fetchRepoFiles(file.url, authToken, newDir); // Recursively fetch files in directories
      }
    }
  } catch (error) {
    throw error;
  }
}
