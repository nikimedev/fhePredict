import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, usePublicClient } from 'wagmi';
import { Contract, JsonRpcSigner, formatEther, isAddress, parseEther } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/PredictionDashboard.css';

type PredictionSummary = {
  id: bigint;
  name: string;
  options: string[];
  creator: string;
  createdAt: bigint;
};

type TotalsPayload = {
  pool: string;
  totals: string[];
};

type DashboardProps = {
  refreshKey: number;
};

const formatWei = (value: bigint | string) => {
  try {
    const bigIntValue = typeof value === 'bigint' ? value : BigInt(value || 0);
    return `${formatEther(bigIntValue)} ETH`;
  } catch {
    return '0 ETH';
  }
};

export function PredictionDashboard({ refreshKey }: DashboardProps) {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const publicClient = usePublicClient();
  const isContractReady = isAddress(CONTRACT_ADDRESS);

  const [selectedPredictionId, setSelectedPredictionId] = useState<bigint | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState('0.1');
  const [betStatus, setBetStatus] = useState<string | null>(null);
  const [betError, setBetError] = useState<string | null>(null);
  const [totalsData, setTotalsData] = useState<TotalsPayload | null>(null);
  const [userBetHandles, setUserBetHandles] = useState<{ amount: string; selection: string; hasBet: boolean } | null>(
    null,
  );
  const [decryptedTotals, setDecryptedTotals] = useState<{ pool: string; options: string[] } | null>(null);
  const [decryptedBet, setDecryptedBet] = useState<{ amount: string; selectionIndex: number } | null>(null);
  const [decryptStatus, setDecryptStatus] = useState<string | null>(null);
  const [isFetchingChainData, setIsFetchingChainData] = useState(false);

  const {
    data: predictionsRaw,
    isLoading: predictionsLoading,
    refetch: refetchPredictions,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'listPredictions',
    query: {
      refetchInterval: 0,
      enabled: isContractReady,
    },
  });

  useEffect(() => {
    refetchPredictions();
  }, [refreshKey, refetchPredictions]);

  const predictions: PredictionSummary[] = useMemo(() => {
    if (!predictionsRaw || !Array.isArray(predictionsRaw)) {
      return [];
    }
    return (predictionsRaw as PredictionSummary[]).map((prediction) => ({
      id: BigInt(prediction.id),
      name: prediction.name,
      options: prediction.options,
      creator: prediction.creator,
      createdAt: BigInt(prediction.createdAt),
    }));
  }, [predictionsRaw]);

  useEffect(() => {
    if (predictions.length > 0 && !selectedPredictionId) {
      setSelectedPredictionId(predictions[0].id);
    }
  }, [predictions, selectedPredictionId]);

  useEffect(() => {
    if (predictions.length === 0) {
      setSelectedPredictionId(null);
    }
  }, [predictions]);

  const loadOnChainData = async (predictionId?: bigint) => {
    if (!publicClient || !isAddress(CONTRACT_ADDRESS)) {
      return;
    }
    const targetId = predictionId ?? selectedPredictionId;
    if (!targetId) {
      return;
    }

    setIsFetchingChainData(true);
    try {
      const onChainTotals = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getEncryptedTotals',
        args: [targetId],
      })) as [string[], string];

      setTotalsData({
        totals: onChainTotals[0].map((value) => value as unknown as string),
        pool: onChainTotals[1] as unknown as string,
      });

      if (address) {
        const betResult = (await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getUserBet',
          args: [targetId, address],
        })) as [string, string, boolean];

        setUserBetHandles({
          amount: betResult[0] as unknown as string,
          selection: betResult[1] as unknown as string,
          hasBet: betResult[2],
        });
      } else {
        setUserBetHandles(null);
      }
    } catch (error) {
      console.error('loadOnChainData failed', error);
    } finally {
      setIsFetchingChainData(false);
    }
  };

  useEffect(() => {
    loadOnChainData();
  }, [selectedPredictionId, address]);

  const handlePlaceBet = async () => {
    setBetStatus(null);
    setBetError(null);
    setDecryptedBet(null);
    if (selectedPredictionId === null) {
      setBetError('Select a prediction to place a bet.');
      return;
    }
    if (selectedOptionIndex === null) {
      setBetError('Pick one of the options before placing a bet.');
      return;
    }
    if (!instance || !address || !signerPromise) {
      setBetError('Ensure your wallet and encryption service are ready.');
      return;
    }
    if (!isAddress(CONTRACT_ADDRESS)) {
      setBetError('Contract address is missing. Deploy the contract first.');
      return;
    }

    const sanitizedAmount = betAmount.trim();
    let weiValue: bigint;
    try {
      weiValue = parseEther(sanitizedAmount || '0');
    } catch {
      setBetError('Enter a valid ETH amount.');
      return;
    }

    if (weiValue <= 0n) {
      setBetError('Bet amount must be greater than zero.');
      return;
    }

    try {
      setBetStatus('Encrypting selection...');
      const buffer = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      buffer.add8(selectedOptionIndex);
      const encryptedInput = await buffer.encrypt();

      setBetStatus('Submitting transaction...');
      const signer: JsonRpcSigner | undefined = await signerPromise;
      if (!signer) {
        throw new Error('Unable to locate wallet signer.');
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.placeEncryptedBet(
        Number(selectedPredictionId),
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        { value: weiValue },
      );
      setBetStatus('Waiting for confirmation...');
      await tx.wait();
      setBetStatus('Bet confirmed!');
      loadOnChainData(selectedPredictionId);
      refetchPredictions();
    } catch (error) {
      console.error('placeEncryptedBet failed', error);
      setBetError(error instanceof Error ? error.message : 'Failed to place bet.');
    } finally {
      setTimeout(() => setBetStatus(null), 4000);
    }
  };

  const decryptHandles = async (handles: string[]) => {
    if (!instance || !address || !signerPromise) {
      throw new Error('Wallet or encryption service unavailable.');
    }
    const signer: JsonRpcSigner | undefined = await signerPromise;
    if (!signer) {
      throw new Error('Unable to locate wallet signer.');
    }

    const keypair = instance.generateKeypair();
    const contractAddresses = [CONTRACT_ADDRESS];
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '5';

    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message,
    );

    const handlePairs = handles.map((handle) => ({
      handle,
      contractAddress: CONTRACT_ADDRESS,
    }));

    const result = await instance.userDecrypt(
      handlePairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );

    return result as Record<string, string | bigint>;
  };

  const handleDecryptTotals = async () => {
    if (!totalsData || totalsData.totals.length === 0) {
      return;
    }
    setDecryptStatus('Decrypting pool and option totals...');
    try {
      const handles = [totalsData.pool, ...totalsData.totals];
      const decrypted = await decryptHandles(handles);

      setDecryptedTotals({
        pool: decrypted[totalsData.pool]?.toString() ?? '0',
        options: totalsData.totals.map((handle) => decrypted[handle]?.toString() ?? '0'),
      });
    } catch (error) {
      console.error('handleDecryptTotals failed', error);
      setBetError(error instanceof Error ? error.message : 'Failed to decrypt totals.');
    } finally {
      setDecryptStatus(null);
    }
  };

  const handleDecryptMyBet = async () => {
    if (!userBetHandles || !userBetHandles.hasBet) {
      setBetError('No encrypted bet detected for this account.');
      return;
    }
    setDecryptStatus('Decrypting your bet...');
    try {
      const handles = [userBetHandles.amount, userBetHandles.selection];
      const decrypted = await decryptHandles(handles);
      const selectionIndex = Number(decrypted[userBetHandles.selection] ?? 0);
      setDecryptedBet({
        amount: decrypted[userBetHandles.amount]?.toString() ?? '0',
        selectionIndex,
      });
    } catch (error) {
      console.error('handleDecryptMyBet failed', error);
      setBetError(error instanceof Error ? error.message : 'Failed to decrypt your bet.');
    } finally {
      setDecryptStatus(null);
    }
  };

  if (!isContractReady) {
    return (
      <section className="card">
        <h2 className="card-title">Contract address missing</h2>
        <p className="card-description">
          Update <code>CONTRACT_ADDRESS</code> in <code>ui/src/config/contracts.ts</code> once the contract is deployed to
          Sepolia.
        </p>
      </section>
    );
  }

  if (predictionsLoading) {
    return (
      <section className="card">
        <p>Loading predictions...</p>
      </section>
    );
  }

  if (predictions.length === 0) {
    return (
      <section className="card">
        <h2 className="card-title">No predictions yet</h2>
        <p className="card-description">Create the first encrypted prediction using the Create tab.</p>
      </section>
    );
  }

  const activePrediction = predictions.find((prediction) => prediction.id === selectedPredictionId);

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="card-eyebrow">Markets</p>
          <h2 className="card-title">Active encrypted predictions</h2>
          <p className="card-description">
            Choose a market to place an encrypted bet. Pools and option totals remain encrypted until you decrypt
            locally.
          </p>
        </div>
        <button className="ghost-button" type="button" onClick={() => loadOnChainData()}>
          Refresh on-chain data
        </button>
      </header>

      <div className="prediction-list">
        {predictions.map((prediction) => (
          <button
            type="button"
            key={`prediction-${prediction.id.toString()}`}
            className={`prediction-card ${prediction.id === selectedPredictionId ? 'active' : ''}`}
            onClick={() => {
              setSelectedPredictionId(prediction.id);
              setSelectedOptionIndex(null);
              setDecryptedTotals(null);
              setDecryptedBet(null);
            }}
          >
            <div className="prediction-card__meta">
              <h3>{prediction.name}</h3>
              <p>
                Created {new Date(Number(prediction.createdAt) * 1000).toLocaleDateString()} •{' '}
                {prediction.options.length} options
              </p>
            </div>
            <div className="prediction-card__options">
              {prediction.options.map((option, index) => (
                <span className="prediction-chip" key={`option-preview-${prediction.id}-${index}`}>
                  {option}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {activePrediction && (
        <>
          <div className="bet-section">
            <div className="bet-details">
              <h3>Place encrypted bet</h3>
              <p>Select an option and enter the ETH amount to wager.</p>
            </div>
            <div className="bet-options">
              {activePrediction.options.map((option, index) => (
                <label key={`full-option-${index}`} className="option-choice">
                  <input
                    type="radio"
                    name="prediction-option"
                    value={index}
                    checked={selectedOptionIndex === index}
                    onChange={() => setSelectedOptionIndex(index)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <div className="bet-controls">
              <input
                className="text-input"
                value={betAmount}
                onChange={(event) => setBetAmount(event.target.value)}
                placeholder="0.05"
              />
              <button className="primary-button" type="button" onClick={handlePlaceBet} disabled={zamaLoading}>
                {zamaLoading ? 'Loading encryption' : 'Place Bet'}
              </button>
            </div>
            <div className="form-messages">
              {betStatus && <p className="status-message">{betStatus}</p>}
              {decryptStatus && <p className="status-message">{decryptStatus}</p>}
              {betError && <p className="error-message">{betError}</p>}
              {zamaError && <p className="error-message">{zamaError}</p>}
            </div>
          </div>

          <div className="encrypted-panels">
            <div className="encrypted-card">
              <div className="encrypted-card__header">
                <div>
                  <h3>Encrypted pool totals</h3>
                  <p className="muted-text">
                    {isFetchingChainData ? 'Fetching...' : 'Decrypt to reveal the ETH totals client-side.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleDecryptTotals}
                  disabled={!totalsData || totalsData.totals.length === 0}
                >
                  Decrypt totals
                </button>
              </div>

              {totalsData && (
                <div className="encrypted-values">
                  <div className="encrypted-row">
                    <span className="muted-text">Total pool handle</span>
                    <code>{totalsData.pool}</code>
                  </div>
                  {totalsData.totals.map((total, index) => (
                    <div className="encrypted-row" key={`total-handle-${index}`}>
                      <span className="muted-text">
                        Option {index + 1}: {activePrediction.options[index]}
                      </span>
                      <code>{total}</code>
                    </div>
                  ))}
                </div>
              )}

              {decryptedTotals && (
                <div className="decrypted-values">
                  <p className="muted-text">Decrypted values</p>
                  <p>Pool: {formatWei(decryptedTotals.pool)}</p>
                  {decryptedTotals.options.map((value, index) => (
                    <p key={`decrypted-${index}`}>
                      Option {index + 1}: {formatWei(value)}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="encrypted-card">
              <div className="encrypted-card__header">
                <div>
                  <h3>My encrypted bet</h3>
                  <p className="muted-text">Decrypt to reveal your amount and chosen index.</p>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleDecryptMyBet}
                  disabled={!userBetHandles?.hasBet}
                >
                  Decrypt my bet
                </button>
              </div>

              {userBetHandles?.hasBet ? (
                <>
                  <div className="encrypted-row">
                    <span className="muted-text">Amount handle</span>
                    <code>{userBetHandles.amount}</code>
                  </div>
                  <div className="encrypted-row">
                    <span className="muted-text">Selection handle</span>
                    <code>{userBetHandles.selection}</code>
                  </div>
                </>
              ) : (
                <p className="muted-text">No bet found for the connected wallet.</p>
              )}

              {decryptedBet && (
                <div className="decrypted-values">
                  <p>Amount: {formatWei(decryptedBet.amount)}</p>
                  <p>
                    Selection: {activePrediction.options[decryptedBet.selectionIndex] ?? 'Unknown'} (index{' '}
                    {decryptedBet.selectionIndex})
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
