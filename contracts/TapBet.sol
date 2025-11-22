// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TapBet
 * @notice Simple betting: TRUE wins = tokens sent, FALSE wins = photo posted
 */
contract TapBet is Ownable {

    IERC20 public jakeToken;
    uint256 public rewardAmount;

    struct Bet {
        address challenger;
        bytes32 photoHash;
        string blueskyUri;
        bool resolved;
        bool trueWon;
    }

    mapping(bytes32 => Bet) public bets;

    event BetCreated(bytes32 indexed betId, address indexed challenger, string blueskyUri);
    event BetResolved(bytes32 indexed betId, bool trueWon, address indexed challenger);
    event TokensTransferred(bytes32 indexed betId, address indexed winner, uint256 amount);
    event PhotoTime(bytes32 indexed betId, address indexed challenger, bytes32 photoHash);

    constructor(address _jakeToken, uint256 _rewardAmount) Ownable(msg.sender) {
        jakeToken = IERC20(_jakeToken);
        rewardAmount = _rewardAmount;
    }

    function createBet(
        bytes32 betId,
        address challenger,
        bytes32 photoHash,
        string calldata blueskyUri
    ) external onlyOwner {
        require(challenger != address(0), "Invalid challenger");
        require(bets[betId].challenger == address(0), "Bet exists");

        bets[betId] = Bet({
            challenger: challenger,
            photoHash: photoHash,
            blueskyUri: blueskyUri,
            resolved: false,
            trueWon: false
        });

        emit BetCreated(betId, challenger, blueskyUri);
    }

    function resolve(bytes32 betId, bool trueWon) external onlyOwner {
        Bet storage bet = bets[betId];
        require(bet.challenger != address(0), "Bet does not exist");
        require(!bet.resolved, "Already resolved");

        bet.resolved = true;
        bet.trueWon = trueWon;

        emit BetResolved(betId, trueWon, bet.challenger);

        if (trueWon) {
            uint256 amount = jakeToken.balanceOf(address(this));
            if (amount > rewardAmount) amount = rewardAmount;
            if (amount > 0) {
                jakeToken.transfer(bet.challenger, amount);
                emit TokensTransferred(betId, bet.challenger, amount);
            }
        } else {
            emit PhotoTime(betId, bet.challenger, bet.photoHash);
        }
    }

    function fundContract(uint256 amount) external onlyOwner {
        jakeToken.transferFrom(msg.sender, address(this), amount);
    }
}
