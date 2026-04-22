USE [PUGC_ChatbotDB];
GO

SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

DECLARE @IntentMap TABLE (
    old_intent_name varchar(150) NOT NULL PRIMARY KEY,
    new_intent_name varchar(150) NOT NULL
);

INSERT INTO @IntentMap (old_intent_name, new_intent_name) VALUES
('ask_admission_general', 'ask_admission_requirements'),
('ask_eligibility_criteria', 'ask_admission_requirements'),
('ask_admission_last_date', 'ask_admission_schedule'),
('ask_admission_test', 'ask_entry_test_details'),
('ask_documents_required', 'ask_documents_list'),
('ask_transfer_admission', 'ask_transfer_policy'),
('ask_course_list', 'ask_available_programs'),
('ask_bs_programs', 'ask_available_programs'),
('ask_course_outline', 'ask_available_programs'),
('ask_department_programs', 'ask_available_programs'),
('ask_cs_program', 'ask_bs_cs_details'),
('ask_bs_se_details', 'ask_bs_cs_details'),
('ask_bs_it_details', 'ask_bs_cs_details'),
('ask_bba_program', 'ask_bba_details'),
('ask_bs_commerce_details', 'ask_bba_details'),
('ask_mba_details', 'ask_bba_details'),
('ask_ms_programs', 'ask_ms_program'),
('ask_ms_cs_details', 'ask_ms_program'),
('ask_ms_admission_requirements', 'ask_ms_program'),
('ask_ms_thesis_coursework', 'ask_ms_program'),
('ask_phd_general', 'ask_phd_program'),
('ask_phd_eligibility', 'ask_phd_program'),
('ask_phd_duration', 'ask_phd_program'),
('ask_phd_research', 'ask_phd_program'),
('ask_total_credit_hours', 'ask_credit_hours'),
('ask_lab_requirements', 'ask_computer_lab'),
('ask_computer_lab_general', 'ask_computer_lab'),
('ask_exam_datesheet', 'ask_exam_schedule'),
('ask_datesheet', 'ask_exam_schedule'),
('ask_midterm_exam', 'ask_exam_schedule'),
('ask_final_exam', 'ask_exam_schedule'),
('ask_result_announcement', 'ask_result_date'),
('ask_result_portal', 'ask_result_date'),
('ask_rechecking_process', 'ask_recheck_result'),
('ask_grading_scale', 'ask_grading_system'),
('ask_cgpa_calculation', 'ask_grading_system'),
('ask_passing_marks', 'ask_grading_system'),
('ask_attendance_rules', 'ask_attendance_policy'),
('ask_exam_attendance_requirement', 'ask_attendance_policy'),
('ask_unfair_means', 'ask_exam_rules'),
('ask_supplementary_exam', 'ask_backlog_exam'),
('ask_improvement_exam', 'ask_backlog_exam'),
('ask_departments_list', 'ask_department_list'),
('ask_faculty_list', 'ask_department_list'),
('ask_fee_structure', 'ask_tuition_fee'),
('ask_fee_components', 'ask_tuition_fee'),
('ask_fee_payment_banks', 'ask_fee_payment_method'),
('ask_challan_generation', 'ask_fee_payment_method'),
('ask_online_fee_payment', 'ask_fee_payment_method'),
('ask_fee_refund_policy', 'ask_fee_refund'),
('ask_merit_scholarship', 'ask_scholarship'),
('ask_need_based_scholarship', 'ask_scholarship'),
('ask_government_scholarship', 'ask_scholarship'),
('ask_external_scholarship', 'ask_scholarship'),
('ask_financial_aid', 'ask_scholarship'),
('ask_scholarship_application', 'ask_scholarship'),
('ask_hostel_general', 'ask_hostel_availability'),
('ask_hostel_types', 'ask_hostel_availability'),
('ask_hostel_documents', 'ask_hostel_application'),
('ask_mess_facility', 'ask_hostel_facilities'),
('ask_hostel_visitor_policy', 'ask_hostel_rules'),
('ask_hostel_security', 'ask_hostel_rules'),
('ask_hostel_curfew', 'ask_hostel_rules'),
('ask_transport_general', 'ask_transport'),
('ask_transport_registration', 'ask_transport'),
('ask_bus_timing', 'ask_transport_routes'),
('ask_cafeteria_menu', 'ask_cafeteria'),
('ask_cafeteria_prices', 'ask_cafeteria'),
('ask_medical_services', 'ask_health_center'),
('ask_emergency_medical', 'ask_health_center'),
('ask_sports_general', 'ask_sports_facilities'),
('ask_sports_teams_joining', 'ask_sports_teams'),
('ask_wifi_details', 'ask_wifi'),
('ask_parking_details', 'ask_parking'),
('ask_campus_location', 'ask_university_address'),
('ask_contact_number', 'ask_main_contact'),
('ask_alumni', 'ask_alumni_network'),
('ask_student_clubs', 'ask_student_societies'),
('ask_events_general', 'ask_semester_events'),
('ask_workshop_details', 'ask_semester_events'),
('ask_seminar_schedule', 'ask_semester_events'),
('ask_sports_competition', 'ask_semester_events'),
('ask_cultural_festival', 'ask_semester_events'),
('ask_research_opportunities', 'ask_research_facilities'),
('ask_research_areas', 'ask_research_facilities'),
('ask_registration_process', 'ask_registration'),
('ask_add_drop_process', 'ask_add_drop'),
('ask_add_drop_deadline', 'ask_add_drop'),
('ask_internship_requirement', 'ask_internship'),
('ask_internship_process', 'ask_internship'),
('ask_fyp_general', 'ask_final_year_project'),
('ask_thesis_general', 'ask_thesis'),
('ask_character_certificate_docs', 'ask_character_certificate'),
('ask_student_portal_help', 'ask_student_portal'),
('ask_clearance_process', 'ask_no_dues_certificate'),
('ask_merit_formula', 'ask_merit_list'),
('ask_transcript_process', 'ask_transcript'),
('ask_degree_collection', 'ask_degree_certificate'),
('ask_academic_advisor', 'ask_counseling');

DECLARE
    @OldName varchar(150),
    @NewName varchar(150),
    @OldId int,
    @NewId int;

DECLARE intent_cursor CURSOR LOCAL FAST_FORWARD FOR
SELECT old_intent_name, new_intent_name
FROM @IntentMap
ORDER BY new_intent_name, old_intent_name;

OPEN intent_cursor;
FETCH NEXT FROM intent_cursor INTO @OldName, @NewName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SELECT @OldId = intent_id FROM dbo.intents WHERE intent_name = @OldName;
    SELECT @NewId = intent_id FROM dbo.intents WHERE intent_name = @NewName;

    IF @OldId IS NOT NULL
    BEGIN
        IF @NewId IS NULL
        BEGIN
            UPDATE dbo.intents
            SET intent_name = @NewName
            WHERE intent_id = @OldId;
        END
        ELSE IF @OldId <> @NewId
        BEGIN
            UPDATE dbo.faq_answers
            SET intent_id = @NewId
            WHERE intent_id = @OldId;

            UPDATE dbo.training_examples
            SET intent_id = @NewId
            WHERE intent_id = @OldId;

            DELETE FROM dbo.intents
            WHERE intent_id = @OldId;
        END
    END

    SET @OldId = NULL;
    SET @NewId = NULL;

    FETCH NEXT FROM intent_cursor INTO @OldName, @NewName;
END

CLOSE intent_cursor;
DEALLOCATE intent_cursor;

COMMIT TRANSACTION;
GO

SELECT
    i.intent_name,
    COUNT(fa.answer_id) AS active_answer_count
FROM dbo.intents AS i
LEFT JOIN dbo.faq_answers AS fa
    ON fa.intent_id = i.intent_id
    AND fa.is_active = 1
GROUP BY i.intent_name
ORDER BY i.intent_name;
GO

SELECT
    m.old_intent_name AS old_name_still_present,
    m.new_intent_name AS expected_canonical_name
FROM (VALUES
    ('ask_admission_general', 'ask_admission_requirements'),
    ('ask_eligibility_criteria', 'ask_admission_requirements'),
    ('ask_admission_last_date', 'ask_admission_schedule'),
    ('ask_admission_test', 'ask_entry_test_details'),
    ('ask_documents_required', 'ask_documents_list'),
    ('ask_transfer_admission', 'ask_transfer_policy'),
    ('ask_course_list', 'ask_available_programs'),
    ('ask_bs_programs', 'ask_available_programs'),
    ('ask_course_outline', 'ask_available_programs'),
    ('ask_department_programs', 'ask_available_programs'),
    ('ask_cs_program', 'ask_bs_cs_details'),
    ('ask_bs_se_details', 'ask_bs_cs_details'),
    ('ask_bs_it_details', 'ask_bs_cs_details'),
    ('ask_bba_program', 'ask_bba_details'),
    ('ask_bs_commerce_details', 'ask_bba_details'),
    ('ask_mba_details', 'ask_bba_details'),
    ('ask_ms_programs', 'ask_ms_program'),
    ('ask_ms_cs_details', 'ask_ms_program'),
    ('ask_ms_admission_requirements', 'ask_ms_program'),
    ('ask_ms_thesis_coursework', 'ask_ms_program'),
    ('ask_phd_general', 'ask_phd_program'),
    ('ask_phd_eligibility', 'ask_phd_program'),
    ('ask_phd_duration', 'ask_phd_program'),
    ('ask_phd_research', 'ask_phd_program'),
    ('ask_total_credit_hours', 'ask_credit_hours'),
    ('ask_lab_requirements', 'ask_computer_lab'),
    ('ask_computer_lab_general', 'ask_computer_lab'),
    ('ask_exam_datesheet', 'ask_exam_schedule'),
    ('ask_datesheet', 'ask_exam_schedule'),
    ('ask_midterm_exam', 'ask_exam_schedule'),
    ('ask_final_exam', 'ask_exam_schedule'),
    ('ask_result_announcement', 'ask_result_date'),
    ('ask_result_portal', 'ask_result_date'),
    ('ask_rechecking_process', 'ask_recheck_result'),
    ('ask_grading_scale', 'ask_grading_system'),
    ('ask_cgpa_calculation', 'ask_grading_system'),
    ('ask_passing_marks', 'ask_grading_system'),
    ('ask_attendance_rules', 'ask_attendance_policy'),
    ('ask_exam_attendance_requirement', 'ask_attendance_policy'),
    ('ask_unfair_means', 'ask_exam_rules'),
    ('ask_supplementary_exam', 'ask_backlog_exam'),
    ('ask_improvement_exam', 'ask_backlog_exam'),
    ('ask_departments_list', 'ask_department_list'),
    ('ask_faculty_list', 'ask_department_list'),
    ('ask_fee_structure', 'ask_tuition_fee'),
    ('ask_fee_components', 'ask_tuition_fee'),
    ('ask_fee_payment_banks', 'ask_fee_payment_method'),
    ('ask_challan_generation', 'ask_fee_payment_method'),
    ('ask_online_fee_payment', 'ask_fee_payment_method'),
    ('ask_fee_refund_policy', 'ask_fee_refund'),
    ('ask_merit_scholarship', 'ask_scholarship'),
    ('ask_need_based_scholarship', 'ask_scholarship'),
    ('ask_government_scholarship', 'ask_scholarship'),
    ('ask_external_scholarship', 'ask_scholarship'),
    ('ask_financial_aid', 'ask_scholarship'),
    ('ask_scholarship_application', 'ask_scholarship'),
    ('ask_hostel_general', 'ask_hostel_availability'),
    ('ask_hostel_types', 'ask_hostel_availability'),
    ('ask_hostel_documents', 'ask_hostel_application'),
    ('ask_mess_facility', 'ask_hostel_facilities'),
    ('ask_hostel_visitor_policy', 'ask_hostel_rules'),
    ('ask_hostel_security', 'ask_hostel_rules'),
    ('ask_hostel_curfew', 'ask_hostel_rules'),
    ('ask_transport_general', 'ask_transport'),
    ('ask_transport_registration', 'ask_transport'),
    ('ask_bus_timing', 'ask_transport_routes'),
    ('ask_cafeteria_menu', 'ask_cafeteria'),
    ('ask_cafeteria_prices', 'ask_cafeteria'),
    ('ask_medical_services', 'ask_health_center'),
    ('ask_emergency_medical', 'ask_health_center'),
    ('ask_sports_general', 'ask_sports_facilities'),
    ('ask_sports_teams_joining', 'ask_sports_teams'),
    ('ask_wifi_details', 'ask_wifi'),
    ('ask_parking_details', 'ask_parking'),
    ('ask_campus_location', 'ask_university_address'),
    ('ask_contact_number', 'ask_main_contact'),
    ('ask_alumni', 'ask_alumni_network'),
    ('ask_student_clubs', 'ask_student_societies'),
    ('ask_events_general', 'ask_semester_events'),
    ('ask_workshop_details', 'ask_semester_events'),
    ('ask_seminar_schedule', 'ask_semester_events'),
    ('ask_sports_competition', 'ask_semester_events'),
    ('ask_cultural_festival', 'ask_semester_events'),
    ('ask_research_opportunities', 'ask_research_facilities'),
    ('ask_research_areas', 'ask_research_facilities'),
    ('ask_registration_process', 'ask_registration'),
    ('ask_add_drop_process', 'ask_add_drop'),
    ('ask_add_drop_deadline', 'ask_add_drop'),
    ('ask_internship_requirement', 'ask_internship'),
    ('ask_internship_process', 'ask_internship'),
    ('ask_fyp_general', 'ask_final_year_project'),
    ('ask_thesis_general', 'ask_thesis'),
    ('ask_character_certificate_docs', 'ask_character_certificate'),
    ('ask_student_portal_help', 'ask_student_portal'),
    ('ask_clearance_process', 'ask_no_dues_certificate'),
    ('ask_merit_formula', 'ask_merit_list'),
    ('ask_transcript_process', 'ask_transcript'),
    ('ask_degree_collection', 'ask_degree_certificate'),
    ('ask_academic_advisor', 'ask_counseling')
) AS m(old_intent_name, new_intent_name)
JOIN dbo.intents AS i
    ON i.intent_name = m.old_intent_name
ORDER BY m.old_intent_name;
GO


/* above script merdged duplicate or similar intents in db8 */

