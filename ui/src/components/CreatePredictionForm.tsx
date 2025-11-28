import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Contract, isAddress, JsonRpcSigner } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/CreatePredictionForm.css';

type Props = {
  onCreated?: () => void;
};

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

export function CreatePredictionForm({ onCreated }: Props) {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();

  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>(Array(MIN_OPTIONS).fill(''));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOptionChange = (index: number, value: string) => {
    setOptions((existing) => existing.map((item, i) => (i === index ? value : item)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) {
      return;
    }
    setOptions((existing) => [...existing, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) {
      return;
    }
    setOptions((existing) => existing.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setTitle('');
    setOptions(Array(MIN_OPTIONS).fill(''));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!address || !signerPromise) {
      setErrorMessage('Connect your wallet before creating predictions.');
      return;
    }

    const trimmedOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);
    if (trimmedOptions.length < MIN_OPTIONS || trimmedOptions.length > MAX_OPTIONS) {
      setErrorMessage('Enter between 2 and 4 option labels.');
      return;
    }

    if (title.trim().length === 0) {
      setErrorMessage('Prediction title is required.');
      return;
    }

    if (!isAddress(CONTRACT_ADDRESS)) {
      setErrorMessage('Contract address is not set. Deploy the contract before using the app.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Preparing transaction...');
    try {
      const signer: JsonRpcSigner | undefined = await signerPromise;
      if (!signer) {
        throw new Error('Unable to locate wallet signer.');
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createPrediction(title.trim(), trimmedOptions);
      setStatusMessage('Waiting for confirmation...');
      await tx.wait();

      setStatusMessage('Prediction created successfully.');
      resetForm();
      onCreated?.();
    } catch (error) {
      console.error('createPrediction failed', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create prediction.');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <p className="card-eyebrow">Create</p>
          <h2 className="card-title">Launch a confidential prediction market</h2>
          <p className="card-description">
            Define a prediction question and up to four outcomes. Encrypted pools are initialized automatically.
          </p>
        </div>
      </header>
      <form className="prediction-form" onSubmit={handleSubmit}>
        <label className="form-label">
          Prediction Title
          <input
            className="text-input"
            placeholder="Who wins the next match?"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="options-header">
          <p>Prediction Outcomes</p>
          <button
            type="button"
            className="ghost-button"
            onClick={addOption}
            disabled={options.length >= MAX_OPTIONS}
          >
            + Add option
          </button>
        </div>

        <div className="options-grid">
          {options.map((option, index) => (
            <div className="option-row" key={`option-${index}`}>
              <input
                className="text-input"
                placeholder={`Option ${index + 1}`}
                value={option}
                onChange={(event) => handleOptionChange(index, event.target.value)}
              />
              {options.length > MIN_OPTIONS && (
                <button type="button" className="ghost-button danger" onClick={() => removeOption(index)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="form-footer">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Prediction'}
          </button>
          <div className="form-messages">
            {statusMessage && <p className="status-message">{statusMessage}</p>}
            {errorMessage && <p className="error-message">{errorMessage}</p>}
          </div>
        </div>
      </form>
    </section>
  );
}
