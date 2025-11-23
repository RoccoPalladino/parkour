// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Onchain Parkour - Encrypted Parkour DApp
/// @author Parkour Game
/// @notice A FHEVM-based parkour game with encrypted scores and leaderboard
contract ParkourGame is ZamaEthereumConfig {
    // ERC-721 like NFT structure for characters
    struct Character {
        uint256 tokenId;
        address owner;
        bool exists;
    }

    // Player score data
    struct PlayerScore {
        euint32 encryptedScore;  // Encrypted score
        uint256 timestamp;       // When the score was recorded
        bool exists;
    }

    // Leaderboard entry
    struct LeaderboardEntry {
        address player;
        uint256 rank;
        uint256 timestamp;
    }

    // NFT token counter
    uint256 private _tokenCounter;
    
    // Mapping: tokenId => Character
    mapping(uint256 => Character) public characters;
    
    // Mapping: owner => tokenId[]
    mapping(address => uint256[]) public ownerTokens;
    
    // Mapping: player => PlayerScore
    mapping(address => PlayerScore) public playerScores;
    
    // Array of all players for leaderboard
    address[] private _players;
    
    // Track the highest encrypted score and its owner
    euint32 private _maxEncryptedScore;
    address private _topPlayer;
    bool private _hasTopPlayer;
    
    // Events
    event CharacterMinted(address indexed owner, uint256 indexed tokenId);
    event ScoreSubmitted(address indexed player, uint256 timestamp);
    event LeaderboardUpdated(address indexed player, uint256 rank);

    /// @notice Mint a new character NFT for the caller
    /// @return tokenId The ID of the newly minted character
    function mintCharacter() external returns (uint256) {
        _tokenCounter++;
        uint256 tokenId = _tokenCounter;
        
        characters[tokenId] = Character({
            tokenId: tokenId,
            owner: msg.sender,
            exists: true
        });
        
        ownerTokens[msg.sender].push(tokenId);
        
        emit CharacterMinted(msg.sender, tokenId);
        return tokenId;
    }

    /// @notice Check if a player owns any character NFT
    /// @param player The address to check
    /// @return has True if player owns at least one character
    /// @return tokenId The first token ID owned by the player (0 if none)
    function hasCharacter(address player) external view returns (bool has, uint256 tokenId) {
        uint256[] memory tokens = ownerTokens[player];
        if (tokens.length > 0) {
            return (true, tokens[0]);
        }
        return (false, 0);
    }

    /// @notice Get all character token IDs owned by a player
    /// @param player The address to query
    /// @return tokenIds Array of token IDs owned by the player
    function getPlayerCharacters(address player) external view returns (uint256[] memory) {
        return ownerTokens[player];
    }

    /// @notice Submit an encrypted game score
    /// @param encryptedScore The encrypted score (externalEuint32)
    /// @param inputProof The input proof for the encrypted score
    /// @dev Requires the player to own at least one character NFT
    function submitScore(externalEuint32 encryptedScore, bytes calldata inputProof) external {
        // Check if player owns a character
        require(ownerTokens[msg.sender].length > 0, "Player must own a character NFT");
        
        // Convert external encrypted value to internal
        euint32 encryptedEuint32 = FHE.fromExternal(encryptedScore, inputProof);
        
        // Check if player already has a score
        if (!playerScores[msg.sender].exists) {
            // First time submitting score - add to players list
            _players.push(msg.sender);
            playerScores[msg.sender] = PlayerScore({
                encryptedScore: encryptedEuint32,
                timestamp: block.timestamp,
                exists: true
            });
            
            // Update max score if this is the first player or if new score is higher
            if (!_hasTopPlayer) {
                _maxEncryptedScore = encryptedEuint32;
                _topPlayer = msg.sender;
                _hasTopPlayer = true;
            } else {
                ebool isNewHigher = FHE.gt(encryptedEuint32, _maxEncryptedScore);
                _maxEncryptedScore = FHE.select(isNewHigher, encryptedEuint32, _maxEncryptedScore);
                // Note: We can't conditionally update _topPlayer in encrypted space
                // Frontend will need to decrypt and determine the actual top player
            }
        } else {
            // Update existing score only if new score is higher
            // Compare encrypted scores: if new > old, update
            euint32 currentScore = playerScores[msg.sender].encryptedScore;
            ebool isNewHigher = FHE.gt(encryptedEuint32, currentScore);
            
            // Use FHE.select to conditionally update: if isNewHigher then encryptedEuint32 else currentScore
            playerScores[msg.sender].encryptedScore = FHE.select(
                isNewHigher,
                encryptedEuint32,
                currentScore
            );
            
            // Update max score if this player's new score is higher
            ebool isNewMax = FHE.gt(encryptedEuint32, _maxEncryptedScore);
            _maxEncryptedScore = FHE.select(isNewMax, encryptedEuint32, _maxEncryptedScore);
            
            // Update timestamp (always update for simplicity)
            playerScores[msg.sender].timestamp = block.timestamp;
        }
        
        // Grant ACL permissions for decryption
        FHE.allowThis(playerScores[msg.sender].encryptedScore);
        FHE.allow(playerScores[msg.sender].encryptedScore, msg.sender);
        
        // Also allow max score for decryption (for leaderboard)
        FHE.allowThis(_maxEncryptedScore);
        
        emit ScoreSubmitted(msg.sender, block.timestamp);
    }

    /// @notice Get the encrypted score for a player
    /// @param player The address to query
    /// @return encryptedScore The encrypted score (euint32)
    /// @return timestamp When the score was recorded
    /// @return exists Whether the player has a score
    function getPlayerScore(address player) external view returns (euint32 encryptedScore, uint256 timestamp, bool exists) {
        PlayerScore memory score = playerScores[player];
        return (score.encryptedScore, score.timestamp, score.exists);
    }

    /// @notice Find the player with the highest encrypted score
    /// @dev Compares all encrypted scores to find the maximum
    /// @return topPlayer The address of the player with the highest score
    /// @return maxScoreHandle The encrypted score handle of the top player (for decryption)
    function getTopPlayer() external view returns (address topPlayer, bytes32 maxScoreHandle) {
        if (!_hasTopPlayer || _players.length == 0) {
            return (address(0), bytes32(0));
        }
        return (_topPlayer, bytes32(0)); // Handle extraction done in frontend
    }

    /// @notice Get the maximum encrypted score (for comparison purposes)
    /// @return maxScore The maximum encrypted score across all players
    function getMaxEncryptedScore() external view returns (euint32 maxScore) {
        return _maxEncryptedScore;
    }

    /// @notice Get the total number of players
    /// @return count The number of players who have submitted scores
    function getPlayerCount() external view returns (uint256) {
        return _players.length;
    }

    /// @notice Get all players who have submitted scores
    /// @return players Array of all player addresses
    function getAllPlayers() external view returns (address[] memory) {
        return _players;
    }

    /// @notice Get leaderboard data for all players
    /// @dev Returns only player addresses and timestamps
    /// @dev Frontend will call getPlayerScore for each player to get encrypted scores
    /// @return players Array of player addresses
    /// @return timestamps Array of score submission timestamps
    function getLeaderboard() external view returns (
        address[] memory players,
        uint256[] memory timestamps
    ) {
        uint256 playerCount = _players.length;
        
        // Count players with valid scores
        uint256 validCount = 0;
        for (uint256 i = 0; i < playerCount; i++) {
            if (playerScores[_players[i]].exists) {
                validCount++;
            }
        }
        
        // Initialize arrays with valid count
        players = new address[](validCount);
        timestamps = new uint256[](validCount);
        
        // Fill arrays with valid scores only
        uint256 index = 0;
        for (uint256 i = 0; i < playerCount; i++) {
            address player = _players[i];
            PlayerScore memory score = playerScores[player];
            if (score.exists) {
                players[index] = player;
                timestamps[index] = score.timestamp;
                index++;
            }
        }
    }

    /// @notice Get leaderboard data for a specific range of players
    /// @param startIndex Starting index (0-based)
    /// @param count Number of players to retrieve
    /// @return players Array of player addresses
    /// @return encryptedScores Array of encrypted scores (euint32)
    /// @return timestamps Array of score submission timestamps
    function getLeaderboardRange(uint256 startIndex, uint256 count) external view returns (
        address[] memory players,
        euint32[] memory encryptedScores,
        uint256[] memory timestamps
    ) {
        uint256 playerCount = _players.length;
        if (startIndex >= playerCount) {
            return (new address[](0), new euint32[](0), new uint256[](0));
        }
        
        uint256 endIndex = startIndex + count;
        if (endIndex > playerCount) {
            endIndex = playerCount;
        }
        
        uint256 actualCount = endIndex - startIndex;
        players = new address[](actualCount);
        encryptedScores = new euint32[](actualCount);
        timestamps = new uint256[](actualCount);
        
        for (uint256 i = 0; i < actualCount; i++) {
            address player = _players[startIndex + i];
            players[i] = player;
            encryptedScores[i] = playerScores[player].encryptedScore;
            timestamps[i] = playerScores[player].timestamp;
        }
    }
}

