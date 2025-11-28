// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHEPredictionMarket
 * @notice Minimal prediction market where user's pick and wager totals are stored as encrypted values.
 */
contract FHEPredictionMarket is ZamaEthereumConfig {
    struct Prediction {
        string name;
        string[] options;
        euint64[] optionTotals;
        euint64 encryptedPool;
        address creator;
        uint256 createdAt;
        bool exists;
    }

    struct BetInfo {
        euint64 encryptedAmount;
        euint8 encryptedSelection;
        bool exists;
    }

    struct PredictionSummary {
        uint256 id;
        string name;
        string[] options;
        address creator;
        uint256 createdAt;
    }

    uint256 private _nextPredictionId = 1;
    mapping(uint256 => Prediction) private _predictions;
    mapping(uint256 => mapping(address => BetInfo)) private _bets;
    uint256[] private _predictionIds;

    event PredictionCreated(uint256 indexed predictionId, address indexed creator, string name, uint256 optionCount);
    event BetPlaced(
        uint256 indexed predictionId,
        address indexed user,
        bytes32 encryptedAmount,
        bytes32 encryptedSelection,
        uint256 clearAmount
    );

    error InvalidPrediction();
    error InvalidOptionsCount();
    error EmptyOption();
    error EmptyName();
    error BetAlreadyPlaced();
    error InvalidBetAmount();

    /**
     * @notice Creates a new prediction.
     * @param name Title for the prediction
     * @param options List of outcomes (between 2 and 4)
     */
    function createPrediction(string memory name, string[] memory options) external returns (uint256) {
        if (bytes(name).length == 0) {
            revert EmptyName();
        }
        if (options.length < 2 || options.length > 4) {
            revert InvalidOptionsCount();
        }
        for (uint256 i = 0; i < options.length; i++) {
            if (bytes(options[i]).length == 0) {
                revert EmptyOption();
            }
        }

        uint256 predictionId = _nextPredictionId++;
        Prediction storage prediction = _predictions[predictionId];
        prediction.name = name;
        prediction.creator = msg.sender;
        prediction.createdAt = block.timestamp;
        prediction.exists = true;

        euint64 zeroValue = FHE.asEuint64(0);
        zeroValue = FHE.allowThis(zeroValue);
        zeroValue = FHE.makePubliclyDecryptable(zeroValue);
        zeroValue = FHE.allow(zeroValue, msg.sender);
        prediction.encryptedPool = zeroValue;

        for (uint256 i = 0; i < options.length; i++) {
            prediction.options.push(options[i]);
            euint64 optionTotal = FHE.asEuint64(0);
            optionTotal = FHE.allowThis(optionTotal);
            optionTotal = FHE.makePubliclyDecryptable(optionTotal);
            optionTotal = FHE.allow(optionTotal, msg.sender);
            prediction.optionTotals.push(optionTotal);
        }

        _predictionIds.push(predictionId);
        emit PredictionCreated(predictionId, msg.sender, name, options.length);
        return predictionId;
    }

    /**
     * @notice Places an encrypted bet on a prediction. Attach ETH to msg.value.
     * @param predictionId Target prediction
     * @param encryptedSelection User encrypted option index
     * @param inputProof Proof returned by the Relayer SDK
     */
    function placeEncryptedBet(
        uint256 predictionId,
        externalEuint8 encryptedSelection,
        bytes calldata inputProof
    ) external payable {
        Prediction storage prediction = _predictions[predictionId];
        if (!prediction.exists) {
            revert InvalidPrediction();
        }
        if (prediction.optionTotals.length == 0) {
            revert InvalidOptionsCount();
        }
        if (msg.value == 0 || msg.value > type(uint64).max) {
            revert InvalidBetAmount();
        }

        BetInfo storage betInfo = _bets[predictionId][msg.sender];
        if (betInfo.exists) {
            revert BetAlreadyPlaced();
        }

        euint8 selection = FHE.fromExternal(encryptedSelection, inputProof);
        selection = FHE.allowThis(selection);
        selection = FHE.allow(selection, msg.sender);

        euint64 encryptedAmount = FHE.asEuint64(uint64(msg.value));
        encryptedAmount = FHE.allowThis(encryptedAmount);
        encryptedAmount = FHE.allow(encryptedAmount, msg.sender);

        prediction.encryptedPool = FHE.add(prediction.encryptedPool, encryptedAmount);
        prediction.encryptedPool = FHE.allowThis(prediction.encryptedPool);
        prediction.encryptedPool = FHE.makePubliclyDecryptable(prediction.encryptedPool);
        prediction.encryptedPool = FHE.allow(prediction.encryptedPool, msg.sender);

        euint64 zeroAddition = FHE.asEuint64(0);
        zeroAddition = FHE.allowThis(zeroAddition);
        for (uint256 i = 0; i < prediction.optionTotals.length; i++) {
            ebool matchesOption = FHE.eq(selection, FHE.asEuint8(uint8(i)));
            euint64 addition = FHE.select(matchesOption, encryptedAmount, zeroAddition);
            euint64 newTotal = FHE.add(prediction.optionTotals[i], addition);
            newTotal = FHE.allowThis(newTotal);
            newTotal = FHE.makePubliclyDecryptable(newTotal);
            newTotal = FHE.allow(newTotal, msg.sender);
            prediction.optionTotals[i] = newTotal;
        }

        betInfo.encryptedAmount = encryptedAmount;
        betInfo.encryptedSelection = selection;
        betInfo.exists = true;

        emit BetPlaced(
            predictionId,
            msg.sender,
            euint64.unwrap(encryptedAmount),
            euint8.unwrap(selection),
            msg.value
        );
    }

    /**
     * @notice Returns summaries for every prediction.
     */
    function listPredictions() external view returns (PredictionSummary[] memory) {
        PredictionSummary[] memory summaries = new PredictionSummary[](_predictionIds.length);
        for (uint256 i = 0; i < _predictionIds.length; i++) {
            Prediction storage prediction = _predictions[_predictionIds[i]];
            if (!prediction.exists) {
                continue;
            }

            summaries[i] = PredictionSummary({
                id: _predictionIds[i],
                name: prediction.name,
                options: _copyOptions(prediction.options),
                creator: prediction.creator,
                createdAt: prediction.createdAt
            });
        }
        return summaries;
    }

    /**
     * @notice Returns metadata for a single prediction.
     */
    function getPredictionMetadata(uint256 predictionId) external view returns (PredictionSummary memory) {
        Prediction storage prediction = _predictions[predictionId];
        if (!prediction.exists) {
            revert InvalidPrediction();
        }

        return
            PredictionSummary({
                id: predictionId,
                name: prediction.name,
                options: _copyOptions(prediction.options),
                creator: prediction.creator,
                createdAt: prediction.createdAt
            });
    }

    /**
     * @notice Returns encrypted totals for all options plus the overall pool.
     */
    function getEncryptedTotals(uint256 predictionId) external view returns (euint64[] memory, euint64) {
        Prediction storage prediction = _predictions[predictionId];
        if (!prediction.exists) {
            revert InvalidPrediction();
        }

        euint64[] memory totals = _copyEncryptedTotals(prediction.optionTotals);
        return (totals, prediction.encryptedPool);
    }

    /**
     * @notice Returns the encrypted bet stored for a user.
     */
    function getUserBet(
        uint256 predictionId,
        address user
    ) external view returns (euint64 encryptedAmount, euint8 encryptedSelection, bool hasBet) {
        Prediction storage prediction = _predictions[predictionId];
        if (!prediction.exists) {
            revert InvalidPrediction();
        }

        BetInfo storage bet = _bets[predictionId][user];
        return (bet.encryptedAmount, bet.encryptedSelection, bet.exists);
    }

    /**
     * @notice Number of predictions created.
     */
    function getPredictionCount() external view returns (uint256) {
        return _predictionIds.length;
    }

    function _copyOptions(string[] storage source) private view returns (string[] memory) {
        string[] memory copy = new string[](source.length);
        for (uint256 i = 0; i < source.length; i++) {
            copy[i] = source[i];
        }
        return copy;
    }

    function _copyEncryptedTotals(euint64[] storage source) private view returns (euint64[] memory) {
        euint64[] memory copy = new euint64[](source.length);
        for (uint256 i = 0; i < source.length; i++) {
            copy[i] = source[i];
        }
        return copy;
    }
}
