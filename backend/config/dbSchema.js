// PUGC DB Schema - Defines safe tables/columns for dynamic queries

module.exports = {
  allowedTables: [
    'departments',
    'programs', 
    'fee_types',
    'fee_structure',
    'scholarship_types',
    'scholarships',
    'events',
    'event_types',
    'semesters'
  ],
  
  tableSchema: {
    departments: {
      columns: ['department_id', 'dept_name', 'head_name', 'contact_number', 'email', 'office_hours', 'block_location', 'room_number'],
      description: 'University departments with HOD/contact info'
    },
    programs: {
      columns: ['program_id', 'program_name', 'program_level', 'department_id', 'duration_years', 'total_semesters', 'total_credit_hrs', 'total_seats', 'description'],
      description: 'Academic programs with duration/credits'
    },
    fee_types: {
      columns: ['fee_type_id', 'fee_type_name'],
      description: 'Types of fees (tuition, admission, etc)'
    },
    fee_structure: {
      columns: ['program_id', 'fee_type_id', 'amount', 'effective_from', 'effective_to', 'semester_id'],
      description: 'Program-wise fee amounts by semester'
    },
    scholarship_types: {
      columns: ['scholarship_type_id', 'type_name', 'funding_source', 'min_cgpa_required', 'benefit_percentage', 'max_family_income', 'is_renewable'],
      description: 'Scholarship types with eligibility'
    },
    scholarships: {
      columns: ['scholarship_id', 'scholarship_type_id', 'semester_id', 'application_deadline', 'interview_date', 'announcement_date', 'is_active'],
      description: 'Active scholarship opportunities'
    },
    events: {
      columns: ['event_id', 'event_name', 'event_type_id', 'event_date', 'event_end_date', 'venue', 'description', 'registration_required', 'is_active'],
      description: 'Campus events/seminars'
    },
    event_types: {
      columns: ['event_type_id', 'type_name'],
      description: 'Event categories (workshop, orientation)'
    },
    semesters: {
      columns: ['semester_id', 'semester_name', 'year', 'semester_type'],
      description: 'Academic semesters for filtering'
    }
  },

  // Suggested JOINs for common queries
  commonJoins: {
    program_fees: 'programs p JOIN fee_structure fs ON p.program_id = fs.program_id JOIN fee_types ft ON fs.fee_type_id = ft.fee_type_id',
    dept_programs: 'programs p JOIN departments d ON p.department_id = d.department_id'
  }
};
