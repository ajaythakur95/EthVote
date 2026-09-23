import { useState, useEffect, useCallback } from "react";
import { connectWallet, checkSBTStatus, switchToCorrectNetwork } from "../utils/blockchain";

export const useWallet = () => {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [hasSBT, setHasSBT] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      await switchToCorrectNetwork();
      const addr = await connectWallet();
      setAddress(addr);
      const sbt = await checkSBTStatus(addr);
      setHasSBT(sbt);
    } catch (e) {
      setError(e.message);
    } finally { setConnecting(false); }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
      if (accounts[0]) { setAddress(accounts[0]); checkSBTStatus(accounts[0]).then(setHasSBT); }
    });
    const handleAccountsChanged = (accounts) => {
      setAddress(accounts[0] || null);
      if (accounts[0]) checkSBTStatus(accounts[0]).then(setHasSBT);
    };
    const handleChainChanged = (id) => setChainId(parseInt(id, 16));
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  return { address, chainId, hasSBT, connecting, error, connect };
};
