/**
 * Database schema metadata for the LLM to understand what data is available.
 * This is used for semantic query extraction.
 */
const DB_SCHEMA = {
    departments: {
        description: "Contains information about university departments and their heads.",
        columns: {
            dept_name: "The full name of the department",
            head_name: "Name of the Head of Department (HOD)",
            contact_number: "Phone number of the department office",
            email: "Official email address of the department",
            block_location: "The block or building name where the department is located",
            room_number: "Specific room number of the department office",
            office_hours: "Operational hours for the department office"
        },
        primary_key: "department_id",
        name_column: "dept_name"
    },
    programs: {
        description: "Contains details about academic programs (degrees) offered by PUGC.",
        columns: {
            program_name: "Full name of the program (e.g., BS Computer Science)",
            program_level: "Degree level (BS, MS, PhD)",
            duration_years: "Total duration of the program in years",
            total_semesters: "Total number of semesters in the program",
            total_credit_hrs: "Total credit hours required for graduation",
            total_seats: "Number of students admitted per intake",
            description: "A brief overview or summary of the program"
        },
        primary_key: "program_id",
        name_column: "program_name",
        foreign_keys: {
            department_id: "departments"
        }
    },
    fee_structure: {
        description: "Contains detailed fee amounts for various programs and fee types.",
        columns: {
            amount: "The numeric cost of the specific fee type",
            effective_from: "Date from which this fee amount became valid",
            effective_to: "Date until which this fee amount is valid (null means current)"
        },
        primary_key: "fee_structure_id",
        foreign_keys: {
            program_id: "programs",
            fee_type_id: "fee_types"
        }
    },
    scholarships: {
        description: "Contains information about available scholarship opportunities, deadlines, and dates.",
        columns: {
            application_deadline: "Last date to apply for the scholarship",
            interview_date: "Date scheduled for scholarship interviews",
            announcement_date: "Date when scholarship results are announced",
            max_beneficiaries: "Maximum number of students who can receive this scholarship",
            is_active: "Boolean (1/0) indicating if the scholarship is currently open"
        },
        primary_key: "scholarship_id",
        foreign_keys: {
            scholarship_type_id: "scholarship_types",
            semester_id: "semesters"
        }
    },
    events: {
        description: "Contains information about campus events, workshops, seminars, and trips.",
        columns: {
            event_name: "The title of the event",
            event_date: "Starting date of the event",
            event_end_date: "Ending date of the event",
            venue: "Location where the event is held",
            description: "Detailed description of the event purpose and activities",
            registration_required: "Boolean (1/0) if students need to register",
            registration_deadline: "Last date to register for the event",
            is_active: "Boolean (1/0) if the event is still planned/valid"
        },
        primary_key: "event_id",
        name_column: "event_name",
        foreign_keys: {
            event_type_id: "event_types",
            semester_id: "semesters"
        }
    }
};

module.exports = DB_SCHEMA;
