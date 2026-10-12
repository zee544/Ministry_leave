import { useState, useMemo, useCallback } from "react";
import { useSearchFilter, Pagination } from "../hooks/useSearchFilter.jsx";

export default function DataTable({
    columns = [],
    data = [],
    mobileRender,
    options = {},
    emptyState = {},
    headerTitle,
    headerInfo,
    headerActions = [],
    loading = false,
    label = "items",
    onRowClick,
}) {
    const {
        searchFields = [],
        filterConfig = [],
        itemsPerPage = 10,
        searchable = true,
        showFilters = true,
        getStatusStyle,
    } = options;

    const emptyIcon = emptyState.icon || "🔍";
    const emptyTitle = emptyState.title || "No data found";
    const emptyMessage = emptyState.message || "Try adjusting your search or filters";

    const {
        searchQuery,
        handleSearchChange,
        filters,
        handleFilterChange,
        filterOptions,
        clearFilters,
        hasActiveFilters,
        currentPage,
        totalPages,
        indexOfFirstItem,
        indexOfLastItem,
        currentItems,
        filteredData,
        goToPage,
        getPageNumbers,
    } = useSearchFilter(data, {
        searchFields,
        filterConfig,
        itemsPerPage,
    });

    const getStatusBadge = useCallback((status) => {
        const defaultStyles = {
            Approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
            Pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
            Declined: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
            "Admin Approved": "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
            "Pending Acting Officer": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
            Active: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
            Inactive: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
            "On Leave": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
        };
        const style = getStatusStyle ? getStatusStyle(status) : (defaultStyles[status] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300");
        return (
            <span className={`px-3 py-1 rounded-lg text-md font-medium ${style}`}>
                {status}
            </span>
        );
    }, [getStatusStyle]);

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {headerTitle && (
                    <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700">
                        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse" />
                    </div>
                )}
                <div className="p-4 lg:p-6 space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex gap-4">
                            {columns.map((col, j) => (
                                <div key={j} className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse flex-1" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            {(headerTitle || headerActions.length > 0) && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                    <div>
                        {headerTitle && (
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">{headerTitle}</h3>
                        )}
                        {headerInfo && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{headerInfo}</p>
                        )}
                    </div>
                    {headerActions.length > 0 && (
                        <div className="flex gap-2">
                            {headerActions.map((action, i) => (
                                <button
                                    key={i}
                                    onClick={action.onClick}
                                    className={`flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg transition-colors shadow-sm ${
                                        action.className || "bg-blue-500 text-white hover:bg-blue-700"
                                    }`}
                                >
                                    {action.icon && <span>{action.icon}</span>}
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {(searchable || (showFilters && filterConfig.length > 0)) && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 lg:p-4 mb-4 lg:mb-6 transition-colors">
                    {searchable && (
                        <div className="relative w-full">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                            <input
                                type="text"
                                placeholder={`Search ${label}...`}
                                value={searchQuery}
                                onChange={handleSearchChange}
                                className="w-full pl-9 lg:pl-10 pr-3 lg:pr-4 py-2 lg:py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 text-xs lg:text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all"
                            />
                        </div>
                    )}

                    {showFilters && filterConfig.length > 0 && (
                        <div className={`flex flex-col lg:flex-row gap-2 lg:gap-3 ${searchable ? "mt-3" : ""}`}>
                            {filterConfig.map(({ key, label }) => (
                                <select
                                    key={key}
                                    value={filters[key] || ""}
                                    onChange={handleFilterChange(key)}
                                    className="w-full lg:w-auto px-3 lg:px-4 py-2 lg:py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-xs lg:text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">All {label}</option>
                                    {(filterOptions[key] || []).map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            ))}

                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="w-full lg:w-auto px-3 lg:px-4 py-2 lg:py-2.5 text-xs lg:text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                                >
                                    ✕ Clear Filters
                                </button>
                            )}
                        </div>
                    )}

                    {hasActiveFilters && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            <strong>{filteredData.length}</strong> {label} found
                            {` (filtered from ${data.length})`}
                        </p>
                    )}
                </div>
            )}

            {filteredData.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 lg:p-12 text-center transition-colors">
                    <span className="text-4xl lg:text-5xl block mb-4">{emptyIcon}</span>
                    <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white mb-2">{emptyTitle}</h3>
                    <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 mb-4">{emptyMessage}</p>
                    {hasActiveFilters && (
                        <button
                            onClick={emptyState.onAction || clearFilters}
                            className="px-4 lg:px-5 py-2 bg-blue-500 text-white rounded-lg text-xs lg:text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                            {emptyState.actionLabel || "Clear Filters"}
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {mobileRender && (
                        <div className="block lg:hidden divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden mb-4">
                            {currentItems.map((item, idx) => (
                                <div key={item.id || idx} className="bg-white dark:bg-gray-800">
                                    {mobileRender(item, { getStatusBadge, index: indexOfFirstItem + idx })}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="hidden lg:block bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-500 dark:bg-gray-700 text-white">
                                        {columns.map((col) => (
                                            <th
                                                key={col.key}
                                                className={`px-6 py-4 text-xs font-semibold uppercase tracking-wider text-left ${col.className || ""}`}
                                            >
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {currentItems.map((item, idx) => (
                                        <tr
                                            key={item.id || idx}
                                            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                                            onClick={() => onRowClick?.(item)}
                                        >
                                            {columns.map((col) => (
                                                <td key={col.key} className={`px-6 py-4 text-sm text-gray-800 dark:text-gray-200 ${col.className || ""}`}>
                                                    {col.render
                                                        ? col.render(item, { getStatusBadge, index: indexOfFirstItem + idx })
                                                        : typeof item[col.key] !== "undefined"
                                                            ? item[col.key]
                                                            : "—"}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        indexOfFirstItem={indexOfFirstItem}
                        indexOfLastItem={indexOfLastItem}
                        filteredCount={filteredData.length}
                        goToPage={goToPage}
                        getPageNumbers={getPageNumbers}
                        label={label}
                    />
                </>
            )}
        </div>
    );
}