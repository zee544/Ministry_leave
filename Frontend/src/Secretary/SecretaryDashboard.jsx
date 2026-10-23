import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import SecretaryHeader from "../Components/SecretaryHeader";
import SecretarySidebar from "../Components/SecretarySidebar";
import Settings from "../User/settings";
import { ClipboardList, Clock, CheckCircle, Globe } from "lucide-react";
import DataTable from "../Components/DataTable";
import { useLeaves } from "../hooks/LeaveContext.jsx";

function SecretaryDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "dashboard";

  const setActiveTab = (tab) => {
    if (tab === "dashboard") setSearchParams({}, { replace: false });
    else setSearchParams({ tab }, { replace: false });
  };

  const { leaves, fetchLeaves } = useLeaves();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (fetchLeaves) fetchLeaves();
  }, [activeTab, fetchLeaves]);

  const allLeaves = leaves || [];
  const pendingLeaves = allLeaves.filter((l) => l.status === "Pending");
  const approvedLeaves = allLeaves.filter((l) => l.status === "Approved");
  const uniqueDivisions = new Set(allLeaves.map((l) => l.division)).size;

  const stats = [
    {
      label: "Total Leave Records",
      value: allLeaves.length,
      icon: <ClipboardList className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-blue-500",
    },
    {
      label: "Pending Approvals",
      value: pendingLeaves.length,
      icon: <Clock className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-yellow-500",
    },
    {
      label: "Approved",
      value: approvedLeaves.length,
      icon: <CheckCircle className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-green-500",
    },
    {
      label: "Divisions Active",
      value: uniqueDivisions,
      icon: <Globe className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-purple-500",
    },
  ];

  const columns = [
    {
      key: "employee",
      label: "Employee",
      render: (item) => (
        <span className="font-medium text-gray-800 dark:text-white">
          {item.employee}
        </span>
      ),
    },
    {
      key: "division",
      label: "Division",
      render: (item) => (
        <span className="text-gray-800 dark:text-gray-200">{item.division || "—"}</span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.type}</span>,
    },
    {
      key: "from",
      label: "From",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from}</span>,
    },
    {
      key: "to",
      label: "To",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to}</span>,
    },
    {
      key: "noOfDays",
      label: "Days",
      render: (item) => (
        <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
          {item.noOfDays || item.days || "—"}
        </span>
      ),
    },
    {
      key: "appliedOn",
      label: "Applied On",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.appliedOn}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (item, { getStatusBadge }) => getStatusBadge(item.status),
    },
  ];

  const mobileRender = (item, { getStatusBadge }) => (
    <div className="p-2.5">
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
            {item.employee}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {item.division} · {item.type}
          </p>
        </div>
        <div className="shrink-0">{getStatusBadge(item.status)}</div>
      </div>
      <div className="flex justify-between items-center text-[11px]">
        <span className="text-gray-700 dark:text-gray-300">
          {item.from} → {item.to}
        </span>
        <span className="font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/40 px-1.5 py-0.5 rounded text-[10px]">
          {item.noOfDays || item.days} day(s)
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:block lg:w-1/5 shrink-0">
        <SecretarySidebar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
      <div className="lg:hidden">
        <SecretarySidebar
          activeTab={activeTab}
          onTabChange={(key) => {
            setActiveTab(key);
            setSidebarOpen(false);
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-4/5">
        <div className="shrink-0">
          <SecretaryHeader
            activeTab={activeTab}
            onMenuToggle={() => setSidebarOpen(true)}
          />
        </div>

        <main className="flex-1 overflow-y-auto no-scrollbar p-4 lg:p-8 bg-gray-50 dark:bg-gray-900 transition-colors">
          {activeTab === "dashboard" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                {stats.map((stat, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 font-medium truncate">
                          {stat.label}
                        </p>
                        <p className="text-2xl lg:text-3xl font-bold text-gray-800 dark:text-white mt-1">
                          {stat.value}
                        </p>
                      </div>
                      <div
                        className={`w-10 h-10 lg:w-14 lg:h-14 ${stat.color} rounded-xl flex items-center justify-center shadow-lg shrink-0 ml-3`}
                      >
                        {stat.icon}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                    Recent Leave Records (All Divisions)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Read-only overview of all leave applications across the ministry
                  </p>
                </div>
                <div className="p-4">
                  <DataTable
                    columns={columns}
                    data={allLeaves.slice(0, 10)}
                    mobileRender={mobileRender}
                    options={{ searchable: false, showFilters: false, itemsPerPage: 10 }}
                    label="leave records"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === "all-leaves" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white mb-4">
                All Leave Records
              </h3>
              <DataTable
                columns={columns}
                data={allLeaves}
                mobileRender={mobileRender}
                options={{ searchable: true, showFilters: true, itemsPerPage: 15 }}
                label="leave records"
              />
            </div>
          )}

          {activeTab === "pending" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white mb-4">
                Pending Approvals (All Divisions)
              </h3>
              <DataTable
                columns={columns}
                data={pendingLeaves}
                mobileRender={mobileRender}
                options={{ searchable: true, showFilters: false, itemsPerPage: 15 }}
                label="pending leave requests"
              />
            </div>
          )}

          {activeTab === "reports" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 text-center text-gray-500 dark:text-gray-400">
              <p className="text-sm">Reports module coming soon.</p>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <Settings />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default SecretaryDashboard;