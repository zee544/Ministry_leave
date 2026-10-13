import { useState, useRef, useEffect } from "react";
import { useSignatures } from "../hooks/SignatureContext.jsx";
import { apiUrl } from "../api.js";
function SignatureUpload({
  signatureKey,
  label = "Signature",
  required = false,
  showError = false,
  onErrorChange,
}) {
  const { getSignature, saveSignature, removeSignature } = useSignatures();
  const [preview, setPreview] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const fileInputRef = useRef(null);

  const existing = getSignature(signatureKey);
  const currentPreview = preview || existing;

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
            saveSignature(signatureKey, data.signature);
            setPreview(data.signature);
            if (onErrorChange) onErrorChange(false);
          }
        }
      } catch (err) {
        console.warn("Failed to load signature from backend:", err);
      } finally {
        setSyncing(false);
      }
    };
    loadFromBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureKey]);

  const compressImage = (file, maxWidth = 400, maxHeight = 200, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(compressedDataUrl);
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

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
      const compressedDataUrl = await compressImage(file);
      console.log(
        `[Signature] Original: ${(file.size / 1024).toFixed(1)}KB → Compressed: ${(
          compressedDataUrl.length / 1024
        ).toFixed(1)}KB`
      );

      saveSignature(signatureKey, compressedDataUrl);
      setPreview(compressedDataUrl);
      if (onErrorChange) onErrorChange(false);
    } catch (err) {
      console.error("Failed to process image:", err);
      alert("Failed to process image. Please try a different image.");
    } finally {
      e.target.value = "";
    }
  };

  const handleRemove = () => {
    removeSignature(signatureKey);
    setPreview(null);
    if (onErrorChange) onErrorChange(true);
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
              className="px-3 py-1.5 text-xs bg-teal-500 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleRemove}
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
          className="w-full py-6 flex flex-col items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span className="text-2xl mb-1">✍️</span>
          <span className="text-xs">Click to upload {label.toLowerCase()}</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {required && showError && !existing && !preview && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">Signature is required.</p>
      )}
    </div>
  );
}

export default SignatureUpload;