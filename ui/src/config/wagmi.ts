import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: '',
  projectId: 'fhe-predictor-demo', // Replace with your WalletConnect project id in production
  chains: [sepolia],
  ssr: false,
});
