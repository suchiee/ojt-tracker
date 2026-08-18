import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import apiV2 from '../services/apiV2';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [roles, setRoles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activeMembership, setActiveMembership] = useState(null);
  const [activeTenant, setActiveTenant] = useState(null);

  // Function to refresh user context and role configurations from backend
  const refreshContext = useCallback(async () => {
    try {
      const response = await apiV2.get('/auth/me');
      const data = response.data;
      
      const userObj = data.user || {};
      const userMemberships = userObj.memberships || [];
      const userRoles = Array.from(new Set(userMemberships.flatMap(m => m.roles || [])));

      setProfile(userObj);
      setMemberships(userMemberships);
      setRoles(userRoles);
      setAssignments(userObj.assignments || []);
      
      // Attempt to load active membership from localStorage or default to first
      const storedMembershipId = localStorage.getItem('active_membership_id');
      const foundMembership = userMemberships.find(m => m.membershipId === storedMembershipId) || userMemberships[0] || null;
      
      setActiveMembership(foundMembership);
      setActiveTenant(foundMembership ? { id: foundMembership.tenantId, name: foundMembership.tenantName } : null);
      
      if (foundMembership) {
        localStorage.setItem('active_membership_id', foundMembership.membershipId);
      } else {
        localStorage.removeItem('active_membership_id');
      }
      
      return {
        ...data,
        memberships: userMemberships,
        roles: userRoles
      };
    } catch (error) {
      console.error('AuthContext: Failed to load user role contexts:', error);
      setProfile(null);
      setMemberships([]);
      setRoles([]);
      setAssignments([]);
      setActiveMembership(null);
      setActiveTenant(null);
      throw error; // Propagate error so calling component (like LoginForm) gets the real error instead of silent redirect
    }
  }, []);

  // Listen to Supabase auth state change events
  useEffect(() => {
    let authSubscription;

    const initializeAuth = async () => {
      let activeSession = null;
      let activeUser = null;

      if (process.env.NODE_ENV !== 'production') {
        const token = localStorage.getItem('local_jwt_token');
        const storedUser = localStorage.getItem('local_jwt_user');
        if (token && storedUser) {
          activeSession = { access_token: token, user: JSON.parse(storedUser) };
          activeUser = JSON.parse(storedUser);
        }
      }

      if (!activeSession) {
        try {
          const { data: { session: supabaseSession } } = await supabase.auth.getSession();
          activeSession = supabaseSession;
          activeUser = supabaseSession?.user || null;
        } catch (e) {
          console.warn('Failed to retrieve Supabase session:', e);
        }
      }

      setSession(activeSession);
      setUser(activeUser);
      
      if (activeUser) {
        await refreshContext();
      }
      
      setLoading(false);

      if (activeSession && !localStorage.getItem('local_jwt_token')) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
          setSession(currentSession);
          setUser(currentSession?.user || null);
          
          if (event === 'SIGNED_IN' && currentSession?.user) {
            setLoading(true);
            await refreshContext();
            setLoading(false);
          } else if (event === 'SIGNED_OUT') {
            setMemberships([]);
            setRoles([]);
            setAssignments([]);
            setActiveMembership(null);
            setActiveTenant(null);
            localStorage.removeItem('active_membership_id');
          }
        });
        authSubscription = subscription;
      }
    };

    initializeAuth();

    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, [refreshContext]);

  // Login handler
  const signIn = async (email, password) => {
    if (process.env.NODE_ENV !== 'production') {
      try {
        const response = await apiV2.post('/auth/dev-login', { email, password });
        const { token, user: devUser } = response.data;
        
        localStorage.setItem('local_jwt_token', token);
        localStorage.setItem('local_jwt_user', JSON.stringify(devUser));
        
        const devSession = { access_token: token, user: devUser };
        setSession(devSession);
        setUser(devUser);
        
        return devSession;
      } catch (err) {
        console.warn('[Local Auth dev-login failed, falling back to Supabase]:', err.response?.data?.message || err.message);
        if (err.response?.status === 401) {
          throw new Error(err.response.data.message || 'Invalid credentials.');
        }
      }
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  // Logout handler
  const signOut = async () => {
    if (process.env.NODE_ENV !== 'production') {
      localStorage.removeItem('local_jwt_token');
      localStorage.removeItem('local_jwt_user');
    }
    setSession(null);
    setUser(null);
    setMemberships([]);
    setRoles([]);
    setAssignments([]);
    setActiveMembership(null);
    setActiveTenant(null);
    localStorage.removeItem('active_membership_id');

    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignore if offline
    }
  };

  const selectTenant = (membershipId) => {
    const found = memberships.find(m => m.membershipId === membershipId);
    if (found) {
      setActiveMembership(found);
      setActiveTenant({ id: found.tenantId, name: found.tenantName });
      localStorage.setItem('active_membership_id', found.membershipId);
    }
  };

  const val = {
    user,
    session,
    loading,
    profile,
    isAuthenticated: !!user,
    memberships,
    roles,
    assignments,
    activeMembership,
    activeTenant,
    signIn,
    signOut,
    refreshContext,
    selectTenant
  };


  return <AuthContext.Provider value={val}>{children}</AuthContext.Provider>;
};

export const useAuthV2 = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthV2 must be used within an AuthProvider');
  }
  return context;
};
