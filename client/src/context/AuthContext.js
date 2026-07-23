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
      setProfile(data.user || null);
      setMemberships(data.memberships || []);
      setRoles(data.roles || []);
      setAssignments(data.assignments || []);
      
      // Attempt to load active membership from localStorage or default to first
      const storedMembershipId = localStorage.getItem('active_membership_id');
      const foundMembership = data.memberships?.find(m => m.id === storedMembershipId) || data.memberships?.[0] || null;
      
      setActiveMembership(foundMembership);
      setActiveTenant(foundMembership ? foundMembership.tenant : null);
      
      if (foundMembership) {
        localStorage.setItem('active_membership_id', foundMembership.id);
      } else {
        localStorage.removeItem('active_membership_id');
      }
      return data;
    } catch (error) {
      console.error('AuthContext: Failed to load user role contexts:', error);
      setProfile(null);
      setMemberships([]);
      setRoles([]);
      setAssignments([]);
      setActiveMembership(null);
      setActiveTenant(null);
      return { memberships: [], roles: [], assignments: [] };
    }
  }, []);

  // Listen to Supabase auth state change events
  useEffect(() => {
    let authSubscription;

    const initializeAuth = async () => {
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      setSession(activeSession);
      setUser(activeSession?.user || null);
      
      if (activeSession?.user) {
        await refreshContext();
      }
      
      setLoading(false);

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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  // Logout handler
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const selectTenant = (membershipId) => {
    const found = memberships.find(m => m.id === membershipId);
    if (found) {
      setActiveMembership(found);
      setActiveTenant(found.tenant);
      localStorage.setItem('active_membership_id', found.id);
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
