# Intent Consolidation Notes

This file documents the duplicate or near-duplicate Rasa intent labels that were merged to reduce classifier confusion.
The implementation is in `domain.yml` and `data/nlu.yml`; this note is not loaded by Rasa training.

## Canonical intent mappings

- `ask_admission_requirements` now includes examples from: `ask_admission_general`, `ask_eligibility_criteria`
- `ask_admission_schedule` now includes examples from: `ask_admission_last_date`
- `ask_entry_test_details` now includes examples from: `ask_admission_test`
- `ask_documents_list` now includes examples from: `ask_documents_required`
- `ask_transfer_policy` now includes examples from: `ask_transfer_admission`
- `ask_available_programs` now includes examples from: `ask_course_list`, `ask_bs_programs`, `ask_course_outline`, `ask_department_programs`
- `ask_bs_cs_details` now includes examples from: `ask_cs_program`, `ask_bs_se_details`, `ask_bs_it_details`
- `ask_bba_details` now includes examples from: `ask_bba_program`, `ask_bs_commerce_details`, `ask_mba_details`
- `ask_ms_program` now includes examples from: `ask_ms_programs`, `ask_ms_cs_details`, `ask_ms_admission_requirements`, `ask_ms_thesis_coursework`
- `ask_phd_program` now includes examples from: `ask_phd_general`, `ask_phd_eligibility`, `ask_phd_duration`, `ask_phd_research`
- `ask_credit_hours` now includes examples from: `ask_total_credit_hours`
- `ask_computer_lab` now includes examples from: `ask_lab_requirements`, `ask_computer_lab_general`
- `ask_exam_schedule` now includes examples from: `ask_exam_datesheet`, `ask_datesheet`, `ask_midterm_exam`, `ask_final_exam`
- `ask_result_date` now includes examples from: `ask_result_announcement`, `ask_result_portal`
- `ask_recheck_result` now includes examples from: `ask_rechecking_process`
- `ask_grading_system` now includes examples from: `ask_grading_scale`, `ask_cgpa_calculation`, `ask_passing_marks`
- `ask_attendance_policy` now includes examples from: `ask_attendance_rules`, `ask_exam_attendance_requirement`
- `ask_exam_rules` now includes examples from: `ask_unfair_means`
- `ask_backlog_exam` now includes examples from: `ask_supplementary_exam`, `ask_improvement_exam`
- `ask_department_list` now includes examples from: `ask_departments_list`, `ask_faculty_list`
- `ask_tuition_fee` now includes examples from: `ask_fee_structure`, `ask_fee_components`
- `ask_fee_payment_method` now includes examples from: `ask_fee_payment_banks`, `ask_challan_generation`, `ask_online_fee_payment`
- `ask_fee_refund` now includes examples from: `ask_fee_refund_policy`
- `ask_scholarship` now includes examples from: `ask_merit_scholarship`, `ask_need_based_scholarship`, `ask_government_scholarship`, `ask_external_scholarship`, `ask_financial_aid`, `ask_scholarship_application`
- `ask_hostel_availability` now includes examples from: `ask_hostel_general`, `ask_hostel_types`
- `ask_hostel_application` now includes examples from: `ask_hostel_documents`
- `ask_hostel_facilities` now includes examples from: `ask_mess_facility`
- `ask_hostel_rules` now includes examples from: `ask_hostel_visitor_policy`, `ask_hostel_security`, `ask_hostel_curfew`
- `ask_transport` now includes examples from: `ask_transport_general`, `ask_transport_registration`
- `ask_transport_routes` now includes examples from: `ask_bus_timing`
- `ask_cafeteria` now includes examples from: `ask_cafeteria_menu`, `ask_cafeteria_prices`
- `ask_health_center` now includes examples from: `ask_medical_services`, `ask_emergency_medical`
- `ask_sports_facilities` now includes examples from: `ask_sports_general`
- `ask_sports_teams` now includes examples from: `ask_sports_teams_joining`
- `ask_wifi` now includes examples from: `ask_wifi_details`
- `ask_parking` now includes examples from: `ask_parking_details`
- `ask_university_address` now includes examples from: `ask_campus_location`
- `ask_main_contact` now includes examples from: `ask_contact_number`
- `ask_alumni_network` now includes examples from: `ask_alumni`
- `ask_student_societies` now includes examples from: `ask_student_clubs`
- `ask_semester_events` now includes examples from: `ask_events_general`, `ask_workshop_details`, `ask_seminar_schedule`, `ask_sports_competition`, `ask_cultural_festival`
- `ask_research_facilities` now includes examples from: `ask_research_opportunities`, `ask_research_areas`
- `ask_registration` now includes examples from: `ask_registration_process`
- `ask_add_drop` now includes examples from: `ask_add_drop_process`, `ask_add_drop_deadline`
- `ask_internship` now includes examples from: `ask_internship_requirement`, `ask_internship_process`
- `ask_final_year_project` now includes examples from: `ask_fyp_general`
- `ask_thesis` now includes examples from: `ask_thesis_general`
- `ask_character_certificate` now includes examples from: `ask_character_certificate_docs`
- `ask_student_portal` now includes examples from: `ask_student_portal_help`
- `ask_no_dues_certificate` now includes examples from: `ask_clearance_process`

## Additional validation cleanup

- `ask_merit_list` now also includes examples from `ask_merit_formula`.
- `ask_transcript` now also includes examples from `ask_transcript_process`.
- `ask_degree_certificate` now also includes examples from `ask_degree_collection`.
- `ask_counseling` now also includes examples from `ask_academic_advisor`.
- Exact duplicate example sentences found by `rasa data validate` were kept under one best-fit intent only.
