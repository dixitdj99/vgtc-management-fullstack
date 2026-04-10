import React, { createContext, useContext, useState, useEffect } from 'react';
import ax, { setAuthToken, setCurrentUser } from '../api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('vgtc-token'));
  const [plant, setPlantState] = useState(() => localStorage.getItem('vgtc-plant') || '');
  const [godown, setGodownState] = useState(() => localStorage.getItem('vgtc-godown') || '');
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

  const setPlant = (p, g = '') => {
    localStorage.setItem('vgtc-plant', p);
    setPlantState(p);
    if (g) {
      localStorage.setItem('vgtc-godown', g);
      setGodownState(g);
    } else {
      localStorage.removeItem('vgtc-godown');
      setGodownState('');
    }
  };

  const login = async (username, password, selectedPlant, selectedGodown) => {
    const res = await ax.post(`/auth/login`, { username, password, plant: selectedPlant, godown: selectedGodown });
    
    // Check if OTP is required
    if (res.data.requireOtp) {
      return res.data; // { requireOtp: true, userId, email }
    }

    const { token: t, user: u } = res.data;
    localStorage.setItem('vgtc-token', t);
    if (selectedPlant) {
      localStorage.setItem('vgtc-plant', selectedPlant);
      setPlantState(selectedPlant);
      if (selectedGodown) {
        localStorage.setItem('vgtc-godown', selectedGodown);
        setGodownState(selectedGodown);
      } else {
        localStorage.removeItem('vgtc-godown');
        setGodownState('');
      }
    }
    setAuthToken(t);
    setToken(t);
    setUser(u);
    setCurrentUser(u);
    return u;
  };

  const verifyOtp = async (userId, code, selectedPlant, selectedGodown) => {
    const res = await ax.post(`/auth/verify-otp`, { userId, code, plant: selectedPlant, godown: selectedGodown });
    const { token: t, user: u } = res.data;
    
    localStorage.setItem('vgtc-token', t);
    if (selectedPlant) {
      localStorage.setItem('vgtc-plant', selectedPlant);
      setPlantState(selectedPlant);
      if (selectedGodown) {
        localStorage.setItem('vgtc-godown', selectedGodown);
        setGodownState(selectedGodown);
      } else {
        localStorage.removeItem('vgtc-godown');
        setGodownState('');
      }
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
    localStorage.removeItem('vgtc-godown');
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setCurrentUser(null);
    setPlantState('');
    setGodownState('');
  };

  return (
    <AuthContext.Provider value={{ user, token, plant, godown, setPlant, login, verifyOtp, resendOtp, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}