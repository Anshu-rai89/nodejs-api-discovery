import { parse } from "esprima";

// Function to check if a node is an HTTP method call based on framework
export function isHttpMethodCall(node, framework) {
  switch (framework) {
    case "express":
      return ["get", "post", "put", "delete"].includes(
        node.callee.property.name
      );

    // Add cases for other frameworks (e.g., Hapi, Koa) as needed
    default:
      return false;
  }
}

// Function to extract headers from a route definition node
export function extractHeaders(node) {
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
export function extractQueryParams(node) {
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

// Function to extract request body from a route definition node
export function extractBody(node, code) {
  let body = {};

  // Parse the code to AST
  const ast = parse(code);

  // Traverse the AST to find assignment to req.body
  traverse(ast, (node) => {
    if (
      node.type === "AssignmentExpression" &&
      node.left.type === "MemberExpression" &&
      node.left.object.name === "req" &&
      node.left.property.name === "body"
    ) {
      // Extract the body value from the assignment
      body = extractValue(node.right);
    }
  });

  return body;
}

// Helper function to extract value from AST node
function extractValue(node) {
  switch (node.type) {
    case "ObjectExpression":
      return objectFromAst(node);
    case "Literal":
      return node.value;

    // Add support for other types as needed
    default:
      return {};
  }
}

// Helper function to convert ObjectExpression AST node to object
function objectFromAst(node) {
  const obj = {};
  node.properties.forEach((prop) => {
    obj[prop.key.name] = extractValue(prop.value);
  });
  return obj;
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
