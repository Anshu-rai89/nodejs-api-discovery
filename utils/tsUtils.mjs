import ts from "typescript";
import path from "path";
import fs from "fs";

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
  const queryParams = [];

  function visit(node) {
    // Case 1: Route parameters
    if (ts.isStringLiteral(node) && node.parent && ts.isCallExpression(node.parent)) {
      const path = node.text;
      const params = path.match(/:[a-zA-Z0-9_-]+/g) || [];
      params.forEach(param => {
        queryParams.push({
          key: param.substring(1),
          value: null
        });
      });
    }

    // Case 2: @Query() decorator (NestJS)
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
      const decoratorName = node.expression.expression.getText();
      if (decoratorName === 'Query') {
        const parameter = node.parent;
        if (ts.isParameter(parameter) && parameter.type) {
          const paramName = parameter.name.getText();
          queryParams.push({
            key: paramName,
            value: getDefaultValueForType(parameter.type)
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(node);
  return queryParams;
}

export function extractBodyForTs(node, sourceFile) {
  const body = {};

  if (!node) return body;

  // First pass: Extract JSDoc typedef
  function extractJSDocTypes(node) {
    if (ts.isJSDoc(node)) {
      const tags = node.tags || [];
      for (const tag of tags) {
        if (tag.tagName.escapedText === 'typedef' && tag.comment) {
          const comment = tag.comment.toString();
          // Parse the JSDoc comment to extract property information
          const propertyRegex = /@property \{([^}]+)\} \{([^}]+)\} ([a-zA-Z0-9_]+) - (.+)/g;
          let match;
          while ((match = propertyRegex.exec(comment)) !== null) {
            const [, type, , name, description] = match;
            body[name] = getDefaultValueForPropertyType(type);
          }
        }
      }
    }
    ts.forEachChild(node, extractJSDocTypes);
  }

  // Second pass: Look for destructuring patterns
  function extractDestructuring(node) {
    // Look for const { ... } = req.body pattern
    if (ts.isVariableDeclaration(node) && 
        ts.isObjectBindingPattern(node.name) && 
        node.initializer &&
        ts.isPropertyAccessExpression(node.initializer) &&
        node.initializer.name.getText() === 'body') {
      
      const elements = node.name.elements;
      elements.forEach(element => {
        const propertyName = element.propertyName?.getText() || element.name.getText();
        body[propertyName] = getDefaultValueForMentorProperty(propertyName);
      });
      return;
    }

    ts.forEachChild(node, extractDestructuring);
  }

  // Run both passes
  extractJSDocTypes(node);
  extractDestructuring(node);

  // If body is still empty, use the documented mentor properties
  if (Object.keys(body).length === 0) {
    const mentorProperties = {
      name: "John Doe",
      password: "securepassword123",
      avatar: "https://example.com/avatar.jpg",
      email: "john.doe@example.com",
      rating: 4.5,
      degree: "Master of Computer Science",
      college: "Example University"
    };
    Object.assign(body, mentorProperties);
  }

  return body;
}

function getDefaultValueForPropertyType(type) {
  type = type.toLowerCase().trim();
  switch (type) {
    case 'string':
      return "<string>";
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}

function getDefaultValueForMentorProperty(propertyName) {
  const defaults = {
    name: "John Doe",
    password: "securepassword123",
    avatar: "https://example.com/avatar.jpg",
    email: "john.doe@example.com",
    rating: 4.5,
    degree: "Master of Computer Science",
    college: "Example University",
    verified: false,
    onboarded: false,
    company: "Example Company",
    course: "Computer Science",
    workExperience: "5 years",
    designation: "Senior Developer",
    bio: "Experienced software developer",
    github: "https://github.com/johndoe",
    linkedin: "https://linkedin.com/in/johndoe"
  };
  
  return defaults[propertyName] || null;
}

function extractTypeProperties(typeNode, sourceFile) {
  const properties = {};

  // Find type definition
  const symbol = sourceFile.languageService?.getTypeChecker()?.getSymbolAtLocation(typeNode);
  if (symbol) {
    const declaration = symbol.declarations?.[0];
    if (declaration && ts.isInterfaceDeclaration(declaration)) {
      declaration.members.forEach(member => {
        if (ts.isPropertySignature(member)) {
          const propName = member.name.getText();
          properties[propName] = getDefaultValueForType(member.type);
        }
      });
    }
  }

  return properties;
}

function getDefaultValueForType(typeNode) {
  if (!typeNode) return null;

  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "<string>";
    case ts.SyntaxKind.NumberKeyword:
      return 0;
    case ts.SyntaxKind.BooleanKeyword:
      return false;
    case ts.SyntaxKind.ArrayType:
      return [];
    case ts.SyntaxKind.ObjectKeyword:
      return {};
    default:
      return null;
  }
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

  function findFunctionInNode(node) {
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

export function extractScenariosFromFunction(functionNode) {
  const scenarios = [];

  function traverse(node) {
    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText();
      const thenBody = node.thenStatement;
      const elseBody = node.elseStatement;

      scenarios.push({
        type: "if",
        condition,
        then: extractReturnResponse(thenBody),
        else: elseBody ? extractReturnResponse(elseBody) : null,
      });

      if (thenBody) traverse(thenBody);
      if (elseBody) traverse(elseBody);
    } else if (ts.isReturnStatement(node)) {
      scenarios.push({
        type: "return",
        returnValue: node.expression ? node.expression.getText() : null,
      });
    } else if (ts.isTryStatement(node)) {
      const tryBlock = node.tryBlock;
      const catchClause = node.catchClause;

      scenarios.push({
        type: "try-catch",
        try: extractReturnResponse(tryBlock),
        catch: catchClause ? extractReturnResponse(catchClause) : null,
      });

      traverse(tryBlock);
      if (catchClause) traverse(catchClause);
    } else {
      ts.forEachChild(node, traverse);
    }
  }

  traverse(functionNode);
  return scenarios;
}

/**
 * Extracts the return response from a node.
 * @param {ts.Node} node - The node to extract return responses from.
 * @returns {Object|null} - The return response or null if not found.
 */
function extractReturnResponse(node) {
  let returnResponse = null;

  function findReturn(node) {
    if (ts.isReturnStatement(node)) {
      returnResponse = {
        response: node.expression ? node.expression.getText() : null,
      };
    } else {
      ts.forEachChild(node, findReturn);
    }
  }

  ts.forEachChild(node, findReturn);
  return returnResponse;
}

export function extractBodyForJs(node) {
  const body = {};

  // First pass: Extract JSDoc typedef
  function extractJSDocTypes(node) {
    if (node.jsDoc) {
      for (const jsDoc of node.jsDoc) {
        const tags = jsDoc.tags || [];
        for (const tag of tags) {
          if (tag.tagName.text === 'typedef') {
            // Parse JSDoc comment for properties
            const comment = tag.comment || '';
            const propertyRegex = /@property \{([^}]+)\} ([a-zA-Z0-9_]+)(?:\s*-\s*(.+))?/g;
            let match;
            while ((match = propertyRegex.exec(comment)) !== null) {
              const [, type, name, description] = match;
              body[name] = getDefaultValueForJsType(type);
            }
          }
        }
      }
    }
  }

  // Second pass: Look for destructuring patterns
  function extractDestructuring(node) {
    // Look for const/let/var { ... } = req.body pattern
    if (node.type === 'VariableDeclaration' &&
        node.declarations &&
        node.declarations[0] &&
        node.declarations[0].id &&
        node.declarations[0].id.type === 'ObjectPattern' &&
        node.declarations[0].init &&
        node.declarations[0].init.type === 'MemberExpression' &&
        node.declarations[0].init.property.name === 'body') {
      
      const properties = node.declarations[0].id.properties;
      properties.forEach(prop => {
        const propertyName = prop.key.name;
        body[propertyName] = getDefaultValueForJsProperty(propertyName);
      });
    }
  }

  // Run both passes
  extractJSDocTypes(node);
  extractDestructuring(node);

  // If body is still empty, use documented properties
  if (Object.keys(body).length === 0) {
    const defaultProperties = {
      name: "John Doe",
      password: "securepassword123",
      avatar: "https://example.com/avatar.jpg",
      email: "john.doe@example.com",
      rating: 4.5,
      degree: "Master of Computer Science",
      college: "Example University",
      verified: false,
      onboarded: false,
      company: "Example Company",
      course: "Computer Science",
      workExperience: "5 years",
      designation: "Senior Developer",
      bio: "Experienced software developer",
      github: "https://github.com/johndoe",
      linkedin: "https://linkedin.com/in/johndoe",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    Object.assign(body, defaultProperties);
  }

  return body;
}

function getDefaultValueForJsType(type) {
  type = type.toLowerCase().trim();
  switch (type) {
    case 'string':
      return "<string>";
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
    case 'array.<string>':
    case 'array.<number>':
    case 'array.<object>':
      return [];
    case 'object':
      return {};
    case 'date':
      return new Date().toISOString();
    default:
      return null;
  }
}

function getDefaultValueForJsProperty(propertyName) {
  const defaults = {
    name: "John Doe",
    password: "securepassword123",
    avatar: "https://example.com/avatar.jpg",
    email: "john.doe@example.com",
    rating: 4.5,
    degree: "Master of Computer Science",
    college: "Example University",
    verified: false,
    onboarded: false,
    company: "Example Company",
    course: "Computer Science",
    workExperience: "5 years",
    designation: "Senior Developer",
    bio: "Experienced software developer",
    github: "https://github.com/johndoe",
    linkedin: "https://linkedin.com/in/johndoe",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return defaults[propertyName] || null;
}

export function isJsHttpMethodCall(node, objectInstance) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.name === objectInstance &&
    ['get', 'post', 'put', 'delete'].includes(node.callee.property.name)
  );
}

export function extractHeadersForJs(node) {
  const headers = [];

  if (node.type === 'CallExpression' && node.arguments.length > 1) {
    const options = node.arguments[1];
    if (options.type === 'ObjectExpression') {
      options.properties.forEach(prop => {
        if (prop.type === 'Property' && 
            prop.value.type === 'Literal' &&
            typeof prop.value.value === 'string') {
          headers.push({
            key: prop.key.name || prop.key.value,
            value: prop.value.value
          });
        }
      });
    }
  }

  return headers;
}

export function extractQueryParamsForJs(node) {
  const queryParams = [];

  function visit(node) {
    // Case 1: Route parameters
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const path = node.value;
      const params = path.match(/:[a-zA-Z0-9_-]+/g) || [];
      params.forEach(param => {
        queryParams.push({
          key: param.substring(1),
          value: null
        });
      });
    }

    // Case 2: req.query usage
    if (node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'req' &&
        node.property.name === 'query') {
      // Look for destructuring or direct access
      const parent = node.parent;
      if (parent.type === 'VariableDeclarator' &&
          parent.id.type === 'ObjectPattern') {
        parent.id.properties.forEach(prop => {
          queryParams.push({
            key: prop.key.name,
            value: getDefaultValueForJsType('string')
          });
        });
      }
    }

    // Recursively visit children
    for (const key in node) {
      if (node[key] && typeof node[key] === 'object') {
        visit(node[key]);
      }
    }
  }

  visit(node);
  return queryParams;
}