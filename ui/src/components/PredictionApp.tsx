import { useState } from 'react';
import { Header } from './Header';
import { CreatePredictionForm } from './CreatePredictionForm';
import { PredictionDashboard } from './PredictionDashboard';
import '../styles/PredictionApp.css';

export function PredictionApp() {
  const [activeTab, setActiveTab] = useState<'predict' | 'create'>('predict');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreated = () => {
    setRefreshKey((prev) => prev + 1);
    setActiveTab('predict');
  };

  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <div className="tab-navigation">
          <button
            type="button"
            className={`tab-button ${activeTab === 'predict' ? 'active' : ''}`}
            onClick={() => setActiveTab('predict')}
          >
            Markets
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Create Prediction
          </button>
        </div>

        {activeTab === 'create' ? (
          <CreatePredictionForm onCreated={handleCreated} />
        ) : (
          <PredictionDashboard refreshKey={refreshKey} />
        )}
      </main>
    </div>
  );
}
