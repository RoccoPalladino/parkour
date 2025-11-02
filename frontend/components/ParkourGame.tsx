"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useFhevm } from "@/fhevm/useFhevm";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { useMetaMaskEthersSigner } from "@/hooks/metamask/useMetaMaskEthersSigner";
import { useParkourGame } from "@/hooks/useParkourGame";

interface GameState {
  score: number;
  isPlaying: boolean;
  isGameOver: boolean;
  playerY: number;
  obstacles: Array<{ x: number; y: number; width: number; height: number }>;
  gameSpeed: number;
}

export function ParkourGame() {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const [connectError, setConnectError] = useState<string | null>(null);
  const {
    provider,
    chainId,
    isConnected,
    connect,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
    initialMockChains,
  } = useMetaMaskEthersSigner();

  const { instance: fhevmInstance, status: fhevmStatus } = useFhevm({
    provider,
    chainId,
    initialMockChains,
    enabled: true,
  });

  const game = useParkourGame({
    instance: fhevmInstance,
    fhevmDecryptionSignatureStorage,
    eip1193Provider: provider,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const gameStateRef = useRef<GameState>({
    score: 0,
    isPlaying: false,
    isGameOver: false,
    playerY: 200,
    obstacles: [],
    gameSpeed: 2,
  });
  const submittedScoreRef = useRef<number | null>(null);

  const [gameState, setGameState] = useState<GameState>(gameStateRef.current);

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 400;
  const PLAYER_WIDTH = 40;
  const PLAYER_HEIGHT = 60;
  const PLAYER_START_X = 100;
  const GRAVITY = 0.5;
  const JUMP_STRENGTH = -12;
  const OBSTACLE_SPAWN_INTERVAL = 120;

  const playerVelocityRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  // Update ref when state changes
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Game loop
  useEffect(() => {
    if (!gameState.isPlaying || gameState.isGameOver) {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = null;
      }
      return;
    }

    const loop = () => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const currentState = gameStateRef.current;
      if (!currentState.isPlaying || currentState.isGameOver) return;

      const newFrameCount = frameCountRef.current + 1;
      frameCountRef.current = newFrameCount;

      // Update player position
      let newPlayerY = currentState.playerY;
      playerVelocityRef.current += GRAVITY;
      newPlayerY += playerVelocityRef.current;

      // Ground collision
      const groundY = CANVAS_HEIGHT - PLAYER_HEIGHT - 20;
      if (newPlayerY >= groundY) {
        newPlayerY = groundY;
        playerVelocityRef.current = 0;
      }

      // Update obstacles
      const newObstacles = currentState.obstacles
        .map((obs) => ({
          ...obs,
          x: obs.x - currentState.gameSpeed,
        }))
        .filter((obs) => obs.x + obs.width > 0);

      // Spawn new obstacles
      if (newFrameCount % OBSTACLE_SPAWN_INTERVAL === 0) {
        const obstacleHeight = 60 + Math.random() * 40;
        newObstacles.push({
          x: CANVAS_WIDTH,
          y: CANVAS_HEIGHT - obstacleHeight - 20,
          width: 30,
          height: obstacleHeight,
        });
      }

      // Collision detection
      const playerRect = {
        x: PLAYER_START_X,
        y: newPlayerY,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
      };

      const hasCollision = newObstacles.some((obs) => {
        return (
          playerRect.x < obs.x + obs.width &&
          playerRect.x + playerRect.width > obs.x &&
          playerRect.y < obs.y + obs.height &&
          playerRect.y + playerRect.height > obs.y
        );
      });

      if (hasCollision) {
        setGameState({
          ...currentState,
          isPlaying: false,
          isGameOver: true,
          playerY: newPlayerY,
          obstacles: newObstacles,
        });
        return;
      }

      // Increase score
      const newScore = currentState.score + 1;
      const newGameSpeed = 2 + Math.floor(newScore / 500) * 0.5;

      const updatedState = {
        ...currentState,
        score: newScore,
        playerY: newPlayerY,
        obstacles: newObstacles,
        gameSpeed: newGameSpeed,
      };

      setGameState(updatedState);

      // Draw game
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw ground
      ctx.fillStyle = "#8B4513";
      ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);

      // Draw sky
      ctx.fillStyle = "#87CEEB";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - 20);

      // Draw player
      ctx.fillStyle = "#FF6B6B";
      ctx.fillRect(
        PLAYER_START_X,
        updatedState.playerY,
        PLAYER_WIDTH,
        PLAYER_HEIGHT
      );

      // Draw obstacles
      ctx.fillStyle = "#4ECDC4";
      updatedState.obstacles.forEach((obs) => {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      });

      // Draw score
      ctx.fillStyle = "#000";
      ctx.font = "24px Arial";
      ctx.fillText(`Score: ${updatedState.score}`, 20, 40);

      // Continue loop
      if (updatedState.isPlaying && !updatedState.isGameOver) {
        gameLoopRef.current = requestAnimationFrame(loop);
      }
    };

    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState.isPlaying, gameState.isGameOver]);

  // Handle jump
  const handleJump = useCallback(() => {
    if (!gameState.isPlaying || gameState.isGameOver) return;
    playerVelocityRef.current = JUMP_STRENGTH;
  }, [gameState.isPlaying, gameState.isGameOver]);

  // Start game
  const startGame = useCallback(() => {
    if (!game.hasCharacter) {
      return;
    }

    const newState = {
      score: 0,
      isPlaying: true,
      isGameOver: false,
      playerY: CANVAS_HEIGHT - PLAYER_HEIGHT - 20,
      obstacles: [],
      gameSpeed: 2,
    };
    setGameState(newState);
    playerVelocityRef.current = 0;
    frameCountRef.current = 0;
  }, [game.hasCharacter]);

  // Submit score
  const handleSubmitScore = useCallback(async () => {
    if (gameState.score > 0 && gameState.isGameOver) {
      await game.submitScore(gameState.score);
    }
  }, [gameState.score, gameState.isGameOver, game]);

  // Reset game
  const resetGame = useCallback(() => {
    const resetState = {
      score: 0,
      isPlaying: false,
      isGameOver: false,
      playerY: CANVAS_HEIGHT - PLAYER_HEIGHT - 20,
      obstacles: [],
      gameSpeed: 2,
    };
    setGameState(resetState);
    playerVelocityRef.current = 0;
    frameCountRef.current = 0;
    submittedScoreRef.current = null; // Reset submitted score marker
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
      gameLoopRef.current = null;
    }
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (gameState.isPlaying && !gameState.isGameOver) {
          handleJump();
        } else if (!gameState.isPlaying && !gameState.isGameOver) {
          startGame();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [gameState, handleJump, startGame]);

  // Auto-submit score on game over (only once per game)
  useEffect(() => {
    if (
      gameState.isGameOver && 
      gameState.score > 0 && 
      !game.isSubmitting &&
      submittedScoreRef.current !== gameState.score
    ) {
      submittedScoreRef.current = gameState.score;
      handleSubmitScore();
    }
  }, [gameState.isGameOver, gameState.score, game.isSubmitting, handleSubmitScore]);

  const handleConnect = async () => {
    setConnectError(null);
    try {
      await connect();
    } catch (error: any) {
      console.error("Connection error:", error);
      setConnectError(
        error?.message || "Failed to connect to MetaMask. Please try again."
      );
    }
  };

  if (!isConnected) {
    return (
      <div className="card p-10">
        <div className="flex flex-col items-center justify-center min-h-[500px]">
          <div className="bg-gradient-to-br from-blue-100 to-green-100 rounded-full p-8 mb-6 shadow-lg">
            <svg
              className="w-20 h-20 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          
          <h2 className="text-3xl font-bold mb-3 text-gradient-blue-green">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600 mb-8 text-lg text-center max-w-md">
            Connect your MetaMask wallet to start playing and competing on the leaderboard
          </p>
          
          {connectError && (
            <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl text-red-700 max-w-md">
              <div className="flex items-center space-x-2">
                <span className="text-xl">⚠️</span>
                <span className="font-medium">{connectError}</span>
              </div>
            </div>
          )}
          
          <button
            onClick={handleConnect}
            className="btn-primary text-lg"
          >
            <span className="flex items-center space-x-2">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/>
              </svg>
              <span>Connect MetaMask</span>
            </span>
          </button>
          
          {typeof window !== "undefined" && !(window as any).ethereum && (
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
              <p className="text-sm text-gray-700">
                Don't have MetaMask?{" "}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 underline font-semibold"
                >
                  Install MetaMask Extension
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (game.isDeployed === false) {
    return (
      <div className="card p-8">
        <div className="flex items-start space-x-4">
          <div className="bg-red-100 rounded-full p-3">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-3 text-red-600">Contract Not Deployed</h2>
            <p className="text-gray-700 text-lg mb-2">
              The ParkourGame smart contract is not deployed on chain ID <span className="font-mono font-bold text-red-600">{chainId}</span>.
            </p>
            <p className="text-gray-600">
              Please deploy the contract first or switch to a supported network.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Character Status Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`rounded-full p-3 ${game.hasCharacter ? 'bg-green-100' : 'bg-red-100'}`}>
              <span className="text-3xl">{game.hasCharacter ? '👤' : '❌'}</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">Character Status</h3>
              {game.hasCharacter ? (
                <div className="flex items-center space-x-2 mt-1">
                  <span className="status-badge bg-green-100 text-green-700">
                    ✓ Active
                  </span>
                  <span className="text-gray-600">Character #{game.characterTokenId?.toString()}</span>
                </div>
              ) : (
                <p className="text-red-600 font-medium mt-1">
                  You need to mint a character to play
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {game.hasCharacter ? (
              <button
                onClick={game.checkCharacter}
                className="btn-ghost"
              >
                🔄 Refresh
              </button>
            ) : (
              <button
                onClick={game.mintCharacter}
                disabled={game.isMinting}
                className="btn-secondary"
              >
                {game.isMinting ? (
                  <span className="flex items-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    <span>Minting...</span>
                  </span>
                ) : (
                  '🎨 Mint Character'
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Game Canvas Card */}
      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-gray-800">🎮 Game Arena</h3>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-gray-500">Current Score</div>
              <div className="text-3xl font-bold text-gradient-blue-green">
                {gameState.score}
              </div>
            </div>
          </div>
        </div>
        
        <div className="relative border-gradient rounded-2xl overflow-hidden shadow-2xl">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-auto bg-gradient-to-b from-blue-100 to-green-100"
          />
          
          {/* Game Over Overlay */}
          {gameState.isGameOver && (
            <div className="game-overlay">
              <div className="bg-white p-8 rounded-2xl text-center shadow-2xl max-w-md">
                <div className="text-6xl mb-4">💥</div>
                <h3 className="text-3xl font-bold mb-3 text-gray-800">Game Over!</h3>
                <div className="mb-6">
                  <div className="text-sm text-gray-500 mb-2">Final Score</div>
                  <div className="text-5xl font-bold text-gradient-blue-green">
                    {gameState.score}
                  </div>
                </div>
                <div className="flex flex-col space-y-3">
                  <button
                    onClick={startGame}
                    className="btn-primary"
                  >
                    🎮 Play Again
                  </button>
                  <button
                    onClick={resetGame}
                    className="btn-ghost"
                  >
                    🔄 Reset Game
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Start Game Overlay */}
          {!gameState.isPlaying && !gameState.isGameOver && (
            <div className="game-overlay">
              <div className="bg-white p-8 rounded-2xl text-center shadow-2xl max-w-md">
                <div className="text-6xl mb-4">🏃‍♂️</div>
                <h3 className="text-3xl font-bold mb-3 text-gray-800">Ready to Play?</h3>
                <p className="text-gray-600 mb-6 text-lg">
                  Press <kbd className="px-3 py-1 bg-gray-200 rounded-lg font-mono font-bold">SPACE</kbd> to jump and avoid obstacles!
                </p>
                <button
                  onClick={startGame}
                  disabled={!game.hasCharacter}
                  className="btn-primary text-lg"
                >
                  {game.hasCharacter ? '🚀 Start Game' : '❌ Mint Character First'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Game Controls */}
      <div className="card p-5">
        <div className="flex flex-wrap gap-3">
          {!gameState.isPlaying && !gameState.isGameOver && (
            <button
              onClick={startGame}
              disabled={!game.hasCharacter}
              className="btn-primary"
            >
              🚀 Start Game
            </button>
          )}
          {gameState.isPlaying && (
            <button
              onClick={handleJump}
              className="btn-secondary"
            >
              ⬆️ Jump (SPACE)
            </button>
          )}
          {gameState.isGameOver && (
            <>
              <button
                onClick={handleSubmitScore}
                disabled={game.isSubmitting || gameState.score === 0}
                className="btn-primary"
              >
                {game.isSubmitting ? (
                  <span className="flex items-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    <span>Submitting Score...</span>
                  </span>
                ) : (
                  '📤 Submit Score to Blockchain'
                )}
              </button>
              <button
                onClick={startGame}
                className="btn-secondary"
              >
                🎮 Play Again
              </button>
            </>
          )}
        </div>
      </div>

      {/* Score Display Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-br from-purple-100 to-blue-100 rounded-full p-4">
              <span className="text-3xl">🔐</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">Your Encrypted Score</h3>
              <div className="mt-2 flex items-center space-x-3">
                {game.playerScore !== undefined ? (
                  <>
                    <span className="text-3xl font-bold text-gradient-blue-green">
                      {game.playerScore}
                    </span>
                    <span className="status-badge bg-green-100 text-green-700">
                      ✓ Decrypted
                    </span>
                  </>
                ) : (
                  <span className="status-badge bg-gray-100 text-gray-600">
                    🔒 Not Decrypted Yet
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <button
            onClick={game.decryptScore}
            disabled={game.isDecrypting}
            className="btn-primary"
          >
            {game.isDecrypting ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>Decrypting...</span>
              </span>
            ) : (
              '🔓 Decrypt My Score'
            )}
          </button>
        </div>
      </div>

      {/* Leaderboard Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-yellow-100 to-orange-100 rounded-full p-3">
              <span className="text-3xl">🏆</span>
            </div>
            <h3 className="text-2xl font-bold text-gradient-purple">
              Global Leaderboard
            </h3>
          </div>
          <button
            onClick={game.fetchLeaderboard}
            disabled={game.isLoadingLeaderboard}
            className="btn-primary"
          >
            {game.isLoadingLeaderboard ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>Loading...</span>
              </span>
            ) : (
              '🔄 Refresh'
            )}
          </button>
        </div>
        
        {game.leaderboard.length === 0 ? (
          <div className="text-center py-16 card-section">
            <div className="text-6xl mb-4">🎯</div>
            <h4 className="text-xl font-bold text-gray-700 mb-2">
              No Players Yet
            </h4>
            <p className="text-gray-600">
              Be the first to submit a score and claim the top spot!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl font-semibold text-sm text-gray-700 border-2 border-gray-200">
              <div className="col-span-2">Rank</div>
              <div className="col-span-7">Player Address</div>
              <div className="col-span-3 text-center">Score</div>
            </div>
            
            {/* Leaderboard Entries */}
            {game.leaderboard.map((entry) => {
              const address = entry.address;
              const shortAddress = `${address.slice(0, 8)}...${address.slice(-6)}`;
              
              // Highlight top 3
              const isTopThree = entry.rank <= 3;
              const rankEmoji = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : "🏅";
              
              return (
                <div
                  key={entry.address}
                  className={`grid grid-cols-12 gap-4 px-4 py-4 rounded-xl transition-all duration-300 border-2 ${
                    isTopThree
                      ? "bg-gradient-to-r from-yellow-50 via-orange-50 to-yellow-50 border-yellow-300 shadow-md hover:shadow-lg"
                      : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <div className="col-span-2 flex items-center space-x-2">
                    <span className="text-2xl">{rankEmoji}</span>
                    <span className={`text-lg font-bold ${isTopThree ? "text-yellow-700" : "text-gray-600"}`}>
                      #{entry.rank}
                    </span>
                  </div>
                  <div className="col-span-7 flex items-center">
                    <span className={`font-mono text-sm ${isTopThree ? "font-bold text-gray-800" : "text-gray-600"}`} title={address}>
                      {shortAddress}
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center justify-center">
                    <span className={`status-badge ${isTopThree ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                      🔒 Encrypted
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Message */}
      {game.message && (
        <div className="card p-5">
          <div className="flex items-start space-x-3">
            <div className="bg-blue-100 rounded-full p-2 mt-1">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-gray-800 font-medium">{game.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* FHEVM Status */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gray-100 rounded-full p-2">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="text-sm">
              <div className="flex items-center space-x-2">
                <span className="text-gray-600 font-medium">FHEVM Status:</span>
                <span className={`status-badge text-xs ${
                  fhevmStatus === 'ready' ? 'bg-green-100 text-green-700' : 
                  fhevmStatus === 'loading' ? 'bg-yellow-100 text-yellow-700' : 
                  'bg-gray-100 text-gray-700'
                }`}>
                  {fhevmStatus}
                </span>
              </div>
              <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                <span>Chain ID: <span className="font-mono font-bold">{chainId}</span></span>
                <span>Contract: <span className="font-mono font-bold">{game.contractAddress?.slice(0, 6)}...{game.contractAddress?.slice(-4)}</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
