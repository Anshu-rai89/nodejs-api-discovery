import path from "path";
import fs from "fs";
import esprima from "esprima";
import doctrine from 'doctrine';


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

/**
 * Extracts key-value pairs from request.body in a JavaScript node.
 * @param {object} node - AST node representing JavaScript code.
 * @param {string} content - Content of the JavaScript file.
 * @returns {object} - Extracted key-value pairs from request.body.
 */
export function extractBodyForJs(node, filePath) {
  let body = {};

  // Traverse the AST to find relevant nodes
  traverseForJs(node, (childNode) => {
    if (
      childNode.type === "AssignmentExpression" &&
      childNode.left &&
      childNode.left.type === "MemberExpression" &&
      childNode.left.property &&
      childNode.left.property.name === "body"
    ) {
      // Extract the body value from the assignment
      body = extractValueForJs(childNode.right, content);
    }

    // Handle destructuring from req.body (or anyObject.body)
    if (
      childNode.type === "VariableDeclarator" &&
      childNode.id &&
      childNode.id.type === "ObjectPattern" &&
      childNode.init &&
      childNode.init.type === "MemberExpression" &&
      childNode.init.property.name === "body"
    ) {
      // Extract keys from the destructuring pattern
      childNode.id.properties.forEach((property) => {
        if (property.key && property.key.name) {
          body[property.key.name] = null; // Set to null or default value
        }
      });
    }
  });

  return body;
}

/**
 * Traverse function to recursively visit each node in the AST.
 * @param {object} node - AST node to visit.
 * @param {function} visitor - Visitor function to apply to each node.
 */
export function traverseForJs(node, visitor) {
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
    node.properties.forEach((prop) => {
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

// Helper function to convert ObjectExpression AST node to object
function objectFromAst(node) {
  const obj = {};
  node.properties.forEach((prop) => {
    obj[prop.key.name] = extractValue(prop.value);
  });
  return obj;
}

// Function to trace and extract the function body even if it's imported from another file
export function traceFunctionDefinition(functionName, filePath) {
  let content;
  let ast;
  let functionPath = filePath;
  try {
    content = fs.readFileSync(filePath, "utf8");
    ast = esprima.parseScript(content, { tolerant: true });
  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error);
    return null;
  }

  let functionDefinition = null;

  function findFunctionDeclaration(node, functionName) {
    // Handle regular function declarations
    if (
      (node.type === "FunctionDeclaration" && node.id.name === functionName) ||
      (node.type === "VariableDeclaration" &&
        node.declarations.some(
          (decl) =>
            decl.init &&
            (decl.init.type === "FunctionExpression" ||
              decl.init.type === "ArrowFunctionExpression") &&
            decl.id.name === functionName
        )) ||
      (node.type === "ExportNamedDeclaration" &&
        node.declaration &&
        node.declaration.declarations &&
        node.declaration.declarations.some(
          (decl) =>
            decl.init &&
            (decl.init.type === "FunctionExpression" ||
              decl.init.type === "ArrowFunctionExpression") &&
            decl.id.name === functionName
        ))
    ) {
      functionDefinition = node;
    }

    // Handle export default
    if (
      node.type === "ExportDefaultDeclaration" &&
      node.declaration.type === "FunctionDeclaration"
    ) {
      functionDefinition = node.declaration;
    }

    // Handle CommonJS exports like module.exports.functionName or exports.functionName
    if (
      node.type === "AssignmentExpression" &&
      node.left.type === "MemberExpression" &&
      node.left.object &&
      (node.left.object?.object?.name === "module" ||
        node.left.object?.object?.name === "exports") &&
      node.left.property.name === functionName
    ) {
      if (
        node.right.type === "FunctionExpression" ||
        node.right.type === "ArrowFunctionExpression" ||
        node.right.type === "FunctionDeclaration"
      ) {
        functionDefinition = node.right;
      }
    }

    // Handle CommonJS exports as an object like module.exports = { functionName: function() {} }
    if (
      node.type === "AssignmentExpression" &&
      node.left.type === "MemberExpression" &&
      node.left.object.name === "module" &&
      node.left.property.name === "exports" &&
      node.right.type === "ObjectExpression"
    ) {
      node.right.properties.forEach((prop) => {
        if (
          prop.key.name === functionName &&
          (prop.value.type === "FunctionExpression" ||
            prop.value.type === "ArrowFunctionExpression" ||
            prop.value.type === "FunctionDeclaration")
        ) {
          functionDefinition = prop.value;
        }
      });
    }
  }

  function findFunctionImport(node) {
    if (node.type === "ImportDeclaration") {
      // ES Module import
      const importedFunction = node.specifiers.find(
        (spec) => spec.imported.name === functionName
      );
      if (importedFunction) {
        const importPath =
          path.resolve(path.dirname(filePath), node.source.value) + ".js";

        functionPath = importPath;
        functionDefinition = traceFunctionDefinition(
          importedFunction.local.name,
          importPath
        )[0];
      }
    } else if (
      node.type === "VariableDeclaration" &&
      node.declarations.some(
        (decl) =>
          decl.init &&
          decl.init.type === "CallExpression" &&
          decl.init.callee.name === "require"
      )
    ) {
      // CommonJS require
      const decl = node.declarations.find((d) => {
        if (d.id.name) {
          return d.id.name === functionName ? node : null;
        } else if (d.id.type === "ObjectPattern") {
          const properties = d.id.properties;
          const type = Array.isArray(properties);

          const data = properties.find(
            (property) => property.key.name === functionName
          );
          return data ? node : null;
        }

        return undefined;
      });
      if (decl) {
        const importPath =
          path.resolve(path.dirname(filePath), decl.init.arguments[0].value) +
          ".js";
        functionPath = importPath;
        functionDefinition = traceFunctionDefinition(functionName, importPath)[0];
      }
    } else if (
      node.type === "ExpressionStatement" &&
      node.expression.type === "AssignmentExpression" &&
      node.expression.right.type === "CallExpression" &&
      node.expression.right.callee.name === "require"
    ) {
      // Handle CommonJS module.exports = require(...)
      const importPath = path.resolve(
        path.dirname(filePath),
        node.expression.right.arguments[0].value
      );

      functionPath = importPath;
      functionDefinition = traceFunctionDefinition(functionName, importPath+'.js')[0];
    }
  }

  function traverse(node, visitors) {
    if (!node || typeof node !== "object") return;
    visitors(node);
    Object.keys(node).forEach((key) => {
      traverse(node[key], visitors);
    });
  }

  traverse(ast, (node) => {
    findFunctionDeclaration(node, functionName);
    if (!functionDefinition) {
      findFunctionImport(node);
    }
  });

  return [functionDefinition, functionPath];
}



export function getFunctionDescriptionForJs(functionNode, filePath) {
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
    return "";
  }

  const comments = ast.comments;
  const functionRange = functionNode.range;

  // Find the JSDoc comment associated with the function node
  const jsdocComment = comments
    .filter(
      (comment) =>
        comment.type === "Block" && comment.value.trim().startsWith("*")
    )
    .find((comment) => {
      const commentEnd = comment.range[1];
      return commentEnd <= functionRange[0];
    });

  if (jsdocComment) {
    const parsedComment = doctrine.parse(jsdocComment.value, { unwrap: true });
    let description = parsedComment.description;
    parsedComment.tags && parsedComment.tags.map(tag => {
      if(tag.description) description +=  " " + tag.description;
    });

    return description;
  } else {
    return null;
  }
}