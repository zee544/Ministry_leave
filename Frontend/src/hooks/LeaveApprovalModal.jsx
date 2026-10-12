import { useSignatures } from './SignatureContext.jsx';
import { useUser } from './UserContext.jsx';
import { useLeaves } from './LeaveContext.jsx';
import { Printer } from "lucide-react";

export default function LeaveApprovalModal({
  selectedLeave,
  setShowPrintModal,
  setSelectedLeave
}) {
  const { getSignature } = useSignatures();
  const { currentUser } = useUser();
  const { leaves } = useLeaves();

  const getLeaveDays = (leave) => {
    if (leave.noOfDays) return parseFloat(leave.noOfDays) || 0;
    if (leave.days) return parseFloat(leave.days) || 0;
    if (leave.type === "Half-day") return 0.5;
    if (!leave.from || !leave.to) return 0;
    const start = new Date(leave.from);
    const end = new Date(leave.to);
    if (isNaN(start) || isNaN(end)) return 0;
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  };

  const leaveYear = selectedLeave?.from
    ? new Date(selectedLeave.from).getFullYear()
    : new Date().getFullYear();

  const appliedOnDate = selectedLeave?.appliedOn
    ? new Date(selectedLeave.appliedOn)
    : null;

  const employeeLeavesThisYear = leaves.filter((l) => {
    if (l.appliedBy !== selectedLeave?.employee) return false;
    if (l.status !== "Approved" && l.status !== "Admin Approved") return false;
    if (!l.from) return false;
    const year = new Date(l.from).getFullYear();
    if (year !== leaveYear) return false;
    if (appliedOnDate && l.appliedOn) {
      const leaveAppliedDate = new Date(l.appliedOn);
      if (leaveAppliedDate > appliedOnDate) return false;
    }
    return true;
  });

  const takenCasual = employeeLeavesThisYear
    .filter((l) => l.type === "Casual")
    .reduce((sum, l) => sum + getLeaveDays(l), 0);

  const takenVacation = employeeLeavesThisYear
    .filter((l) => l.type === "Annual")
    .reduce((sum, l) => sum + getLeaveDays(l), 0);

  const takenOther = employeeLeavesThisYear
    .filter((l) => l.type === "Other")
    .reduce((sum, l) => sum + getLeaveDays(l), 0);

  const handlePrint = () => {
    const pages = document.querySelectorAll('#leave-print-area .print-page');

    if (pages.length !== 2) {
      alert(`Print error: expected 2 pages, but found ${pages.length}.`);
      return;
    }

    const styles = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style')
    )
      .map((el) => el.outerHTML)
      .join('\n');

    const page1 = pages[0].outerHTML;
    const page2 = pages[1].outerHTML;

    const iframe = document.createElement('iframe');

    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;

    doc.open();

    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          ${styles}
          <style>
            @page {
              size: A4 portrait;
              margin: 1cm 1.5cm 0 1.5cm !important;
            }

            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              min-width: 0 !important;
              max-width: none !important;
              background: #fff !important;
            }

            body {
              overflow: visible !important;
            }

            .print-page {
              display: flex !important;
              flex-direction: column !important;
              width: 18cm !important;
              height: 7cm !important;
              min-height: 7cm !important;
              max-height: 7cm !important;
              min-width: 18cm !important;
              max-width: 18cm !important;
              box-sizing: border-box !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #fff !important;
              position: relative !important;
              overflow: hidden !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .print-page > .border-2 {
              display: flex !important;
              flex-direction: column !important;
              flex: 1 !important;
              width: 18cm !important;
              height: 7cm !important;
              min-height: 7cm !important;
              max-height: 7cm !important;
              min-width: 18cm !important;
              max-width: 18cm !important;
              box-sizing: border-box !important;
              margin: 0 !important;
              padding: 2mm !important;
              transform: none !important;
              transform-origin: top left !important;
              overflow: hidden !important;
              border: 1px solid #000 !important;
            }

            .print-page:first-child {
              width: 18cm !important;
              height: 7cm !important;
              min-height: 7cm !important;
              max-height: 7cm !important;
              min-width: 18cm !important;
              max-width: 18cm !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }

            .print-page:first-child > .border-2 {
              display: flex !important;
              flex-direction: column !important;
              flex: 1 !important;
              width: 18cm !important;
              height: 7cm !important;
              min-height: 7cm !important;
              max-height: 7cm !important;
              min-width: 18cm !important;
              max-width: 18cm !important;
              box-sizing: border-box !important;
              padding: 1.5mm !important;
              margin: 0 !important;
              border: 1px solid #000 !important;
              overflow: hidden !important;
              transform: none !important;
            }

            .print-page:first-child .grid.grid-cols-12.border-b {
              padding-bottom: 1mm !important;
              margin-bottom: 1mm !important;
            }

            .print-page:first-child .text-\[10px\] {
              font-size: 5.5px !important; 
              line-height: 1.1 !important;
            }

            .print-page:first-child .text-\[9px\] {
              font-size: 5px !important; 
              line-height: 1.1 !important;
            }

            .print-page:first-child > .border-2 > .grid:first-child {
              font-size: 5.5px !important;
              line-height: 1.1 !important;
            }

            .print-page:first-child h1 {
              font-size: 9px !important; 
              line-height: 1.1 !important;
            }

            .print-page:first-child h2 {
              font-size: 6px !important; 
              line-height: 1.1 !important;
            }

            .print-page:first-child h3 {
              font-size: 6px !important; 
              line-height: 1.1 !important;
            }

            .print-page:first-child .text-gray-600 {
              font-size: 5.5px !important;
              line-height: 1.1 !important;
            }

            .print-page:first-child span.text-\[\#0000FF\] {
              font-size: 5.5px !important;
              line-height: 1.1 !important;
            }

            .print-page:first-child .text-sm {
              font-size: 8px !important; 
            }

            .print-page:first-child .text-xs {
              font-size: 7px !important; 
            }

            .print-page:first-child .text-\[9px\].text-\[\#0000FF\] {
              font-size: 7px !important;
            }

            .print-page:first-child .border-black.p-1 {
              padding: 1px 2px !important;
            }

            .print-page:first-child .min-h-3 {
              min-height: 0 !important;
            }

            .print-page:first-child .min-h-5\\.75 {
              min-height: 0 !important;
            }

            .print-page:first-child .min-h-15 {
              min-height: 0 !important;
            }

            .print-page:first-child p {
              margin-top: 0 !important;
              margin-bottom: 0 !important;
              line-height: 1.1 !important;
            }

            .print-page:first-child .mt-1 {
              margin-top: 1px !important;
            }

            .print-page:first-child .mt-0\\.5 {
              margin-top: 1px !important;
            }

            .print-page:first-child .mt-2 {
              margin-top: 2px !important;
            }

            .print-page:first-child .mb-1 {
              margin-bottom: 1px !important;
            }

            .print-page:first-child .ml-1 {
              margin-left: 2px !important;
            }

            .print-page:first-child .p-0\\.5 {
              padding: 0.5px !important;
            }

            .print-page:first-child [class*="text-\[\#0000FF\]"] {
              font-size: 10px !important;
              line-height: 1.1 !important;
            }

            .print-page:first-child img {
              max-height: 20px !important; 
            }

            .print-page:first-child .py-1 {
              padding-top: 1px !important;
              padding-bottom: 1px !important;
            }

            .print-page:last-child {
              width: 18cm !important;
              height: 7cm !important;
              min-height: 7cm !important;
              max-height: 7cm !important;
              min-width: 18cm !important;
              max-width: 18cm !important;
              box-sizing: border-box !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #fff !important;
              position: relative !important;
              overflow: hidden !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .print-page:last-child > .border-2 {
              display: flex !important;
              flex-direction: column !important;
              flex: 1 !important;
              width: 18cm !important;
              height: 7cm !important;
              min-height: 7cm !important;
              max-height: 7cm !important;
              min-width: 18cm !important;
              max-width: 18cm !important;
              box-sizing: border-box !important;
              margin: 0 !important;
              padding: 2mm !important;
              border: 1px solid #000 !important;
              overflow: hidden !important;
              transform: none !important;
            }

            .print-page:first-child {
              page-break-after: always !important;
              break-after: page !important;
            }

            .print-page + .print-page {
              page-break-before: always !important;
              break-before: page !important;
            }

            .print-page:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }

            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            @media screen {
              body {
                background: #ddd !important;
              }

              .print-page {
                margin: 10px auto !important;
                box-shadow: 0 0 8px rgba(0, 0, 0, 0.25);
              }
            }

            @media print {
              html,
              body {
                width: 100% !important;
                min-width: 0 !important;
                max-width: none !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
                overflow: visible !important;
              }

              .print-page {
                display: flex !important;
                flex-direction: column !important;
                width: 18cm !important;
                height: 7cm !important;
                min-height: 7cm !important;
                max-height: 7cm !important;
                min-width: 18cm !important;
                max-width: 18cm !important;
                margin: 0 auto !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                background: #fff !important;
                position: relative !important;
                overflow: hidden !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }

              .print-page > .border-2 {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 !important;
                width: 18cm !important;
                height: 7cm !important;
                min-height: 7cm !important;
                max-height: 7cm !important;
                min-width: 18cm !important;
                max-width: 18cm !important;
                box-sizing: border-box !important;
                margin: 0 !important;
                padding: 2mm !important;
                transform: none !important;
                transform-origin: top left !important;
                overflow: hidden !important;
                border: 1px solid #000 !important;
              }
            }

            .print-page:first-child .print-name-value {
              font-size: 11px !important;
              line-height: 1.2 !important;
              color: #0000FF !important;
              display: block !important;
            }

            .print-page:first-child .print-ministry {
              font-size: 9px !important;
              line-height: 1.1 !important;
            }

            .print-page:first-child .print-designation-label {
              font-size: 8px !important;
              line-height: 1.3 !important;
            }

            .print-page:first-child .print-designation-labels { 
              font-size: 7px !important;
              line-height: 1.3 !important;
            }

            .print-page:first-child .print-date-header {
              font-size: 7px !important;
              line-height: 1.1 !important;
            }

            .print-page:first-child .print-date-value {
              font-size: 7px !important;
            }

            .print-page:last-child .print-acting-officer-value {
              font-size: 11px !important;
            }

            .print-page:first-child .print-reason-value {
              padding: 4px !important;
              font-size: 10px !important;
            }

            .print-page:last-child .print-back-sinhala {
              font-size: 8px !important;
              line-height: 1.1 !important;
            }

            .print-page:last-child .print-back-tamil {
              font-size: 8px !important;
              line-height: 1.1 !important;
            }

            .print-page:last-child .print-sinhala-tamil-english {
              font-size: 8px !important;
              line-height: 1.1 !important;
            }

            .print-signature-box {
              justify-content: flex-start !important;
            }

            .print-signature-img {
              margin-top: 2px !important;
              margin-bottom: 2px !important;
            }

            .print-signature-label {
              margin-top: 2px !important;
            }

            .print-page:last-child .print-acting-space {
              line-height: 1.5 !important;
            }

            .print-page:last-child .print-admin-recommendation {
              font-size: 8px !important;
              line-height: 1 !important;
            }

            .print-page:last-child .print-admin-recommendation p {
              margin-top: 1px !important;
              margin-bottom: 0 !important;
            }

            .print-page:first-child .print-headers{
            font-size: 10px !important;

            }
            .print-page:first-child .print-header-tamil{
            font-size: 9px !important;
            }


          </style>
        </head>

        <body>
          ${page1}${page2}
        </body>
      </html>
    `);

    doc.close();

    const doPrint = async () => {
      try {
        if (
          iframe.contentWindow.document.fonts &&
          iframe.contentWindow.document.fonts.ready
        ) {
          await iframe.contentWindow.document.fonts.ready;
        }
      } catch (e) {}

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();

        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    };

    doPrint();
  };

  const splitDate = (dateStr) => {
    if (!dateStr) {
      return { y: '', m: '', d: '' };
    }

    const str = String(dateStr).trim();
    const parts = str.split(/[-/.]/);

    if (parts.length === 3 && parts[0].length === 4) {
      return {
        y: parts[0],
        m: parts[1].padStart(2, '0'),
        d: parts[2].padStart(2, '0'),
      };
    }

    const dateObj = new Date(str);

    if (!isNaN(dateObj)) {
      return {
        y: dateObj.getFullYear(),
        m: String(dateObj.getMonth() + 1).padStart(2, '0'),
        d: String(dateObj.getDate()).padStart(2, '0'),
      };
    }

    return { y: '', m: '', d: '' };
  };

  const firstAppointment = splitDate(selectedLeave?.firstAppointmentDate);
  const commencingLeave = splitDate(selectedLeave?.from);
  const resumingDuties = splitDate(selectedLeave?.to);

  const leaveDays =
    selectedLeave?.noOfDays ||
    selectedLeave?.days ||
    '';

  const leaveType = selectedLeave?.type || '';

  const casualDays =
    leaveType === 'Casual' || leaveType === 'Half-day'
      ? leaveDays
      : '—';

  const vacationDays =
    leaveType === 'Annual'
      ? leaveDays
      : '—';

  const otherDays =
    leaveType === 'Other'
      ? leaveDays
      : '—';

  const status = selectedLeave?.status || '';
  const declinedBy = selectedLeave?.declinedBy || '';

  const isActingConfirmed =
    selectedLeave?.actingOfficerConfirmed === true ||
    selectedLeave?.acting_officer_confirmed === true ||
    selectedLeave?.actingOfficerConfirmed === 1 ||
    selectedLeave?.acting_officer_confirmed === 1 ||
    status === "Pending" ||
    status === "Admin Approved" ||
    status === "Approved" ||
    (status === "Declined" && declinedBy === "Acting Officer");

  let adminDecision = "pending";

  if (
    status === "Admin Approved" ||
    status === "Approved" ||
    (status === "Declined" && declinedBy === "HOD")
  ) {
    adminDecision = "recommended";
  } else if (
    status === "Declined" &&
    (declinedBy === "Admin" || !declinedBy)
  ) {
    adminDecision = "not_recommended";
  }

  let hodDecision = "pending";

  if (status === "Approved") {
    hodDecision = "allowed";
  } else if (status === "Declined" && declinedBy === "HOD") {
    hodDecision = "not_allowed";
  }

  const applicantSignature = getSignature(selectedLeave?.employee);
  const actingOfficerSignature = getSignature(selectedLeave?.actingOfficer);

  const adminSignature =
    adminDecision !== "pending"
      ? getSignature(selectedLeave?.adminName || "admin")
      : null;
  const hodSignature =
    hodDecision !== "pending"
      ? getSignature(selectedLeave?.hodName || "hod")
      : null;

  const SignatureImg = ({
    src,
    name = "",
    isSigned = false,
    date = "",
    className = ""
  }) => {
    if (src && isSigned) {
      return (
        <div className={`flex flex-col items-center justify-center ${className}`}>
          <img
            src={src}
            alt="signature"
            className="h-6 w-auto object-contain mix-blend-multiply"
          />
          {date && (
            <span className="text-[6px] text-gray-600 font-mono mt-0.5">
              {date}
            </span>
          )}
        </div>
      );
    }

    if (isSigned) {
      return (
        <div className={`flex flex-col items-center justify-center py-1 ${className}`}>
          <span className="font-serif italic font-bold text-xs tracking-wider text-blue-900 select-none">
            {name ? `~ ${name.split(" ")[0]} ~` : "Signed"}
          </span>
          {date && (
            <span className="text-[6px] text-gray-700 font-mono mt-0.5">
              {date}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className={`border-b border-dashed border-gray-400 min-h-4 flex items-center justify-center text-[6px] text-gray-400 italic ${className}`}>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
        <div
          id="leave-print-area"
          className="text-black bg-white font-sans text-xs select-none"
        >
          <div className="print-page print-form">
            <div className="border-2 border-black p-2 flex flex-col flex-1">
              <div className="grid grid-cols-12 border-b border-black pb-1.5 mb-1.5 items-start">
                <div className="col-span-3 text-[10px] leading-tight">
                  <p className="font-bold">නම / பெயர் / Name</p>
                  <p className="font-bold mt-1">පොදු 125 අ/அ/a.</p>
                  <p className="font-bold">Gen. 125</p>
                  <p className="text-[9px] text-gray-600 mt-0.5">
                    (G 8* S., T. & E.) 04/76
                  </p>
                </div>

                <div className="col-span-6 text-center">
                  <h1 className="text-base font-bold tracking-wide print-headers">
                    නිවාඩු ඉල්ලුම් පත්‍රය
                  </h1>
                  <h2 className="text-sm font-bold print-header-tamil">லீவு விண்ணப்பம்</h2>
                  <h3 className="text-xs font-bold uppercase tracking-widest print-header-tamil">
                    APPLICATION FOR LEAVE
                  </h3>
                </div>

                <div className="col-span-3 text-right text-[9px] leading-tight font-semibold">
                  <p>ආයතන සංග්‍රහය, පරි. XII, 2 : 1</p>
                  <p>தாபனவிதிக்கோவை அத். XII, 2 : 1</p>
                  <p>Ch. XII 2:1, Establishments Code</p>
                </div>
              </div>

              <div className="border border-black flex flex-col flex-1">
                <div className="grid grid-cols-12 border-b border-black">
                  <div className="col-span-6 border-r border-black">
                    <div className="border-b border-black p-1 min-h-3 flex flex-col justify-between">
                      <p className="font-bold text-[10px] print-designation-label">
                        නම / பெயர் / Name:
                      </p>
                      <p className="font-semibold text-sm text-[#0000FF] pl-2 print-name-value">
                        {selectedLeave?.employee || '—'}
                      </p>
                    </div>

                    <div className="border-b border-black p-1 min-h-3 flex flex-col justify-between">
                      <p className="font-bold text-[10px] print-designation-label">
                        තනතුර / பதவி / Designation:
                      </p>
                      <p className="font-semibold text-s text-[#0000FF] pl-2">
                        {selectedLeave?.designation || 'Officer'}
                      </p>
                    </div>

                    <div className="p-1 min-h-3 flex flex-col justify-between">
                      <p className="font-bold text-[10px] print-designation-label">
                        අමාත්‍යාංශය/දෙපා. / அமைச்சு/திணைக்களம் / Ministry/Dept:
                      </p>
                      <span className="text-gray-600 print-ministry">
                        Ministry of Fisheries, Aquatic and Ocean Resources
                      </span>
                      {(selectedLeave?.division || currentUser?.division) && (
                        <span className="text-[#0000FF]">
                          {` - ${selectedLeave?.division || currentUser?.division} Division`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="col-span-6 grid grid-cols-12">
                    <div className="col-span-9 border-r border-black">
                      <div className="border-b border-black p-1 min-h-5.75 flex flex-col justify-end">
                        <p className="font-bold text-[10px] print-designation-label">
                          මුල් පත්වීමේ දිනය
                        </p>
                        <p className="text-[9px] print-designation-labels">
                          முதல் நியமனத் திகதி / Date of First Appointment
                        </p>
                        <p className="font-medium text-xs text-[#0000FF] pl-2">
                          {selectedLeave?.firstAppointmentDate || '—'}
                        </p>
                      </div>

                      <div className="border-b border-black p-1 min-h-3 flex flex-col justify-between">
                        <p className="font-bold text-[10px] print-designation-label">
                          නිවාඩු පටන් ගන්නා දිනය
                        </p>
                        <p className="text-[9px] print-designation-labels">
                          லீவு தொடங்கும் திகதி / Date of commencing leave
                        </p>
                      </div>

                      <div className="p-1 min-h-2 flex flex-col justify-between">
                        <p className="font-bold text-[10px] print-designation-label">
                          නැවත සේවයට පැමිණෙන දිනය
                        </p>
                        <p className="text-[9px] print-designation-labels">
                          கடமை மேற்கொள்ளும் திகதி / Date of resuming duties
                        </p>
                      </div>
                    </div>

                    <div className="col-span-3 flex flex-col">
                      <div className="grid grid-cols-3 text-center font-bold text-[8px] print-date-header border-b border-black bg-gray-50 py-1">
                        <div className="border-r border-black">ව<br />ஆ<br />Y.</div>
                        <div className="border-r border-black">මා<br />மா<br />M.</div>
                        <div>දි<br />தி<br />D.</div>
                      </div>

                      <div className="grid grid-cols-3 text-center border-b border-black flex-1 items-center">
                        <div className="border-r border-black h-full flex items-center justify-center print-date-value text-[9px] text-[#0000FF] font-semibold">
                          {firstAppointment.y}
                        </div>
                        <div className="border-r border-black h-full flex items-center justify-center text-[9px] text-[#0000FF] font-semibold">
                          {firstAppointment.m}
                        </div>
                        <div className="h-full flex items-center justify-center text-[9px] text-[#0000FF] font-semibold">
                          {firstAppointment.d}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 text-center border-b border-black flex-1 items-center">
                        <div className="border-r border-black h-full flex print-date-value items-center justify-center text-[9px] text-[#0000FF] font-semibold">
                          {commencingLeave.y}
                        </div>
                        <div className="border-r border-black h-full flex print-date-value items-center justify-center text-[9px] text-[#0000FF] font-semibold">
                          {commencingLeave.m}
                        </div>
                        <div className="h-full flex items-center print-date-value justify-center text-[9px] text-[#0000FF] font-semibold">
                          {commencingLeave.d}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 text-center flex-1 items-center">
                        <div className="border-r border-black h-full flex print-date-value items-center justify-center text-[9px] text-[#0000FF] font-semibold">
                          {resumingDuties.y}
                        </div>
                        <div className="border-r border-black h-full flex print-date-value items-center justify-center text-[9px] text-[#0000FF] font-semibold">
                          {resumingDuties.m}
                        </div>
                        <div className="h-full flex items-center print-date-value justify-center text-[9px] text-[#0000FF] font-semibold">
                          {resumingDuties.d}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-12 flex-1">
                  <div className="col-span-6 border-r border-black flex flex-col">
                    <div className="border-b border-black grid grid-cols-12 items-stretch flex-1">
                      <div className="col-span-8 p-1 flex items-center border-r border-black h-full">
                        <p className="font-semibold text-[10px] leading-tight print-designation-label">
                          නිවාඩු ඉල්ලා සිටින දින ගණන<br />
                          லீவு கோரும் நாட்கள்<br />
                          Number of days leave applied for
                        </p>
                      </div>
                      <div className="col-span-4 grid grid-cols-3 text-center h-full">
                        <div className="border-r border-b border-black text-[8px] font-bold bg-gray-50 py-0.5 flex items-center justify-center">අ/அ/C</div>
                        <div className="border-r border-b border-black text-[8px] font-bold bg-gray-50 py-0.5 flex items-center justify-center">වි/ஒ/V</div>
                        <div className="border-b border-black text-[8px] font-bold bg-gray-50 py-0.5 flex items-center justify-center">වෙ/எ/O</div>

                        <div className="border-r border-black text-xs font-semibold text-[#0000FF] py-1 flex items-center justify-center h-full">{casualDays}</div>
                        <div className="border-r border-black text-xs font-semibold text-[#0000FF] py-1 flex items-center justify-center h-full">{vacationDays}</div>
                        <div className="text-xs font-semibold text-[#0000FF] py-1 flex items-center justify-center h-full">{otherDays}</div>
                      </div>
                    </div>

                    <div className="border-b border-black grid grid-cols-12 items-stretch flex-1">
                      <div className="col-span-8 p-1 flex items-center border-r border-black h-full">
                        <p className="font-semibold text-[10px] leading-tight print-designation-label">
                          පවත්නා වර්ෂයේ දී ගත් නිවාඩු<br />
                          நடப்பு ஆண்டில் எடுத்துள்ள லீவு<br />
                          Leave taken in current year
                        </p>
                      </div>
                      <div className="col-span-4 grid grid-cols-3 text-center h-full">
                        <div className="border-r border-b border-black text-[8px] font-bold bg-gray-50 py-0.5 flex items-center justify-center">අ/அ/C</div>
                        <div className="border-r border-b border-black text-[8px] font-bold bg-gray-50 py-0.5 flex items-center justify-center">වි/ஒ/V</div>
                        <div className="border-b border-black text-[8px] font-bold bg-gray-50 py-0.5 flex items-center justify-center">වෙ/எ/O</div>

                        <div className="border-r border-black text-xs font-semibold text-[#0000FF] py-1 flex items-center justify-center h-full">
                          {takenCasual > 0 ? takenCasual : '—'}
                        </div>
                        <div className="border-r border-black text-xs font-semibold text-[#0000FF] py-1 flex items-center justify-center h-full">
                          {takenVacation > 0 ? takenVacation : '—'}
                        </div>
                        <div className="text-xs font-semibold text-[#0000FF] py-1 flex items-center justify-center h-full">
                          {takenOther > 0 ? takenOther : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="p-1 flex items-center h-full">
                      <p className="font-semibold text-[9px] leading-tight print-designation-label">
                        දිනය/திகதி/Date: {selectedLeave?.appliedOn}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-6 flex flex-col">
                    <div className="p-1 border-b border-black flex-1">
                      <p className="font-semibold text-[10px] leading-tight print-designation-label">
                        නිවාඩු ඉල්ලීමට හේතුව/ லீவுக்கான காரணம்/ Reasons for leave
                      </p>
                      <p className="font-medium text-xs text-[#0000FF] pl-2 mt-1 print-reason-value">
                        {selectedLeave?.reason || '—'}
                      </p>
                    </div>

                    <div className="p-1 flex flex-col justify-between flex-1">
                      <p className="font-semibold text-[10px] leading-tight print-designation-label">
                        අයදුම්කරුගේ අත්සන/ விண்ணப்பக் காரரின் ஒப்பம்/ Signature of Applicant
                      </p>
                      <p className="text-[9px]"></p>

                      <div className="mt-1">
                        <SignatureImg
                          src={applicantSignature}
                          name={selectedLeave?.employee}
                          isSigned={true}
                          date={selectedLeave?.appliedOn}
                          className="w-3/4 self-end"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="print-page print-form">
            <div className="border-2 border-black p-2 flex flex-col flex-1">
              <div className="border border-black flex flex-col flex-1">
                <div className="grid grid-cols-12 border-b border-black flex-1">
                  <div className="col-span-4 border-r border-black p-0.5 flex flex-col justify-between print-acting-space">
                    <div className="text-[10px] leading-tight">
                      <p className="print-back-sinhala font-bold">
                        ඉල්ලුම්කරු වෙනුවට වැඩ කිරීමට එකඟ වෙමි.
                      </p>
                      <p className="text-[9px] print-back-tamil">
                        விண்ணப்பக்காரருக்காகப் பதிற் கடமையாற்றச் சம்மதிக்கின்றேன்.
                      </p>
                      <p className="font-bold italic">
                        I agree to act for the applicant.
                      </p>
                    </div>
                    <p className="font-semibold text-[#0000FF] text-s mt-0.5 print-acting-officer-value">
                      {selectedLeave?.actingOfficer || '—'}
                    </p>
                  </div>

                  <div className="col-span-2 border-r border-black p-0.5 text-center flex flex-col justify-between print-signature-box">
                    <div className="mt-0.5 print-signature-img">
                      <SignatureImg 
                        src={actingOfficerSignature} 
                        name={selectedLeave?.actingOfficer}
                        isSigned={isActingConfirmed}
                        date={
                          isActingConfirmed
                            ? (selectedLeave?.appliedOn || "")
                            : ""
                        }
                        className="w-full"
                      />
                    </div>

                    <div className="pt-0.5 text-[9px] font-bold print-sinhala-tamil-english leading-tight print-signature-label">
                      <div className="border-black w-full mb-0.5"></div>
                      <p>වැඩබලන නිලධාරී</p>
                      <p>பதிற் கடமையாற்றி</p>
                      <p>Acting Officer</p>
                    </div>
                  </div>

                  <div className="col-span-3 border-r border-black p-0.5 flex flex-col justify-between print-acting-space">
                    <div className="text-[10px] leading-tight print-admin-recommendation">
                      <p className="font-bold">
                        <span className={hodDecision === "not_allowed" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                          නිවාඩු අනුමත කරනු ලැබේ.
                        </span>
                        {" / "}
                        <span className={hodDecision === "allowed" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                          අනුමත කරනු නොලැබේ.
                        </span>
                      </p>

                      <p className="mt-0.5">
                        <span className={hodDecision === "not_allowed" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                          லீவு அனுமதிக்கப்பட்டுள்ளது
                        </span>
                        {" / "}
                        <span className={hodDecision === "allowed" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                          அனுமதிக்கப்படவில்லை.
                        </span>
                      </p>

                      <p className="font-bold mt-0.5">
                        <span className={hodDecision === "not_allowed" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                          Leave allowed
                        </span>
                        {" / "}
                        <span className={hodDecision === "allowed" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                          Not allowed.
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="col-span-3 p-0.5 text-center flex flex-col justify-end">
                    <SignatureImg
                      src={hodSignature}
                      name="Head of Dept"
                      isSigned={hodDecision !== "pending"}
                      date={hodDecision !== "pending" ? new Date().toISOString().split("T")[0] : ""}
                      className="w-full mb-0.5"
                    />

                    <div className="text-[9px] font-bold leading-tight print-sinhala-tamil-english print-signature-label">
                      <p>දෙපාර්තමේන්තු ප්‍රධානියා</p>
                      <p>திணைக்களத் தலைவர்</p>
                      <p>Head of Department</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-12 flex-1">
                  <div className="col-span-4 border-r border-black flex flex-col">
                    <div className="p-0.5 flex flex-col justify-center flex-1">
                      <div className="text-[10px] leading-tight print-admin-recommendation">
                        <p className="font-bold">
                          <span className={adminDecision === "not_recommended" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                            නිර්දේශ කරමි
                          </span>
                          {" / "}
                          <span className={adminDecision === "recommended" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                            නොකරමි
                          </span>
                        </p>

                        <p className="mt-0.5">
                          <span className={adminDecision === "not_recommended" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                            சிபாரிசு செய்யப்படுகிறது
                          </span>
                          {" / "}
                          <span className={adminDecision === "recommended" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                            செய்யப்படவில்லை
                          </span>
                        </p>

                        <p className="font-bold mt-0.5">
                          <span className={adminDecision === "not_recommended" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                            Recommended
                          </span>
                          {" / "}
                          <span className={adminDecision === "recommended" ? "line-through decoration-2 decoration-black text-gray-400" : ""}>
                            Not recommended.
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-black grid grid-cols-2 flex-1">
                      <div className="p-0.5 flex flex-col justify-center border-r border-black">
                        <div className="text-[10px] leading-tight print-admin-recommendation">
                          <p className="font-bold">නිවාඩු කාලයේදී ලිපිනය</p>
                          <p>லீவுக்காலத்து முகவரி</p>
                          <p className="font-bold">Address when on leave</p>
                        </div>
                      </div>

                      <div className="p-0.5 flex items-center justify-center">
                        <p className="font-semibold text-xs text-[#0000FF]">
                          {selectedLeave?.address || '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 border-r border-black p-0.5 text-center flex flex-col justify-end">
                    <SignatureImg
                      src={adminSignature}
                      name="Supervising Officer"
                      isSigned={adminDecision !== "pending"}
                      date={adminDecision !== "pending" ? (selectedLeave?.appliedOn || "") : ""}
                      className="w-full mb-0.5"
                    />

                    <div className="text-[9px] font-bold leading-tight print-admin-recommendation">
                      <p>අධීක්ෂණ නිලධාරී</p>
                      <p>மேற்பார்வை உத்தியோகத்தர்</p>
                      <p>Supervising Officer</p>
                    </div>
                  </div>

                  <div className="col-span-6 flex flex-col">
                    <div className="grid grid-cols-2 border-b border-black flex-1">
                      <div className="p-0.5 text-[10px] leading-tight border-r border-black print-admin-recommendation">
                        <p className="font-bold">සටහන් කරගෙන ආපසු එවීමි</p>
                        <p>குறித்துக் கொண்டு அனுப்பப்பட்டது.</p>
                        <p className="font-bold">Noted and returned.</p>
                      </div>

                      <div className="p-1 text-center flex flex-col justify-center">
                        {hodDecision === "allowed" ? (
                          <SignatureImg
                            src={applicantSignature}
                            name={selectedLeave?.employee}
                            isSigned={true}
                            date={selectedLeave?.approvedOn || new Date().toISOString().split("T")[0]}
                            className="w-full mb-0.5"
                          />
                        ) : hodDecision === "not_allowed" ? (
                          <div className="border-b border-dashed border-black min-h-4 flex items-center justify-center text-[6px] text-red-600 italic">
                          
                          </div>
                        ) : (
                          <div className="border-b border-dashed border-gray-400 min-h-4 flex items-center justify-center text-[6px] text-gray-400 italic">
                          </div>
                        )}

                        <p className="text-[9px] font-bold mt-0.5 print-sinhala-tamil-english leading-tight print-signature-label">
                          ඉල්ලුම්කරු / விண்ணப்பக்காரர் / Applicant
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 flex-1">
                      <div className="p-0.5 text-[10px] leading-tight border-r border-black print-admin-recommendation">
                        <p className="font-bold">නිවාඩු ලේඛනයේ සටහන් කරන ලදී.</p>
                        <p>லீவு இராப்பில் பதியப்பட்டது.</p>
                        <p className="font-bold">Noted in Leave Register.</p>

                        <div className="flex items-center justify-between border-t border-black pt-0.5 mt-0.5 text-[9px] font-bold print-admin-recommendation">
                          <span>පිටු අංකය / தாள் மடி இல. / Folio No.</span>
                          <div className="border border-black w-8 h-4"></div>
                        </div>
                      </div>

                      <div className="p-1 text-center flex flex-col justify-center">
                        <div className="border-b border-dashed border-black mb-0.5 pt-2 print-admin-recommendation">
                        </div>

                        <p className="text-[9px] font-bold print-admin-recommendation">
                          නිවාඩු ලිපිකරු / லீவு எழுதுனர் / Leave Clerk
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col sm:flex-row gap-3 justify-end border-t border-gray-100 pt-4">
          <button
            onClick={() => {
              setShowPrintModal(false);
              if (setSelectedLeave) {
                setSelectedLeave(null);
              }
            }}
            className="w-full sm:w-auto px-6 py-2.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors text-black"
          >
            Close
          </button>

          <button
            onClick={handlePrint}
            className="w-full sm:w-auto px-6 py-2.5 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
          >
            <Printer size={16} className="inline-block mr-2" />
            Print Form
          </button>
        </div>
      </div>
    </div>
  );
}