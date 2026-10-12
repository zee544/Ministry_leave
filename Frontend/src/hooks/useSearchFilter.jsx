import { useState, useMemo, useCallback } from "react";

/**
 * A reusable hook for search, filter, and pagination operations.
 *
 * @param {Array} data - The full dataset to filter
 * @param {Object} options
 * @param {Array<string>} options.searchFields - Fields to search against (e.g. ["name", "email"])
 * @param {Array<{key: string, label: string}>} options.filterConfig - Filter dropdown configs
 * @param {number} options.itemsPerPage - Number of items per page (default: 10)
 * @returns {Object} - Search/filter/pagination state and handlers
 */

export function useSearchFilter(data, options = {}) {
  const {
    searchFields = [],
    filterConfig = [],
    itemsPerPage = 10,
  } = options;

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Dynamic filter state — creates an object like { designation: "", division: "", status: "" }
  const initialFilterState = useMemo(
    () => Object.fromEntries(filterConfig.map((f) => [f.key, ""])),
    [filterConfig]
  );
  const [filters, setFilters] = useState(initialFilterState);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when search or filters change
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }, []);

  const handleFilterChange = useCallback((key) => (e) => {
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));
    setCurrentPage(1);
  }, []);

  // Compute filtered data
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Search: check if query matches any of the specified fields
      const matchesSearch =
        !searchQuery ||
        searchFields.some((field) => {
          const value = item[field];
          return value && String(value).toLowerCase().includes(searchQuery.toLowerCase());
        });

      // Filters: check each filter key matches
      const matchesFilters = filterConfig.every(({ key }) => {
        const filterValue = filters[key];
        if (!filterValue) return true; // no filter selected
        return item[key] === filterValue;
      });

      return matchesSearch && matchesFilters;
    });
  }, [data, searchQuery, filters, searchFields, filterConfig]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = useCallback(
    (page) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)));
    },
    [totalPages]
  );

  const getPageNumbers = useCallback(() => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setFilters(initialFilterState);
    setCurrentPage(1);
  }, [initialFilterState]);

  const hasActiveFilters = useMemo(
    () => searchQuery !== "" || Object.values(filters).some((v) => v !== ""),
    [searchQuery, filters]
  );

  // Get unique options for each filter from the data (or predefined options if provided)
  const filterOptions = useMemo(() => {
    const optionsMap = {};
    filterConfig.forEach(({ key, options }) => {
      if (options && Array.isArray(options) && options.length > 0) {
        optionsMap[key] = options;
      } else {
        optionsMap[key] = [...new Set(data.map((item) => item[key]).filter(Boolean))].sort();
      }
    });
    return optionsMap;
  }, [data, filterConfig]);

  return {
    // Search
    searchQuery,
    handleSearchChange,
    // Filters
    filters,
    handleFilterChange,
    filterOptions,
    clearFilters,
    hasActiveFilters,
    // Pagination
    currentPage,
    totalPages,
    indexOfFirstItem,
    indexOfLastItem,
    currentItems,
    filteredData,
    goToPage,
    getPageNumbers,
  };
}

/**
 * Reusable pagination UI component.
 */
export function Pagination({
  currentPage,
  totalPages,
  indexOfFirstItem,
  indexOfLastItem,
  filteredCount,
  goToPage,
  getPageNumbers,
  label = "items",
}) {
  if (filteredCount === 0) return null;

  return (
    <div className="px-4 lg:px-6 py-3 lg:py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3">
      <p className="text-xs lg:text-sm text-gray-500">
        Showing <span className="font-medium text-gray-700">{indexOfFirstItem + 1}</span> to{" "}
        <span className="font-medium text-gray-700">{Math.min(indexOfLastItem, filteredCount)}</span> of{" "}
        <span className="font-medium text-gray-700">{filteredCount}</span> {label}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-2 lg:px-3 py-1 lg:py-1.5 text-xs lg:text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ◀
        </button>

        {getPageNumbers().map((page) => (
          <button
            key={page}
            onClick={() => goToPage(page)}
            className={`w-7 h-7 lg:w-9 lg:h-9 text-xs lg:text-sm rounded-lg font-medium transition-colors ${
              currentPage === page
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 bg-gray-100 hover:bg-gray-200"
            }`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-2 lg:px-3 py-1 lg:py-1.5 text-xs lg:text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ▶
        </button>
      </div>
    </div>
  );
}

