import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "approve",
  requireReason = false,
  reasonLabel = "Reason (optional)",
  reasonPlaceholder = "Enter a reason...",
  loading = false,
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!open) return null;

  const isDecline = tone === "decline";
  const confirmBtnClass = isDecline
    ? "bg-red-500 hover:bg-red-600"
    : "bg-green-500 hover:bg-green-600";

  const modalContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start gap-3">
          <span className="text-2xl">{isDecline ? "" : ""}</span>
          <div className="flex-1">
            <h3 className={`text-base font-bold ${isDecline ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
              {title}
            </h3>
            {message && <div className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{message}</div>}
          </div>
        </div>

        {requireReason && (
          <div className="px-6 py-4">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{reasonLabel}</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800"
            />
          </div>
        )}

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${confirmBtnClass}`}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}