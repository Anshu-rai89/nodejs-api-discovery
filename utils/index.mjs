import axios from "axios";
import fs from "fs";
import simpleGit from "simple-git";


// Function to upload or update Postman collection to Postman workspace
export async function uploadPostmanCollection(apiKey, collection, workspaceId) {
  console.log("Syncing your collections...");
  const collectionName = collection.info.name;

  // Fetch all collections in the workspace
  const response = await axios.get(`https://api.getpostman.com/collections`, {
    headers: {
      "X-Api-Key": apiKey,
    },
    params: {
      workspace: workspaceId,
    },
  });

  const collections = response.data.collections;
  const existingCollection = collections.find(
    (col) => col.name === collectionName
  );

  if (existingCollection) {
    // Update existing collection
    const updateResponse = await axios.put(
      `https://api.getpostman.com/collections/${existingCollection.uid}`,
      {
        collection: collection,
      },
      {
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
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
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
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
  try {
    const git = simpleGit();
    await git.clone(repoUrl, localPath);
  } catch (error) {
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
