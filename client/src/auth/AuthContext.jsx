import React, { createContext, useContext, useState, useEffect } from 'react';
import ax, { setAuthToken, setCurrentUser } from '../api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('vgtc-token'));
  const [plant, setPlantState] = useState(() => localStorage.getItem('vgtc-plant') || '');
  const [ready, setReady] = useState(false);

  // Set axios default auth header and verify token on mount
  useEffect(() => {
    if (token) {
      setAuthToken(token);
      ax.get(`/auth/me`)
        .then(r => { setUser(r.data); setCurrentUser(r.data); })
        .catch(() => { logout(); })
        .finally(() => setReady(true));
    } else {
      setAuthToken(null);
      setReady(true);
    }
  }, [token]);

  const setPlant = (p) => {
    localStorage.setItem('vgtc-plant', p);
    setPlantState(p);
  };

  const login = async (username, password, selectedPlant) => {
    const res = await ax.post(`/auth/login`, { username, password });
    
    // Check if OTP is required
    if (res.data.requireOtp) {
      return res.data; // { requireOtp: true, userId, email }
    }

    const { token: t, user: u } = res.data;
    localStorage.setItem('vgtc-token', t);
    if (selectedPlant) {
      localStorage.setItem('vgtc-plant', selectedPlant);
      setPlantState(selectedPlant);
    }
    setAuthToken(t);
    setToken(t);
    setUser(u);
    setCurrentUser(u);
    return u;
  };

  const verifyOtp = async (userId, code, selectedPlant) => {
    const res = await ax.post(`/auth/verify-otp`, { userId, code });
    const { token: t, user: u } = res.data;
    
    localStorage.setItem('vgtc-token', t);
    if (selectedPlant) {
      localStorage.setItem('vgtc-plant', selectedPlant);
      setPlantState(selectedPlant);
    }
    setAuthToken(t);
    setToken(t);
    setUser(u);
    setCurrentUser(u);
    return u;
  };

  const resendOtp = async (userId) => {
    await ax.post(`/auth/resend-otp`, { userId });
  };

  const logout = () => {
    localStorage.removeItem('vgtc-token');
    localStorage.removeItem('vgtc-plant');
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setCurrentUser(null);
    setPlantState('');
  };

  return (
    <AuthContext.Provider value={{ user, token, plant, setPlant, login, verifyOtp, resendOtp, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}