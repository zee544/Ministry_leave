import { createContext, useContext, useState, useCallback, useEffect } from "react";

const SignatureContext = createContext();

const STORAGE_KEY = "ministry_signatures";

// Load saved signatures from localStorage
function getStoredSignatures() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    return {};
  }
}

export function SignatureProvider({ children }) {
  const [signatures, setSignatures] = useState(() => getStoredSignatures());

  // Listen to auth:logout to clear in-memory signatures (not from localStorage — user keeps theirs)
  // and auth:login to reload from localStorage for the new user
  useEffect(() => {
    const handleLogout = () => {
      // Clear in-memory signatures on logout so no previous user's data bleeds through
      setSignatures({});
    };
    const handleLogin = () => {
      // Reload from localStorage (the newly logged-in user's browser may have cached their own)
      setSignatures(getStoredSignatures());
    };
    window.addEventListener("auth:logout", handleLogout);
    window.addEventListener("auth:login", handleLogin);
    return () => {
      window.removeEventListener("auth:logout", handleLogout);
      window.removeEventListener("auth:login", handleLogin);
    };
  }, []);

  // Save a signature image (data URL) against a key (user-ID-scoped: e.g. "hod_42")
  const saveSignature = useCallback((key, dataUrl) => {
    setSignatures((prev) => {
      const next = { ...prev, [key]: dataUrl };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        // ignore storage errors (e.g. quota for large images)
      }
      return next;
    });
  }, []);

  // Remove a stored signature
  const removeSignature = useCallback((key) => {
    setSignatures((prev) => {
      const next = { ...prev };
      delete next[key];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  // Get a signature for a given key
  const getSignature = useCallback(
    (key) => (key ? signatures[key] || null : null),
    [signatures]
  );

  const value = {
    signatures,
    saveSignature,
    removeSignature,
    getSignature,
  };

  return (
    <SignatureContext.Provider value={value}>
      {children}
    </SignatureContext.Provider>
  );
}

export function useSignatures() {
  const context = useContext(SignatureContext);
  if (!context) {
    throw new Error("useSignatures must be used within a SignatureProvider");
  }
  return context;
}

export default SignatureContext;
