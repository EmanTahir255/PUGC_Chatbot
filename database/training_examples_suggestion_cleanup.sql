USE [PUGC_ChatbotDB];
GO

SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;
GO

/* ---------------------------------------------------------
   Purpose:
   1. Remove greeting/noise examples from training_examples
      so they do not appear as chatbot suggestions.
   2. Remove duplicate examples per intent.
   3. Insert clean suggestion-ready examples for key intents
      that currently fall back to weak or missing suggestions.
   --------------------------------------------------------- */

/* 1) Delete greeting / low-value examples from suggestion source */
DELETE te
FROM dbo.training_examples te
JOIN dbo.intents i
  ON i.intent_id = te.intent_id
WHERE
    i.intent_name IN ('greet', 'goodbye', 'thank_you', 'bot_introduction', 'fallback_help')
    OR LTRIM(RTRIM(LOWER(te.example_text))) IN (
        'hello',
        'hi',
        'hi there',
        'hey',
        'hey there',
        'assalamualaikum',
        'salam',
        'good morning',
        'good evening',
        'thanks',
        'thank you',
        'bye',
        'goodbye'
    );
GO

/* 2) Remove exact duplicate examples within the same intent */
;WITH duplicates AS (
    SELECT
        te.example_id,
        ROW_NUMBER() OVER (
            PARTITION BY te.intent_id, LTRIM(RTRIM(LOWER(te.example_text)))
            ORDER BY te.example_id
        ) AS rn
    FROM dbo.training_examples te
)
DELETE FROM duplicates
WHERE rn > 1;
GO

/* 3) Seed clean suggestion-ready examples for important intents */
DECLARE @seed TABLE (
    intent_name VARCHAR(150),
    example_text VARCHAR(500)
);

INSERT INTO @seed (intent_name, example_text)
VALUES
('ask_admissions_contact', 'How can I contact the admissions office?'),
('ask_admissions_contact', 'What is the admissions office phone number?'),
('ask_admissions_contact', 'What is the admissions office email address?'),
('ask_admissions_contact', 'Where is the admissions office located?'),

('ask_exam_office_contact', 'How can I contact the exam office?'),
('ask_exam_office_contact', 'What is the exam office phone number?'),
('ask_exam_office_contact', 'What is the exam office email address?'),
('ask_exam_office_contact', 'Where is the examination office located?'),

('ask_accounts_contact', 'How can I contact the accounts office?'),
('ask_accounts_contact', 'What is the accounts office phone number?'),
('ask_accounts_contact', 'What is the finance office email address?'),
('ask_accounts_contact', 'Where is the accounts office located?'),

('ask_it_support_contact', 'How can I contact IT support?'),
('ask_it_support_contact', 'What is the IT support phone number?'),
('ask_it_support_contact', 'What is the IT support email address?'),
('ask_it_support_contact', 'Who should I contact for portal issues?'),

('ask_main_contact', 'How can I contact PUGC?'),
('ask_main_contact', 'What is the main contact number of PUGC?'),
('ask_main_contact', 'What is the university email address?'),
('ask_main_contact', 'Where is PUGC located?'),

('ask_university_address', 'What is the address of PUGC?'),
('ask_university_address', 'Where is PUGC located?'),
('ask_university_address', 'How can I reach Punjab University Gujranwala Campus?'),
('ask_university_address', 'Show me the campus location of PUGC.'),

('ask_student_portal', 'How can I access the student portal?'),
('ask_student_portal', 'What is the student portal website?'),
('ask_student_portal', 'How do I log in to the student portal?'),
('ask_student_portal', 'Who should I contact if the portal is not working?'),

('ask_library_location', 'Where is the library located?'),
('ask_library_location', 'What is the location of the PUGC library?'),
('ask_library_location', 'How can I find the university library?'),
('ask_library_location', 'Show me the library location.'),

('ask_reading_room', 'Is there a reading room in the library?'),
('ask_reading_room', 'Where is the reading room located?'),
('ask_reading_room', 'What are the reading room timings?'),
('ask_reading_room', 'Is there a quiet study area in the library?'),

('ask_hostel_warden', 'Who is the hostel warden?'),
('ask_hostel_warden', 'How can I contact the hostel warden?'),
('ask_hostel_warden', 'Who is the warden for girls hostel?'),
('ask_hostel_warden', 'Who is the warden for boys hostel?'),

('ask_building_locations', 'Where is the Computer Science block located?'),
('ask_building_locations', 'Where is Block A at PUGC?'),
('ask_building_locations', 'How can I find different campus blocks?'),
('ask_building_locations', 'Show me the building locations at PUGC.'),

('ask_emergency_contacts', 'What are the emergency contact numbers at PUGC?'),
('ask_emergency_contacts', 'Who should I contact in an emergency at campus?'),
('ask_emergency_contacts', 'Give me the emergency helpline of PUGC.'),
('ask_emergency_contacts', 'What is the urgent help contact at PUGC?'),

('ask_department_office_hours', 'What are the office hours of the Computer Science department?'),
('ask_department_office_hours', 'What time does the Business Administration department office open?'),
('ask_department_office_hours', 'When can I visit the Mathematics department office?'),
('ask_department_office_hours', 'What are the office timings of the Economics department?'),

('ask_hod_contact', 'Who is the head of the Computer Science department?'),
('ask_hod_contact', 'How can I contact the head of the Business Administration department?'),
('ask_hod_contact', 'What is the email of the department head?'),
('ask_hod_contact', 'What are the office hours of the HOD?');

INSERT INTO dbo.training_examples (intent_id, example_text)
SELECT i.intent_id, s.example_text
FROM @seed s
JOIN dbo.intents i
  ON i.intent_name = s.intent_name
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.training_examples te
    WHERE te.intent_id = i.intent_id
      AND LTRIM(RTRIM(LOWER(te.example_text))) = LTRIM(RTRIM(LOWER(s.example_text)))
);
GO

/* 3b) Ensure every non-greeting intent has at least one training example */
DECLARE @coverageSeed TABLE (
    intent_name VARCHAR(150),
    example_text VARCHAR(500)
);

INSERT INTO @coverageSeed (intent_name, example_text)
VALUES
('ask_fee_deadline', 'when is the fee deadline'),
('ask_tuition_fee', 'what is the tuition fee'),
('ask_cs_fee', 'what is the fee for computer science'),
('ask_bba_fee', 'BBA fee'),
('ask_late_fee', 'what is the late fee'),
('ask_fee_payment_method', 'how to pay fee'),
('ask_scholarship', 'are scholarships available'),
('ask_scholarship_deadline', 'when is the scholarship deadline'),
('ask_fee_refund', 'can I get fee refund'),
('ask_hostel_fee', 'what is the hostel fee'),
('ask_transport_fee', 'what is the transport fee'),
('ask_admission_requirements', 'what are the admission requirements'),
('ask_admission_schedule', 'when is the last date for admission'),
('ask_entry_test_details', 'is there an entry test'),
('ask_merit_list', 'when will merit list come'),
('ask_documents_list', 'what documents are required for admission'),
('ask_transfer_policy', 'can I transfer from another university'),
('ask_foreign_student_admission', 'can foreign students apply'),
('ask_available_programs', 'what courses are offered'),
('ask_bs_cs_details', 'tell me about computer science program'),
('ask_bba_details', 'tell me about BBA program'),
('ask_program_duration', 'how long is the program'),
('ask_credit_hours', 'how many credit hours'),
('ask_elective_courses', 'what elective courses are available'),
('ask_phd_program', 'is there a PhD program'),
('ask_ms_program', 'MS program details'),
('ask_course_change', 'can I change my course'),
('ask_exam_schedule', 'when are the exams'),
('ask_result_date', 'when will results come'),
('ask_grading_system', 'what is the grading system'),
('ask_attendance_policy', 'what is the attendance policy'),
('ask_exam_rules', 'what are the exam rules'),
('ask_recheck_result', 'can I recheck my paper'),
('ask_backlog_exam', 'what is a backlog'),
('ask_library_hours', 'library timing'),
('ask_library_membership', 'how to get library membership'),
('ask_library_books', 'how many books can I borrow'),
('ask_library_fine', 'what is the library fine'),
('ask_digital_library', 'is there a digital library'),
('ask_hostel_availability', 'is hostel available'),
('ask_hostel_application', 'how to apply for hostel'),
('ask_hostel_rules', 'what are hostel rules'),
('ask_hostel_facilities', 'what facilities are in hostel'),
('ask_department_list', 'what departments are there'),
('ask_cs_department', 'tell me about CS department'),
('ask_bba_department', 'tell me about BBA department'),
('ask_hod_contact', 'how to contact head of department'),
('ask_dean_contact', 'how to contact the dean'),
('ask_vc_contact', 'who is the vice chancellor'),
('ask_dress_code', 'is there a dress code'),
('ask_mobile_phone_policy', 'can I use mobile phone in class'),
('ask_ragging_policy', 'what is the anti ragging policy'),
('ask_smoking_policy', 'is smoking allowed on campus'),
('ask_code_of_conduct', 'what is the code of conduct'),
('ask_plagiarism_policy', 'what is the plagiarism policy'),
('ask_student_id_card', 'how to get student ID card'),
('ask_semester_start', 'when does semester start'),
('ask_semester_end', 'when does semester end'),
('ask_holidays', 'what are the university holidays'),
('ask_winter_break', 'when is winter break'),
('ask_summer_break', 'when is summer break'),
('ask_add_drop', 'what is add drop period'),
('ask_semester_events', 'what events happen this semester'),
('ask_orientation', 'when is orientation'),
('ask_wifi', 'is there wifi on campus'),
('ask_cafeteria', 'where is the cafeteria'),
('ask_computer_lab', 'what are computer lab timings'),
('ask_sports_facilities', 'what sports facilities are available'),
('ask_transport', 'is there university transport'),
('ask_transport_routes', 'what bus routes are available'),
('ask_parking', 'is there parking available'),
('ask_health_center', 'is there a health center'),
('ask_prayer_area', 'is there a mosque on campus'),
('ask_atm', 'is there an ATM on campus'),
('ask_photocopying', 'where can I photocopy documents'),
('ask_main_contact', 'what is the contact number'),
('ask_university_address', 'what is the university address'),
('ask_student_portal', 'how to access student portal'),
('ask_transcript', 'how to get transcript'),
('ask_degree_certificate', 'when will I get my degree'),
('ask_character_certificate', 'how to get character certificate'),
('ask_migration_certificate', 'how to get migration certificate'),
('ask_enrollment_status', 'how to check enrollment status'),
('ask_registration', 'how to register for courses'),
('ask_dropout_policy', 'what happens if I leave university'),
('ask_student_societies', 'what student societies are there'),
('ask_sports_teams', 'does PUGC have sports teams'),
('ask_internship', 'does the university help with internships'),
('ask_alumni_network', 'is there an alumni network'),
('ask_counseling', 'is there a counseling service'),
('ask_research_facilities', 'what research facilities are available'),
('ask_final_year_project', 'how does final year project work'),
('ask_thesis', 'how to write thesis'),
('ask_quota_system', 'is there a quota system'),
('ask_matric_certificate', 'is matric certificate required'),
('ask_intermediate_certificate', 'is intermediate certificate required'),
('ask_cnic_requirement', 'is CNIC required'),
('ask_domicile_requirement', 'is domicile required'),
('ask_photos_requirement', 'how many photos are required'),
('ask_bs_math_details', 'tell me about BS mathematics'),
('ask_bs_english_details', 'tell me about BS English'),
('ask_course_prerequisites', 'what are the prerequisites for this course'),
('ask_course_instructor', 'who teaches this course'),
('ask_recommended_books', 'what books are recommended for this course'),
('ask_course_assessment', 'how is this course assessed'),
('ask_graduation_requirements', 'what are the requirements to graduate'),
('ask_cgpa_requirement', 'minimum CGPA to graduate'),
('ask_academic_calendar', 'where is the academic calendar'),
('ask_spring_semester_dates', 'when does spring semester start'),
('ask_fall_semester_dates', 'when does fall semester start'),
('ask_summer_semester', 'is there a summer semester'),
('ask_class_timetable', 'where is the class timetable'),
('ask_class_timings', 'what time do classes start'),
('ask_section_change', 'can I change my section'),
('ask_exam_system', 'how does the exam system work'),
('ask_seating_plan', 'where is my seating plan'),
('ask_provisional_certificate', 'how to get provisional certificate'),
('ask_attendance_shortage', 'what happens with attendance shortage'),
('ask_medical_leave', 'how to apply for medical leave'),
('ask_leave_application', 'how to apply for leave'),
('ask_grade_improvement', 'how to improve my grade'),
('ask_academic_probation', 'what is academic probation'),
('ask_distinction', 'how to get distinction'),
('ask_registration_deadline', 'when is course registration deadline'),
('ask_late_registration', 'can I register after deadline'),
('ask_withdrawal_policy', 'what happens if I withdraw from a course'),
('ask_study_plan', 'how to make study plan'),
('ask_internship_report', 'how to write internship report'),
('ask_fyp_supervisor', 'how to select FYP supervisor'),
('ask_fyp_topic', 'how to select FYP topic'),
('ask_fyp_evaluation', 'how is FYP evaluated'),
('ask_thesis_format', 'what is the thesis format'),
('ask_convocation', 'when is convocation'),
('ask_graduation_eligibility', 'am I eligible to graduate'),
('ask_migration_policy', 'migration policy at PUGC'),
('ask_noc_process', 'how to get NOC'),
('ask_scholarship_renewal', 'how to renew scholarship'),
('ask_scholarship_cancellation', 'when is scholarship cancelled'),
('ask_student_loan', 'are student loans available'),
('ask_installment_plan', 'can I pay fee in installments'),
('ask_document_verification', 'how to get documents verified'),
('ask_library_general', 'tell me about the library'),
('ask_library_location', 'where is the library'),
('ask_library_catalog', 'how to search books in library'),
('ask_library_reservation', 'can I reserve a book'),
('ask_reading_room', 'is there a reading room'),
('ask_hostel_warden', 'who is the hostel warden'),
('ask_gym_facility', 'is there a gym at PUGC'),
('ask_lab_software', 'what software is in computer lab'),
('ask_lab_booking', 'how to book computer lab'),
('ask_wifi_problems', 'wifi is not working'),
('ask_campus_security', 'what security is on campus'),
('ask_lost_found', 'I lost something on campus'),
('ask_building_locations', 'where is Block C'),
('ask_public_transport', 'how to reach PUGC by public transport'),
('ask_career_services', 'what career services does PUGC offer'),
('ask_job_placement', 'does PUGC help with job placement'),
('ask_cv_building', 'help with CV'),
('ask_interview_preparation', 'interview preparation help'),
('ask_cs_society', 'tell me about CS society'),
('ask_event_registration', 'how to register for event'),
('ask_event_eligibility', 'who can participate in events'),
('ask_exchange_program', 'is there international exchange program'),
('ask_industry_partnerships', 'does PUGC have industry partners'),
('ask_entrepreneurship', 'entrepreneurship support at PUGC'),
('ask_complaint_system', 'how to file a complaint'),
('ask_admissions_contact', 'admissions office number'),
('ask_exam_office_contact', 'examination office contact'),
('ask_accounts_contact', 'accounts office contact'),
('ask_it_support_contact', 'IT support contact'),
('ask_emergency_contacts', 'emergency numbers PUGC'),
('ask_department_events', 'department events'),
('ask_department_office_hours', 'department office hours'),
('ask_online_resources', 'online study resources'),
('ask_id_card_replacement', 'lost my ID card'),
('ask_no_dues_certificate', 'what is clearance process');

INSERT INTO dbo.training_examples (intent_id, example_text)
SELECT i.intent_id, s.example_text
FROM @coverageSeed s
JOIN dbo.intents i
  ON i.intent_name = s.intent_name
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.training_examples te
    WHERE te.intent_id = i.intent_id
);
GO

/* 4) Verification queries */
SELECT i.intent_name, te.example_text
FROM dbo.training_examples te
JOIN dbo.intents i
  ON i.intent_id = te.intent_id
WHERE i.intent_name IN ('greet', 'goodbye', 'thank_you', 'bot_introduction', 'fallback_help')
ORDER BY i.intent_name, te.example_text;
GO

SELECT i.intent_name
FROM dbo.intents i
LEFT JOIN dbo.training_examples te
  ON te.intent_id = i.intent_id
WHERE te.intent_id IS NULL
ORDER BY i.intent_name;
GO

SELECT i.intent_name, COUNT(*) AS example_count
FROM dbo.training_examples te
JOIN dbo.intents i
  ON i.intent_id = te.intent_id
WHERE i.intent_name IN (
    'ask_admissions_contact',
    'ask_exam_office_contact',
    'ask_accounts_contact',
    'ask_it_support_contact',
    'ask_main_contact',
    'ask_university_address',
    'ask_student_portal',
    'ask_library_location',
    'ask_reading_room',
    'ask_hostel_warden',
    'ask_building_locations',
    'ask_emergency_contacts',
    'ask_department_office_hours',
    'ask_hod_contact'
)
GROUP BY i.intent_name
ORDER BY i.intent_name;
GO

COMMIT TRANSACTION;
GO
