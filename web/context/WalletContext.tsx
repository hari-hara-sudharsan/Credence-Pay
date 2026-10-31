"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const HASHKEY_MAINNET_CHAIN_ID = 177;
const HASHKEY_MAINNET_CHAIN_ID_HEX = "0xB1";

const HASHKEY_MAINNET_PARAMS = {
  chainId: HASHKEY_MAINNET_CHAIN_ID_HEX,
  chainName: "HashKey Chain Mainnet",
  rpcUrls: ["https://mainnet.hsk.xyz"],
  nativeCurrency: {
    name: "HSK",
    symbol: "HSK",
    decimals: 18,
  },
  blockExplorerUrls: ["https://hashkey.blockscout.com"],
};

type WalletContextType = {
  wallet: string;
  chainId: number | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  isCorrectChain: boolean;
  setWallet: (wallet: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToMainnet: () => Promise<boolean>;
};

const WalletContext = createContext<WalletContextType>({
  wallet: "",
  chainId: null,
  provider: null,
  signer: null,
  isCorrectChain: false,
  setWallet: () => {},
  connect: async () => {},
  disconnect: () => {},
  switchToMainnet: async () => false,
});

export function WalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [wallet, setWallet] = useState("");
  const [localWallet, setLocalWallet] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("borrow_wallet_input");
      if (saved) setLocalWallet(saved);

      const handleStorageChange = () => {
        const savedVal = localStorage.getItem("borrow_wallet_input");
        setLocalWallet(savedVal || "");
      };
      window.addEventListener("storage", handleStorageChange);
      window.addEventListener("wallet_input_changed", handleStorageChange);
      return () => {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener("wallet_input_changed", handleStorageChange);
      };
    }
  }, []);

  const activeWallet = wallet || localWallet;

  const isCorrectChain = chainId === parseInt(HASHKEY_MAINNET_CHAIN_ID_HEX, 16);

  const switchToMainnet = useCallback(async (): Promise<boolean> => {
    if (!window.ethereum) return false;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: HASHKEY_MAINNET_CHAIN_ID_HEX }],
      });
      return true;
    } catch (error: any) {
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [HASHKEY_MAINNET_PARAMS],
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }, []);

  const refreshSigner = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      setProvider(p);
      const network = await p.getNetwork();
      setChainId(Number(network.chainId));
      if (wallet) {
        const s = await p.getSigner();
        setSigner(s);
      }
    } catch {
      setProvider(null);
      setSigner(null);
    }
  }, [wallet]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask to use Credence AI.");
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (accounts[0]) {
      setWallet(accounts[0]);
    }

    // Switch to HashKey Mainnet after connecting
    await switchToMainnet();
  }, [switchToMainnet]);

  const disconnect = useCallback(() => {
    setWallet("");
    setSigner(null);
    setChainId(null);
  }, []);

  // Listen for MetaMask events
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setWallet(accounts[0]);
      }
    };

    const handleChainChanged = (_chainIdHex: string) => {
      const newChainId = parseInt(_chainIdHex, 16);
      setChainId(newChainId);
      refreshSigner();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [disconnect, refreshSigner]);

  // Refresh signer when wallet changes
  useEffect(() => {
    if (wallet) {
      refreshSigner();
    }
  }, [wallet, refreshSigner]);

  return (
    <WalletContext.Provider
      value={{
        wallet: activeWallet,
        chainId,
        provider,
        signer,
        isCorrectChain,
        setWallet: (w) => {
          setWallet(w);
          if (typeof window !== "undefined") {
            localStorage.setItem("borrow_wallet_input", w);
            window.dispatchEvent(new Event("wallet_input_changed"));
          }
        },
        connect,
        disconnect: () => {
          disconnect();
          if (typeof window !== "undefined") {
            localStorage.removeItem("borrow_wallet_input");
            localStorage.removeItem("borrow_stage");
            localStorage.removeItem("borrow_session");
            localStorage.removeItem("borrow_analysis");
            window.dispatchEvent(new Event("wallet_input_changed"));
          }
        },
        switchToMainnet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

export { HASHKEY_MAINNET_CHAIN_ID, HASHKEY_MAINNET_CHAIN_ID_HEX, HASHKEY_MAINNET_PARAMS };
