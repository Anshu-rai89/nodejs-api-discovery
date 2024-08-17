import ts from "typescript";
import path from "path";
import fs from "fs";
import { Project, SyntaxKind } from "ts-morph";

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

export function extractHeadersForTs(node) {
  const headers = [];

  if (
    ts.isCallExpression(node) &&
    node.arguments.length > 1 &&
    ts.isObjectLiteralExpression(node.arguments[1])
  ) {
    const properties = node.arguments[1];

    properties.properties.forEach((prop) => {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isStringLiteral(prop.initializer)
      ) {
        headers.push({
          key: prop.name.getText(),
          value: prop.initializer.text,
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

export function extractBodyForTs(node) {
  const bodyKeys = {};

  // Helper function to traverse nodes and find destructuring of 'body'
  function traverse(node) {
    if (
      ts.isVariableDeclaration(node) && // Check if it's a variable declaration
      node.initializer && // Ensure the variable has an initializer
      ts.isObjectBindingPattern(node.name) && // Check for object destructuring
      ts.isPropertyAccessExpression(node.initializer) && // Ensure the initializer is a property access expression
      node.initializer.name.text === "body" // Check if the property accessed is 'body'
    ) {
      // Extract keys from the destructuring pattern
      node.name.elements.forEach((element) => {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          bodyKeys[element.name.text] = "";
        }
      });
    }

    ts.forEachChild(node, traverse); // Recursively visit child nodes
  }

  // Check if the node is a function-like node with a body
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  ) {
    if (node.body) {
      traverse(node.body); // Traverse the body to find destructured 'body' keys
    }
  }

  return bodyKeys;
}

// Example parse and traverse functions, adjust as per your setup
function tsParse(code) {
  return ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true);
}

/**
 * Traverse function to recursively visit each node in the TypeScript AST.
 * @param {object} node - AST node to visit.
 * @param {function} visitor - Visitor function to apply to each node.
 */
export function traverseForTs(node, visitor) {
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

// Helper to trace function definition in TypeScript
export function traceFunctionDefinition(functionName, sourceFile, filePath) {
  let functionNode = null;
  let functionFilePath = filePath;

  function findFunctionInNode(node, ) {
    if (!node) return null;

    // Check for function declarations
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.name.getText() === functionName
    ) {
      functionNode = node;
    }

    // Check for variable declarations with arrow functions or function expressions
    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach((declaration) => {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.getText() === functionName
        ) {
          if (
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer))
          ) {
            functionNode = declaration;
          }
        }
      });
    }

    // Check for named exports
    if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.getText() === functionName) {
        functionNode = node.expression;
      }
    }

    // Check for export declarations
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      node.exportClause.elements.forEach((element) => {
        if (element.name.getText() === functionName) {
          functionNode = element;
        }
      });
    }
  }

  // Initial scan of the source file
  ts.forEachChild(sourceFile, findFunctionInNode);

  // If function is not found locally, check imports
  if (!functionNode) {
    const importNode = findImportStatement(functionName, sourceFile);
    if (importNode) {
      const importPath = resolveImportPath(importNode, filePath);
      functionFilePath = importPath;
      const importedContent = fs.readFileSync(importPath, "utf8");
      const importedSourceFile = ts.createSourceFile(
        importPath,
        importedContent,
        ts.ScriptTarget.Latest,
        true
      );

      ts.forEachChild(importedSourceFile, findFunctionInNode);
    }
  }

  return [functionNode, functionFilePath];
}

// Helper function to find the import statement for a specific function
function findImportStatement(functionName, sourceFile) {
  let foundImportNode = null;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const namedBindings = node.importClause.namedBindings;
      if (
        namedBindings &&
        ts.isNamedImports(namedBindings) &&
        namedBindings.elements.some(
          (element) => element.name.getText() === functionName
        )
      ) {
        foundImportNode = node;
      }
    }
  });
  return foundImportNode;
}

// Helper function to resolve the import path for TypeScript files
function resolveImportPath(importNode, filePath) {
  const moduleSpecifier = importNode.moduleSpecifier
    .getText()
    .replace(/['"]/g, "");
  let resolvedPath = path.resolve(path.dirname(filePath), moduleSpecifier);

  // Ensure to append .ts extension if not present
  if (!resolvedPath.endsWith(".ts")) {
    resolvedPath = `${resolvedPath}.ts`;
  }

  return resolvedPath;
}


export function getFunctionDescriptionForTs(functionNode) {
  const comments = [];

  const commentRanges = ts.getJSDocCommentsAndTags(
    functionNode
  );

  if (commentRanges) {
    for (const range of commentRanges) {
      const comment = sourceFileText.substring(range.pos, range.end);
      comments.push(comment);
    }
  }

  return comments.join("\n").trim();
}