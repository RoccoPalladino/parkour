/**
 * Generate frontend ABI and address files from deployments
 * This script reads deployment information from hardhat-deploy and updates frontend files
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

// Network chain IDs mapping
const NETWORK_CHAIN_IDS: Record<string, number> = {
  hardhat: 31337,
  anvil: 31337,
  localhost: 31337,
  sepolia: 11155111,
};

// Network names mapping
const NETWORK_NAMES: Record<string, string> = {
  hardhat: "Localhost",
  anvil: "Localhost",
  localhost: "Localhost",
  sepolia: "Sepolia",
};

interface DeploymentInfo {
  address: string;
  abi: any[];
  transactionHash?: string;
}

interface AddressEntry {
  address?: `0x${string}`;
  chainId: number;
  chainName?: string;
}

/**
 * Read deployment information from hardhat-deploy
 */
function readDeployment(network: string, contractName: string): DeploymentInfo | null {
  const deploymentPath = resolve(
    __dirname,
    "..",
    "deployments",
    network,
    `${contractName}.json`
  );

  if (!existsSync(deploymentPath)) {
    return null;
  }

  try {
    const content = readFileSync(deploymentPath, "utf-8");
    const deployment = JSON.parse(content);
    return {
      address: deployment.address,
      abi: deployment.abi || [],
      transactionHash: deployment.transactionHash,
    };
  } catch (error) {
    console.error(`Error reading deployment for ${network}:`, error);
    return null;
  }
}

/**
 * Read ABI from compiled artifacts
 */
function readABIFromArtifacts(contractName: string): any[] | null {
  const artifactPath = resolve(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`
  );

  if (!existsSync(artifactPath)) {
    return null;
  }

  try {
    const content = readFileSync(artifactPath, "utf-8");
    const artifact = JSON.parse(content);
    return artifact.abi || [];
  } catch (error) {
    console.error(`Error reading ABI for ${contractName}:`, error);
    return null;
  }
}

/**
 * Generate addresses file content
 */
function generateAddressesFile(
  deployments: Map<string, DeploymentInfo>
): string {
  const addresses: Record<string, AddressEntry> = {};

  // Add entries for known networks
  // Process networks in priority order to handle shared chainIds (e.g., localhost, hardhat, anvil all use 31337)
  const networkPriority = ["localhost", "hardhat", "anvil", "sepolia"];
  
  for (const network of networkPriority) {
    if (!NETWORK_CHAIN_IDS[network]) continue;
    
    const chainId = NETWORK_CHAIN_IDS[network];
    const chainIdStr = chainId.toString();
    
    // Only add if not already set (to avoid overwriting with higher priority network)
    if (!addresses[chainIdStr]) {
      const deployment = deployments.get(network);
      addresses[chainIdStr] = {
        address: deployment?.address as `0x${string}` | undefined,
        chainId,
        chainName: NETWORK_NAMES[network],
      };
    }
  }
  
  // Also process any remaining known networks not in priority list
  for (const [network, chainId] of Object.entries(NETWORK_CHAIN_IDS)) {
    const chainIdStr = chainId.toString();
    if (!addresses[chainIdStr]) {
      const deployment = deployments.get(network);
      addresses[chainIdStr] = {
        address: deployment?.address as `0x${string}` | undefined,
        chainId,
        chainName: NETWORK_NAMES[network],
      };
    }
  }

  const content = `// Auto-generated file - do not edit manually
// This file is generated from deployment information
export const ParkourGameAddresses: Record<
  string,
  { address?: \`0x\${string}\`; chainId: number; chainName?: string }
> = {
${Object.entries(addresses)
  .map(
    ([chainId, entry]) => `  "${chainId}": {
    // ${entry.chainName || "Unknown"} deployment
    address: ${entry.address ? `"${entry.address}"` : "undefined"}, // ${entry.address ? "" : "Not deployed yet"}
    chainId: ${entry.chainId},
    chainName: "${entry.chainName || "Unknown"}",
  },`
  )
  .join("\n")}
};
`;

  return content;
}

/**
 * Generate ABI file content
 */
function generateABIFile(abi: any[]): string {
  const content = `// Auto-generated file - do not edit manually
// This file is generated from compiled contract artifacts
export const ParkourGameABI = {
  abi: ${JSON.stringify(abi, null, 2)},
};
`;

  return content;
}

/**
 * Discover all deployed networks from deployments directory
 */
function discoverDeployedNetworks(contractName: string): string[] {
  const deploymentsDir = resolve(__dirname, "..", "deployments");
  if (!existsSync(deploymentsDir)) {
    return [];
  }

  const networks: string[] = [];
  try {
    const entries = readdirSync(deploymentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const network = entry.name;
        const deploymentPath = resolve(deploymentsDir, network, `${contractName}.json`);
        if (existsSync(deploymentPath)) {
          networks.push(network);
        }
      }
    }
  } catch (error) {
    console.error("Error discovering networks:", error);
  }
  return networks;
}

/**
 * Main function
 */
function main() {
  const contractName = "ParkourGame";
  
  // Define known networks to check (for address mapping)
  const knownNetworks = ["hardhat", "anvil", "localhost", "sepolia"];
  
  // Discover all deployed networks
  const deployedNetworks = discoverDeployedNetworks(contractName);
  
  // Combine known networks and discovered networks (remove duplicates)
  const allNetworks = Array.from(new Set([...knownNetworks, ...deployedNetworks]));

  console.log("Generating frontend files...\n");

  // Read ABI from artifacts
  const abi = readABIFromArtifacts(contractName);
  if (!abi || abi.length === 0) {
    console.error("Error: Could not read ABI from artifacts. Please compile contracts first.");
    console.error("Run: npm run compile");
    process.exit(1);
  }
  console.log(`✓ Read ABI from artifacts (${abi.length} items)`);

  // Read deployments for each network
  const deployments = new Map<string, DeploymentInfo>();
  for (const network of allNetworks) {
    const deployment = readDeployment(network, contractName);
    if (deployment) {
      deployments.set(network, deployment);
      console.log(`✓ Found deployment on ${network}: ${deployment.address}`);
    } else {
      console.log(`⊘ No deployment found on ${network} (skipping)`);
    }
  }

  // Generate addresses file
  const addressesContent = generateAddressesFile(deployments);
  const addressesPath = resolve(__dirname, "..", "..", "frontend", "abi", "ParkourGameAddresses.ts");
  writeFileSync(addressesPath, addressesContent, "utf-8");
  console.log(`✓ Generated addresses file: ${addressesPath}`);

  // Generate ABI file
  const abiContent = generateABIFile(abi);
  const abiPath = resolve(__dirname, "..", "..", "frontend", "abi", "ParkourGameABI.ts");
  writeFileSync(abiPath, abiContent, "utf-8");
  console.log(`✓ Generated ABI file: ${abiPath}`);

  console.log("\n✅ Frontend files generated successfully!");
  console.log("\nDeployment summary:");
  for (const [network, chainId] of Object.entries(NETWORK_CHAIN_IDS)) {
    const deployment = deployments.get(network);
    if (deployment) {
      console.log(`  ${network} (chainId: ${chainId}): ${deployment.address}`);
    } else {
      console.log(`  ${network} (chainId: ${chainId}): Not deployed`);
    }
  }
}

main();

