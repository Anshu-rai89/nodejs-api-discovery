# Node.js API Endpoint Discovery and Postman Collection Generator

This Node.js npm package scans a directory for API endpoints implemented using Express framework, extracts endpoint details including headers, query parameters, and request body, and generates a Postman API collection file.

## Installation

```bash
npm install nodejs-api-discovery
```

## Requirements

 - Node.js version 18 or higher

## Supported Frameworks

 - Express
 - Fastify 
 - Sails
 - Nest

## Usage

1. **Configuration**

   Modify the `config.json` file to specify the directory to scan, the server framework (`express` for now), the object instance where endpoints are defined (`app` for Express), and other parameters.

   ```json
   {
     "directoryToScan": "./",
     "framework": "express",
     "objectInstance": "app",
     "postmanCollectionFile": "./postman_collection.json",
     "baseUrl": "http://localhost:3000"
   }

   ```

2. **Run tool**
  Use the following command to run the tool with your configuration file:

   ```bash
   nodejs-api-discovery -c ./config.json
   ```

3. **Generated Postman Collection**

    The generated Postman collection (postman_collection.json) contains API endpoints with methods, URLs prefixed by baseUrl, headers, query parameters, and request bodies (if available).

## Next Steps

### Future Improvements

- **Support for More Frameworks**: Extend the tool to support other Node.js frameworks like Hapi, Koa, etc.
  
- **Enhanced Body Parsing**: Improve body parsing logic to handle more complex body types (e.g., JSON, form-data, multipart).

- **Query Parameters**: Currently supports basic query parameter extraction. Enhance to handle nested parameters and arrays.

- **Error Handling and Edge Cases**: Add robust error handling for parsing failures and handle edge cases in route definition parsing.


## Contributing
Contributions are welcome! Fork the repository, create a feature branch, and submit a pull request with your enhancements.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.


### Notes:

- This markdown section provides a clear and structured guide on how to install, configure, and use your npm package for discovering API endpoints and generating a Postman collection.
- Adjust paths (`index.mjs`, `config.json`, etc.) and specific configurations (`baseUrl`, `framework`, etc.) according to your actual project setup and requirements.
- Ensure to include this section in your `README.md` file in the root directory of your npm package to effectively communicate usage instructions to users and contributors.
