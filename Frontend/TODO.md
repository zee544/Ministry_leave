# TODO

## Task: Separate HOD Settings Page

### Goal
Create a dedicated settings page for the HOD dashboard instead of sharing the Admin settings page.

### Plan Steps
- [x] Analyze shared Settings page and HOD dashboard usage
- [x] Create `src/HOD/HODSettings.jsx` — dedicated HOD settings (notification prefs, HOD signature, division preferences)
- [x] Update `src/HOD/hoddashboard.jsx` to import new HODSettings from `src/HOD/` instead of `src/Admin/Settings.jsx`
- [x] Run build / lint to confirm no errors (build passes, 57 modules)

### Follow-up
- Test HOD settings page in dev server

---

## Task: Acting Officer Confirmation Step in Leave Approval Workflow

### Goal
Add an "Acting Officer Confirmation" step before a leave request is sent to the admin. When a user is assigned as someone's acting officer, they must approve (or decline) the request before the admin is notified.

### Approved Workflow
1. Employee submits leave → status `"Pending Acting Officer"` → only acting officer + applicant notified (no admin notification yet).
2. Acting Officer reviews in new "Acting Approvals" section:
   - **Approve** → status `"Pending"`, admin + applicant notified.
   - **Decline** → status `"Declined"`, applicant notified.
3. Admin pre-approves (`"Admin Approved"`) → HOD final approves (`"Approved"`).

### Plan Steps
- [x] Analyze current leave approval flow (applyleave, LeaveContext, DataTable, userDashboard, headers, admin/HOD views)
- [x] `src/hooks/LeaveContext.jsx` — accept optional status in `addLeave`; add `getLeavesByActingOfficer`; update sample data (unconfirmed leaves + leaves where Nancy Moraa is acting officer)
- [x] `src/User/applyleave.jsx` — submit with `"Pending Acting Officer"` status; remove immediate admin notification; notify only acting officer + applicant; update messages/toast
- [x] `src/Components/DataTable.jsx` — add default badge style for `"Pending Acting Officer"` status
- [x] `src/User/ActingApprovals.jsx` (new) — section listing leaves where current user is acting officer with Approve/Decline buttons + history of handled assignments
- [x] `src/Components/usersidebar.jsx` — add "Acting Approvals" tab
- [x] `src/Components/userHeader.jsx` — add page title for new tab
- [x] `src/User/userDashboard.jsx` — wire new tab; add stat; update dashboard acting-officer card with count + Review link
- [x] `src/User/myleaves.jsx` — allow edit/cancel for `"Pending Acting Officer"` status
- [x] Verify admin/HOD views handle the new status correctly (admin actions filter on `"Pending"`, HOD on `"Admin Approved"`, new status renders amber badge)
- [x] Run dev server / lint to confirm no errors (build passes; lint shows only pre-existing issues plus removed unused var)

### Follow-up
- Run dev server (`npm run dev`) and test end-to-end flow

