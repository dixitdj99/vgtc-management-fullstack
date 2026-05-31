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
        .then(r => { 
          const userData = r.data;
          setUser(userData); 
          setCurrentUser(userData); 
        })
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

  const login = async (username, password, selectedPlant, selectedGodown, orgId) => {
    const res = await ax.post(`/auth/login`, { username, password, plant: selectedPlant, godown: selectedGodown, orgId });
    
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

  const verifyOtp = async (userId, code, selectedPlant, selectedGodown, orgId) => {
    const res = await ax.post(`/auth/verify-otp`, { userId, code, plant: selectedPlant, godown: selectedGodown, orgId });
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

  const refreshUser = async () => {
    if (!token) return null;
    setAuthToken(token);
    const res = await ax.get('/auth/me');
    const userData = res.data;
    setUser(userData);
    setCurrentUser(userData);
    return userData;
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

  const hasPermission = (permKey, action = 'view') => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const perm = user.permissions?.[permKey];
    if (!perm) return false;
    if (action === 'view') return true; // any permission level allows view
    if (action === 'edit') return perm === 'edit' || perm === 'delete';
    if (action === 'delete') return perm === 'delete';
    if (action === 'export') return perm === 'edit' || perm === 'delete';
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, token, plant, godown, setPlant, login, verifyOtp, resendOtp, refreshUser, logout, ready, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}
