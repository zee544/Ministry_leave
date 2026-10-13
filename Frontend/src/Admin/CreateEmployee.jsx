import { useState } from "react";
import { useUser, MINISTRY_DIVISIONS } from "../hooks/UserContext.jsx";


const Field = ({ label, htmlFor, error, hint, showCheck, isValid, children }) => (
    <div>
        <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 dark:text-white mb-1.5">
            {label}
        </label>
        <div className="relative">
            {children}
            {showCheck && isValid && !error && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-green-500">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </span>
            )}
        </div>
        {error ? (
            <p className="mt-1.5 text-xs text-red-500">{error}</p>
        ) : hint ? (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
        ) : null}
    </div>
);

function CreateEmployee({ onCancel }) {
    const { addEmployee, currentUser } = useUser();
    const [formdata, setformdata] = useState({
        name: '',
        designation: '',
        division: currentUser?.division || '',
        email: '',
        appointment_date: '',
        password: 'Ministry@123',
    });
    const [errors, seterrors] = useState({});
    const [isSubmitting, setisSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setformdata((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) seterrors((prev) => ({ ...prev, [name]: '' }));
    };

    const validateForm = () => {
        let tempErrors = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!formdata.name) tempErrors.name = 'Name is required';
        if (!formdata.designation) tempErrors.designation = 'Designation is required';
        if (!formdata.division) tempErrors.division = 'Division is required';
        if (!formdata.appointment_date) tempErrors.appointment_date = 'Appointment date is required';

        if (!formdata.email) tempErrors.email = 'Email is required';
        else if (!emailRegex.test(formdata.email)) tempErrors.email = 'Enter a valid email address';

        if (!formdata.password || formdata.password.length < 6)
            tempErrors.password = 'Password must be at least 6 characters';

        seterrors(tempErrors);
        return Object.keys(tempErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setisSubmitting(true);
        try {
            if (addEmployee) await addEmployee(formdata);
            await new Promise((r) => setTimeout(r, 500));

            setShowSuccess(true);

            setformdata({
                name: '',
                designation: '',
                division: currentUser?.division || '',
                email: '',
                appointment_date: '',
                password: 'Ministry@123',
            });
            seterrors({});
        } catch (err) {
            console.error('Registration failed:', err);
        } finally {
            setisSubmitting(false);
        }
    };

    const isFieldValid = (field) => {
        const value = formdata[field];
        if (!value) return false;
        if (field === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        if (field === 'password') return value.length >= 6;
        return true;
    };

    const inputBase =
        "w-full rounded-md border bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none transition focus:ring-2";

    const inputState = (field) => {
        if (errors[field]) return "border-red-500 focus:border-red-500 focus:ring-red-500/20";
        if (isFieldValid(field)) return "border-green-500 dark:border-green-500 focus:border-green-500 focus:ring-green-500/20";
        return "border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500/20";
    };

    return (
        <div className="mx-auto w-full max-w-2xl">
            {showSuccess && (
                <div
                    onClick={() => setShowSuccess(false)}
                    className="fixed inset-0 z-[9999] flex items-center justify-center px-4
                               bg-gray-900/60 dark:bg-black/70 backdrop-blur-sm"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm rounded-2xl p-7 text-center
                                   bg-white dark:bg-gray-800
                                   border border-gray-200 dark:border-gray-700
                                   shadow-2xl shadow-gray-900/20 dark:shadow-black/60
                                   animate-[fadeIn_0.25s_ease-out]"
                    >
                        {/* Animated check circle */}
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full
                                        bg-green-100 dark:bg-green-500/15
                                        ring-8 ring-green-50 dark:ring-green-500/5">
                            <svg
                                className="h-9 w-9 text-green-600 dark:text-green-400"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>

                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                            Registration Successful!
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                            New employee has been added to the system successfully.
                        </p>

                        <button
                            type="button"
                            onClick={() => setShowSuccess(false)}
                            className="mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-semibold
                                       text-white bg-blue-600 hover:bg-blue-700
                                       dark:bg-blue-600 dark:hover:bg-blue-500
                                       transition-colors duration-150
                                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                       dark:focus:ring-offset-gray-800"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            <div className="mb-6 text-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">New Employee</h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    Add a new employee to the system.
                </p>
            </div>

            <form
                onSubmit={handleSubmit}
                autoComplete="off"
                className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
            >
                <div className="space-y-5">
                    <Field
                        label="Full Name"
                        htmlFor="name"
                        error={errors.name}
                        showCheck
                        isValid={isFieldValid("name")}
                    >
                        <input
                            id="name"
                            name="name"
                            type="text"
                            value={formdata.name}
                            onChange={handleChange}
                            placeholder="e.g. S. Perera"
                            autoComplete="off"
                            className={`${inputBase} ${inputState("name")} ${isFieldValid("name") ? "pr-10" : ""}`}
                        />
                    </Field>

                    <Field
                        label="Designation"
                        htmlFor="designation"
                        error={errors.designation}
                        showCheck
                        isValid={isFieldValid("designation")}
                    >
                        <input
                            id="designation"
                            name="designation"
                            type="text"
                            value={formdata.designation}
                            onChange={handleChange}
                            placeholder="e.g. Senior Officer"
                            autoComplete="off"
                            className={`${inputBase} ${inputState("designation")} ${isFieldValid("designation") ? "pr-10" : ""}`}
                        />
                    </Field>

                    <Field label="Division" htmlFor="division" error={errors.division}>
                        <select
                            id="division"
                            name="division"
                            value={formdata.division}
                            onChange={handleChange}
                            className={`${inputBase} ${inputState("division")}`}
                        >
                            <option value="">Select division</option>
                            {MINISTRY_DIVISIONS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </Field>

                    <Field
                        label="Date of First Appointment"
                        htmlFor="appointment_date"
                        error={errors.appointment_date}
                    >
                        <input
                            id="appointment_date"
                            name="appointment_date"
                            type="date"
                            value={formdata.appointment_date}
                            onChange={handleChange}
                            className={`${inputBase} ${inputState("appointment_date")} dark:[color-scheme:dark]`}
                        />
                    </Field>

                    <Field
                        label="Email"
                        htmlFor="email"
                        error={errors.email}
                        showCheck
                        isValid={isFieldValid("email")}
                    >
                        <input
                            id="email"
                            name="email"
                            type="email"
                            value={formdata.email}
                            onChange={handleChange}
                            placeholder="name@ministry.gov"
                            autoComplete="new-email"
                            className={`${inputBase} ${inputState("email")} ${isFieldValid("email") ? "pr-10" : ""}`}
                        />
                    </Field>

                    <Field
                        label="Initial Password"
                        htmlFor="password"
                        error={errors.password}
                        showCheck
                        isValid={isFieldValid("password")}
                        hint={<>Default: <span className="font-medium text-gray-700 dark:text-gray-300">Ministry@123</span> — you may set a custom password.</>}
                    >
                        <input
                            id="password"
                            name="password"
                            type="password"
                            value={formdata.password}
                            onChange={handleChange}
                            autoComplete="new-password"
                            className={`${inputBase} ${inputState("password")} ${isFieldValid("password") ? "pr-10" : ""}`}
                        />
                    </Field>
                </div>

                <div className="mt-8 flex items-center justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
                    
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Employee'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default CreateEmployee;