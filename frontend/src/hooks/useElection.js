import { useState, useEffect } from "react";
import api from "../utils/api";

export const useElections = (params = {}) => {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await api.get("/election", { params });
        setElections(res.data.elections);
      } catch (e) {
        setError(e.response?.data?.error || "Failed to load elections");
      } finally { setLoading(false); }
    };
    fetch();
  }, []);

  return { elections, loading, error };
};

export const useElection = (id) => {
  const [election, setElection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/election/${id}`);
        setElection(res.data.election);
      } catch (e) {
        setError(e.response?.data?.error || "Failed to load election");
      } finally { setLoading(false); }
    };
    fetch();
  }, [id]);

  return { election, loading, error };
};
