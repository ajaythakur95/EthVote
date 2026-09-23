import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../utils/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("ethvote_token"));
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const res = await api.get("/voter/profile");
      setUser(res.data.user);
    } catch {
      localStorage.removeItem("ethvote_token");
      setToken(null);
      setUser(null);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const login = (newToken, userData) => {
    localStorage.setItem("ethvote_token", newToken);
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("ethvote_token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refetch: fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
