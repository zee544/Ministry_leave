import { useState, useRef, useEffect } from "react";
import { useSignatures } from "../hooks/SignatureContext.jsx";
import { apiUrl } from "../api.js";
import { extractSignature, readImageFile } from "../utils/signatureImage.js";

function SignatureUpload({
  signatureKey,
  label = "Signature",
  required = false,
  showError = false,
  onErrorChange,
  onSignatureChange,
}) {
  const {
    getSignature,
    saveSignature,
    removeSignature,
  } = useSignatures();
  const [preview, setPreview] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropStart, setCropStart] = useState(null);
  const [manualCrop, setManualCrop] = useState(null);
  const fileInputRef = useRef(null);

  const existing = getSignature(signatureKey);
  const currentPreview = existing || preview;

  // ✅ Token එක හරියට යවන්න හැදුවා
  const persistSignature = async (sourceSignature, extractedSignature) => {
    if (onSignatureChange) {
      const saved = await onSignatureChange(sourceSignature, extractedSignature);
      if (saved === false) throw new Error("The signature was not saved. Please try again.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) throw new Error("You are not logged in.");

    const response = await fetch(apiUrl("/api/auth/signature"), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        signature: sourceSignature,
        extractedSignature,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Your session expired. Please log in again.");
      }
      throw new Error(data.message || `Failed to save signature (${response.status}).`);
    }
  };

  useEffect(() => {
    const loadFromBackend = async () => {
      if (!signatureKey) return;
      const token = localStorage.getItem("token");
      if (!token) return;

      setSyncing(true);
      try {
        const res = await fetch(apiUrl("/api/auth/signature"), {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.signature) {
            setSourcePreview(data.signature);
            const displayImg = data.extractedSignature || data.signature;
            saveSignature(signatureKey, data.signature, data.extractedSignature);
            setPreview(displayImg);
            if (onErrorChange) onErrorChange(false);
          }
        } else if (res.status === 401) {
          throw new Error("Session expired. Please log in again.");
        }
      } catch (err) {
        console.warn("Failed to load signature:", err);
        setUploadError(err.message);
      } finally {
        setSyncing(false);
      }
    };
    loadFromBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureKey]);

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, etc.)");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image is too large. Please upload an image smaller than 5MB.");
      e.target.value = "";
      return;
    }

    try {
      setSyncing(true);
      setUploadError("");
      const originalDataUrl = await readImageFile(file);
      setSourcePreview(originalDataUrl);

      try {
        // ✅ මෙතනදි ඔයාගේ ඉමේජ් එකේ බැක්ග්‍රවුන්ඩ් එක ඉවත් කරලා අත්සන විතරක් ගන්නවා
        const extracted = await extractSignature(originalDataUrl);
        await persistSignature(originalDataUrl, extracted);
        saveSignature(signatureKey, originalDataUrl, extracted);
        setPreview(extracted);
        setCropOpen(false);
      } catch (error) {
        await persistSignature(originalDataUrl, null);
        saveSignature(signatureKey, originalDataUrl, null);
        setPreview(null);
        setManualCrop(null);
        setCropOpen(true);
        setUploadError(error.message || "Could not detect the signature. Crop it manually.");
      }
      if (onErrorChange) onErrorChange(false);
    } catch (err) {
      console.error("Failed to process image:", err);
      setUploadError(err.message || "Failed to save the signature. Please try again.");
    } finally {
      setSyncing(false);
      e.target.value = "";
    }
  };

  const handleRemove = async () => {
    setSyncing(true);
    setUploadError("");
    try {
      if (onSignatureChange) {
        const saved = await onSignatureChange(null, null, true);
        if (saved === false) {
          throw new Error("The signature could not be removed. Please try again.");
        }
      } else {
        await persistSignature(null, null);
      }
      removeSignature(signatureKey);
      setPreview(null);
      setSourcePreview(null);
      setCropOpen(false);
      if (onErrorChange) onErrorChange(true);
    } catch (err) {
      console.error("Failed to remove saved signature:", err);
      setUploadError(err.message || "Failed to remove the signature. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  const handleCancelCrop = () => {
    setCropOpen(false);
    setManualCrop(null);
    if (preview !== existing) {
      setPreview(existing);
      setSourcePreview(existing);
    }
  };

  const updateManualCrop = (event, isStart = false) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
    if (isStart) {
      setCropStart(point);
      setManualCrop({ x: point.x, y: point.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!cropStart) return;
    setManualCrop({
      x: Math.min(cropStart.x, point.x),
      y: Math.min(cropStart.y, point.y),
      width: Math.abs(point.x - cropStart.x),
      height: Math.abs(point.y - cropStart.y),
    });
  };

  const handleManualCrop = async () => {
    if (!sourcePreview || !manualCrop || manualCrop.width < 0.02 || manualCrop.height < 0.02) {
      setUploadError("Draw a crop around the signature before applying it.");
      return;
    }
    setSyncing(true);
    setUploadError("");
    try {
      const extracted = await extractSignature(sourcePreview, manualCrop);
      await persistSignature(sourcePreview, extracted);
      saveSignature(signatureKey, sourcePreview, extracted);
      setPreview(extracted);
      setCropOpen(false);
      setManualCrop(null);
      if (onErrorChange) onErrorChange(false);
    } catch (err) {
      setUploadError(err.message || "Could not extract a signature from that crop.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 transition-colors">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
        {syncing && <span className="text-xs text-blue-500 ml-2">(loading...)</span>}
      </label>

      {currentPreview ? (
        <div className="flex items-center gap-4">
          <img
            src={currentPreview}
            alt={label}
            className="h-20 w-auto border border-gray-200 dark:border-gray-600 rounded-lg bg-white object-contain p-1"
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={syncing}
              className="px-3 py-1.5 text-xs bg-teal-500 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                setManualCrop(null);
                setCropOpen(true);
              }}
              disabled={syncing}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Crop manually
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={syncing}
              className="px-3 py-1.5 text-xs bg-[#E41B17] text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={syncing}
          className="w-full py-6 flex flex-col items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span className="text-2xl mb-1">✍️</span>
          <span className="text-xs">Click to upload {label.toLowerCase()}</span>
        </button>
      )}
      {uploadError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {uploadError}
        </p>
      )}
      {cropOpen && sourcePreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-4 shadow-xl dark:bg-gray-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Crop the signature
            </h3>
            <p className="my-2 text-xs text-gray-600 dark:text-gray-300">
              Drag a rectangle around only the handwritten signature. The original image remains saved as a backup.
            </p>
            <div className="max-h-[65vh] overflow-auto text-center">
              <div className="relative inline-block max-w-full touch-none">
                <img
                  src={sourcePreview}
                  alt="Original signature source"
                  className="block max-h-[60vh] max-w-full select-none object-contain"
                  onPointerDown={(event) => updateManualCrop(event, true)}
                  onPointerMove={(event) => updateManualCrop(event)}
                  onPointerUp={() => setCropStart(null)}
                  draggable="false"
                />
                {manualCrop && (
                  <div
                    className="pointer-events-none absolute border-2 border-teal-500 bg-teal-400/10"
                    style={{
                      left: `${manualCrop.x * 100}%`,
                      top: `${manualCrop.y * 100}%`,
                      width: `${manualCrop.width * 100}%`,
                      height: `${manualCrop.height * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelCrop}
                disabled={syncing}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualCrop}
                disabled={syncing}
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {syncing ? "Processing..." : "Use this crop"}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={syncing}
      />

      {required && showError && !existing && !preview && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">Signature is required.</p>
      )}
    </div>
  );
}

export default SignatureUpload;