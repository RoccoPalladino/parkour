"use client";

import { ethers } from "ethers";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FhevmInstance } from "@/fhevm/fhevmTypes";
import { FhevmDecryptionSignature } from "@/fhevm/FhevmDecryptionSignature";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";
// ABI and addresses are generated after contract deployment
import { ParkourGameABI } from "@/abi/ParkourGameABI";
import { ParkourGameAddresses } from "@/abi/ParkourGameAddresses";

type ParkourGameInfoType = {
  abi: typeof ParkourGameABI.abi;
  address?: `0x${string}`;
  chainId?: number;
  chainName?: string;
};

function getParkourGameByChainId(
  chainId: number | undefined
): ParkourGameInfoType {
  if (!chainId) {
    return { abi: ParkourGameABI.abi };
  }

  const entry =
    ParkourGameAddresses[chainId.toString() as keyof typeof ParkourGameAddresses];

  // If entry exists in known networks but has no valid address, return chainId for potential warning
  if (entry && (!entry.address || entry.address === ethers.ZeroAddress || entry.address === undefined)) {
    return { abi: ParkourGameABI.abi, chainId, chainName: entry.chainName };
  }

  // If entry exists and has valid address
  if (entry && entry.address && entry.address !== ethers.ZeroAddress) {
    return {
      address: entry.address as `0x${string}`,
      chainId: entry.chainId ?? chainId,
      chainName: entry.chainName,
      abi: ParkourGameABI.abi,
    };
  }

  // If entry doesn't exist (unknown network), return without chainId to avoid warning
  return { abi: ParkourGameABI.abi };
}

export const useParkourGame = (parameters: {
  instance: FhevmInstance | undefined;
  fhevmDecryptionSignatureStorage: GenericStringStorage;
  eip1193Provider: ethers.Eip1193Provider | undefined;
  chainId: number | undefined;
  ethersSigner: ethers.JsonRpcSigner | undefined;
  ethersReadonlyProvider: ethers.ContractRunner | undefined;
  sameChain: React.RefObject<(chainId: number | undefined) => boolean>;
  sameSigner: React.RefObject<
    (ethersSigner: ethers.JsonRpcSigner | undefined) => boolean
  >;
}) => {
  const {
    instance,
    fhevmDecryptionSignatureStorage,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  } = parameters;

  const [hasCharacter, setHasCharacter] = useState<boolean>(false);
  const [characterTokenId, setCharacterTokenId] = useState<bigint | undefined>(undefined);
  const [isMinting, setIsMinting] = useState<boolean>(false);
  const [playerScore, setPlayerScore] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(false);
  const [leaderboard, setLeaderboard] = useState<Array<{
    rank: number;
    address: string;
    encryptedScoreHandle: string;
    timestamp: bigint;
  }>>([]);
  const [message, setMessage] = useState<string>("");

  const parkourGameRef = useRef<ParkourGameInfoType | undefined>(undefined);
  const isSubmittingRef = useRef<boolean>(false);
  const isDecryptingRef = useRef<boolean>(false);

  const parkourGame = useMemo(() => {
    const c = getParkourGameByChainId(chainId);
    parkourGameRef.current = c;
    // Only show warning if chainId is defined, exists in known networks, but has no address
    if (chainId !== undefined && c.chainId === chainId && !c.address) {
      setMessage(`ParkourGame deployment not found for chainId=${chainId}${c.chainName ? ` (${c.chainName})` : ''}.`);
    } else if (c.address) {
      // Clear message if address exists
      setMessage("");
    }
    return c;
  }, [chainId]);

  const isDeployed = useMemo(() => {
    if (!parkourGame) {
      return undefined;
    }
    // If chainId is undefined or not in known networks, return undefined (don't show warning)
    if (chainId === undefined || parkourGame.chainId === undefined) {
      return undefined;
    }
    // Only return false if chainId is known but has no address
    return Boolean(parkourGame.address && parkourGame.address !== ethers.ZeroAddress);
  }, [parkourGame, chainId]);

  // Check if player has character
  const checkCharacter = useCallback(async () => {
    if (!parkourGame.address || !ethersReadonlyProvider || !ethersSigner) {
      setHasCharacter(false);
      return;
    }

    try {
      const contract = new ethers.Contract(
        parkourGame.address,
        parkourGame.abi,
        ethersReadonlyProvider
      );

      const userAddress = await ethersSigner.getAddress();
      const [hasChar, tokenId] = await contract.hasCharacter(userAddress);
      setHasCharacter(hasChar);
      setCharacterTokenId(tokenId ? BigInt(tokenId.toString()) : undefined);
    } catch (error) {
      console.error("Error checking character:", error);
      setHasCharacter(false);
    }
  }, [parkourGame.address, parkourGame.abi, ethersReadonlyProvider, ethersSigner]);

  useEffect(() => {
    checkCharacter();
  }, [checkCharacter]);

  // Mint character
  const mintCharacter = useCallback(async () => {
    if (isMinting || !parkourGame.address || !ethersSigner) {
      return;
    }

    setIsMinting(true);
    setMessage("Minting character...");

    try {
      const contract = new ethers.Contract(
        parkourGame.address,
        parkourGame.abi,
        ethersSigner
      );

      const tx = await contract.mintCharacter();
      setMessage(`Transaction sent: ${tx.hash}`);
      await tx.wait();
      setMessage("Character minted successfully!");
      await checkCharacter();
    } catch (error: any) {
      setMessage(`Mint failed: ${error.message}`);
    } finally {
      setIsMinting(false);
    }
  }, [isMinting, parkourGame.address, parkourGame.abi, ethersSigner, checkCharacter]);

  // Submit score
  const submitScore = useCallback(
    async (score: number) => {
      if (isSubmittingRef.current || !parkourGame.address || !instance || !ethersSigner) {
        return;
      }

      if (!hasCharacter) {
        setMessage("You need to mint a character first!");
        return;
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setMessage(`Encrypting and submitting score ${score}...`);

      const thisChainId = chainId;
      const thisParkourGameAddress = parkourGame.address;
      const thisEthersSigner = ethersSigner;

      const run = async () => {
        const isStale = () =>
          thisParkourGameAddress !== parkourGameRef.current?.address ||
          !sameChain.current(thisChainId) ||
          !sameSigner.current(thisEthersSigner);

        try {
          await new Promise((resolve) => setTimeout(resolve, 100));

          const input = instance.createEncryptedInput(
            thisParkourGameAddress,
            thisEthersSigner.address
          );
          input.add32(score);

          const enc = await input.encrypt();

          if (isStale()) {
            setMessage("Ignore score submission");
            return;
          }

          setMessage("Submitting encrypted score to contract...");

          const contract = new ethers.Contract(
            thisParkourGameAddress,
            parkourGameRef.current!.abi,
            thisEthersSigner
          );

          const tx = await contract.submitScore(enc.handles[0], enc.inputProof);
          setMessage(`Transaction sent: ${tx.hash}`);

          const receipt = await tx.wait();
          setMessage(`Score submitted successfully! Status: ${receipt?.status}`);

          if (isStale()) return;

        } catch (error: any) {
          setMessage(`Submit score failed: ${error.message}`);
        } finally {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
        }
      };

      run();
    },
    [
      parkourGame.address,
      parkourGame.abi,
      instance,
      ethersSigner,
      chainId,
      hasCharacter,
      sameChain,
      sameSigner,
    ]
  );

  // Decrypt score
  const decryptScore = useCallback(async () => {
    if (isDecryptingRef.current || !parkourGame.address || !instance || !ethersSigner) {
      return;
    }

    isDecryptingRef.current = true;
    setIsDecrypting(true);
    setMessage("Decrypting score...");

    const thisChainId = chainId;
    const thisParkourGameAddress = parkourGame.address;
    const thisEthersSigner = ethersSigner;

    const run = async () => {
      const isStale = () =>
        thisParkourGameAddress !== parkourGameRef.current?.address ||
        !sameChain.current(thisChainId) ||
        !sameSigner.current(thisEthersSigner);

      try {
        const userAddress = await thisEthersSigner.getAddress();
        const contract = new ethers.Contract(
          thisParkourGameAddress,
          parkourGameRef.current!.abi,
          ethersReadonlyProvider!
        );

        const result = await contract.getPlayerScore(userAddress);
        const encryptedScoreHandle = result[0]; // euint32 is returned as bytes32 handle
        const exists = result[2];

        if (!exists) {
          setMessage("No score found for this player");
          return;
        }

        // Check if handle is zero (not initialized)
        const handleString = typeof encryptedScoreHandle === "string" 
          ? encryptedScoreHandle 
          : encryptedScoreHandle.toString();
        
        if (handleString === ethers.ZeroHash || handleString === "0x0000000000000000000000000000000000000000000000000000000000000000") {
          setPlayerScore("0");
          setMessage("Score: 0");
          return;
        }

        const sig = await FhevmDecryptionSignature.loadOrSign(
          instance,
          [thisParkourGameAddress as `0x${string}`],
          thisEthersSigner,
          fhevmDecryptionSignatureStorage
        );

        if (!sig) {
          setMessage("Unable to build FHEVM decryption signature");
          return;
        }

        if (isStale()) {
          setMessage("Ignore decryption");
          return;
        }

        setMessage("Calling FHEVM userDecrypt...");

        const res = await instance.userDecrypt(
          [{ handle: handleString, contractAddress: thisParkourGameAddress }],
          sig.privateKey,
          sig.publicKey,
          sig.signature,
          sig.contractAddresses,
          sig.userAddress,
          sig.startTimestamp,
          sig.durationDays
        );

        setMessage("Decryption completed!");

        if (isStale()) {
          setMessage("Ignore decryption");
          return;
        }

        const decryptedValue = res[handleString];
        setPlayerScore(decryptedValue.toString());
        setMessage(`Your score: ${decryptedValue}`);

      } catch (error: any) {
        setMessage(`Decryption failed: ${error.message}`);
      } finally {
        isDecryptingRef.current = false;
        setIsDecrypting(false);
      }
    };

    run();
  }, [
    parkourGame.address,
    parkourGame.abi,
    instance,
    ethersSigner,
    ethersReadonlyProvider,
    chainId,
    fhevmDecryptionSignatureStorage,
    sameChain,
    sameSigner,
  ]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    if (!parkourGame.address || !ethersReadonlyProvider) {
      return;
    }

    setIsLoadingLeaderboard(true);
    setMessage("Loading leaderboard...");

    const thisChainId = chainId;
    const thisParkourGameAddress = parkourGame.address;

    const run = async () => {
      const isStale = () =>
        thisParkourGameAddress !== parkourGameRef.current?.address ||
        !sameChain.current(thisChainId);

      try {
        const contract = new ethers.Contract(
          thisParkourGameAddress,
          parkourGameRef.current!.abi,
          ethersReadonlyProvider
        );

        // Get leaderboard data from contract (only addresses and timestamps)
        const result = await contract.getLeaderboard();
        const players: string[] = result[0];
        const timestamps: bigint[] = result[1];

        if (players.length === 0) {
          setLeaderboard([]);
          setMessage("No players in leaderboard yet");
          return;
        }

        if (isStale()) {
          setMessage("Ignore leaderboard fetch");
          return;
        }

        setMessage(`Fetching ${players.length} player scores...`);

        // Fetch encrypted scores for each player
        const scorePromises = players.map(async (player: string) => {
          const scoreResult = await contract.getPlayerScore(player);
          return {
            player,
            encryptedScore: scoreResult[0], // euint32 handle
            timestamp: scoreResult[1],
            exists: scoreResult[2],
          };
        });

        const playerScores = await Promise.all(scorePromises);

        // Filter out players without scores
        const validScores = playerScores.filter(ps => ps.exists);

        if (validScores.length === 0) {
          setLeaderboard([]);
          setMessage("No valid scores found");
          return;
        }

        if (isStale()) {
          setMessage("Ignore leaderboard fetch");
          return;
        }

        setMessage(`Building leaderboard with encrypted scores...`);

        // Build leaderboard entries with encrypted score handles (no decryption)
        const entries = validScores
          .map((ps) => {
            const handleString = typeof ps.encryptedScore === "string" 
              ? ps.encryptedScore 
              : String(ps.encryptedScore);
            
            // Skip zero handles
            if (handleString === ethers.ZeroHash || handleString === "0x0000000000000000000000000000000000000000000000000000000000000000") {
              return null;
            }
            
            return {
              address: ps.player,
              encryptedScoreHandle: handleString,
              timestamp: ps.timestamp,
            };
          })
          .filter((item): item is { 
            address: string;
            encryptedScoreHandle: string;
            timestamp: bigint;
          } => item !== null);

        if (entries.length === 0) {
          setLeaderboard([]);
          setMessage("No valid scores found");
          return;
        }

        // Sort by timestamp (descending, most recent first) since we can't sort by encrypted scores
        entries.sort((a, b) => {
          if (a.timestamp > b.timestamp) return -1;
          if (a.timestamp < b.timestamp) return 1;
          return 0;
        });
        const rankedEntries = entries.map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));

        setLeaderboard(rankedEntries);
        setMessage(`Leaderboard loaded: ${rankedEntries.length} players`);

      } catch (error: any) {
        console.error("Error fetching leaderboard:", error);
        setMessage(`Failed to load leaderboard: ${error.message}`);
      } finally {
        setIsLoadingLeaderboard(false);
      }
    };

    run();
  }, [
    parkourGame.address,
    parkourGame.abi,
    ethersReadonlyProvider,
    chainId,
    sameChain,
  ]);

  return {
    contractAddress: parkourGame.address,
    isDeployed,
    hasCharacter,
    characterTokenId,
    isMinting,
    mintCharacter,
    submitScore,
    playerScore,
    isSubmitting,
    isDecrypting,
    decryptScore,
    message,
    checkCharacter,
    leaderboard,
    isLoadingLeaderboard,
    fetchLeaderboard,
  };
};

