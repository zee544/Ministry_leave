import { createContext, useContext, useState, useCallback, useEffect } from "react";

const SignatureContext = createContext();

const STORAGE_KEY = "ministry_signatures";
const EXTRACTED_STORAGE_KEY = "ministry_extracted_signatures";

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
  const [extractedSignatures, setExtractedSignatures] = useState(() => {
    try {
      const stored = localStorage.getItem(EXTRACTED_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Listen to auth:logout to clear in-memory signatures (not from localStorage — user keeps theirs)
  // and auth:login to reload from localStorage for the new user
  useEffect(() => {
    const handleLogout = () => {
      // Clear in-memory signatures on logout so no previous user's data bleeds through
      setSignatures({});
      setExtractedSignatures({});
    };
    const handleLogin = () => {
      // Reload from localStorage (the newly logged-in user's browser may have cached their own)
      setSignatures(getStoredSignatures());
      try {
        const stored = localStorage.getItem(EXTRACTED_STORAGE_KEY);
        setExtractedSignatures(stored ? JSON.parse(stored) : {});
      } catch {
        setExtractedSignatures({});
      }
    };
    window.addEventListener("auth:logout", handleLogout);
    window.addEventListener("auth:login", handleLogin);
    return () => {
      window.removeEventListener("auth:logout", handleLogout);
      window.removeEventListener("auth:login", handleLogin);
    };
  }, []);

  // Save a signature image (data URL) against a key (user-ID-scoped: e.g. "hod_42")
  const saveSignature = useCallback((key, dataUrl, extractedDataUrl) => {
    setSignatures((prev) => {
      const next = { ...prev, [key]: dataUrl };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        // ignore storage errors (e.g. quota for large images)
      }
      return next;
    });
    if (extractedDataUrl !== undefined) {
      setExtractedSignatures((prev) => {
        const next = { ...prev, [key]: extractedDataUrl };
        try {
          localStorage.setItem(EXTRACTED_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // The database remains the durable signature store if local storage is full.
        }
        return next;
      });
    }
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
    setExtractedSignatures((prev) => {
      const next = { ...prev };
      delete next[key];
      try {
        localStorage.setItem(EXTRACTED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The extracted cache can be reconstructed from the source image.
      }
      return next;
    });
  }, []);

  // Get a signature for a given key
  const getSignature = useCallback(
    (key) => (key ? extractedSignatures[key] || signatures[key] || null : null),
    [signatures, extractedSignatures]
  );
  const getSourceSignature = useCallback(
    (key) => (key ? signatures[key] || null : null),
    [signatures]
  );
  const getExtractedSignature = useCallback(
    (key) => (key ? extractedSignatures[key] || null : null),
    [extractedSignatures]
  );

  const value = {
    signatures,
    saveSignature,
    removeSignature,
    getSignature,
    getSourceSignature,
    getExtractedSignature,
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
