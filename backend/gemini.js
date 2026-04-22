const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Extract intent keyword from question using Groq
async function extractIntentFromQuestion(userMessage) {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are an intent classifier for PUGC university chatbot. 
Given a student question, return ONLY a single database intent name from this list (return exactly as written, nothing else):

ask_admission_general, ask_eligibility_criteria, ask_entry_test_details, ask_merit_formula,
ask_fee_structure, ask_cs_fee, ask_bba_fee, ask_hostel_general, ask_hostel_fee,
ask_library_hours, ask_transport, ask_exam_system, ask_grading_system, ask_cgpa_requirement,
ask_merit_scholarship, ask_need_based_scholarship, ask_scholarship, ask_contact_number,
ask_campus_location, ask_bs_cs_details, ask_bs_se_details, ask_bs_it_details,
ask_bba_details, ask_ms_cs_details, ask_phd_general, ask_fyp_general, ask_internship,
ask_hostel_availability, ask_hostel_facilities, ask_transport_routes, ask_department_list,
ask_academic_calendar, ask_graduation_requirements, ask_attendance_policy, ask_result_portal,
ask_student_portal, ask_wifi_details, ask_sports_facilities, ask_cafeteria_menu,
ask_computer_lab, ask_parking, ask_health_center, ask_counseling, ask_job_placement,
ask_cv_building, ask_fee_payment_method, ask_fee_deadline, ask_late_fee, ask_dress_code,
ask_hostel_rules, ask_exam_rules, ask_plagiarism_policy, ask_transcript, ask_degree_certificate,
ask_character_certificate, ask_student_id_card, ask_registration, ask_class_timetable,
ask_course_list, ask_section_change, ask_cgpa_calculation, ask_grading_scale,
ask_academic_probation, ask_distinction, ask_supplementary_exam, ask_result_announcement,
ask_datesheet, ask_passing_marks, ask_attendance_shortage, ask_medical_leave,
ask_scholarship_deadline, ask_scholarship_application, ask_financial_aid, ask_fee_refund,
ask_hostel_application, ask_hostel_warden, ask_library_books, ask_library_fine,
ask_digital_library, ask_sports_general, ask_gym_facility, ask_transport_registration,
ask_health_center, ask_emergency_contacts, ask_lost_found, ask_campus_security,
ask_student_societies, ask_internship_requirement, ask_alumni, ask_events_general,
ask_convocation, ask_orientation, ask_semester_start, ask_holidays, ask_fyp_supervisor,
ask_thesis_general, ask_research_opportunities, ask_complaint_system, ask_no_dues_certificate,
ask_clearance_process, ask_dropout_policy, ask_withdrawal_policy, ask_add_drop_process

If the question does not match any intent, return: NONE`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      max_tokens: 50,
      temperature: 0.1,
    });

    const result = completion.choices[0].message.content.trim();
    return result === "NONE" ? null : result;
  } catch (error) {
    console.error("Intent extraction error:", error.message);
    return null;
  }
}

// General AI response when DB has no answer
async function getGroqResponse(userMessage, conversationHistory = []) {
    try {
        const messages = [
            {
                role: 'system',
                content: `You are PUGC SmartBot, a helpful virtual assistant for Punjab University Gujranwala Campus (PUGC) in Pakistan.

Rules:
- Only answer questions related to PUGC, university life, academics, admissions, fees, hostel, library, departments, exams, scholarships, and student services
- If unrelated to university, say you can only help with PUGC related queries
- Keep answers concise and helpful
- Formal but friendly tone
- If unsure about specific PUGC details, give general guidance and suggest contacting PUGC at 055-9200001
- Use conversation history to understand follow-up questions and references like "its fee", "tell me more", "what about that"

IMPORTANT FORMATTING RULES:
- Always start with a bold heading using <b>heading</b>
- Use <br> for line breaks
- Use <ul><li>item</li></ul> for lists
- Use <b>text</b> for important values like numbers, fees, dates
- Never use markdown symbols like ** or ## or * for bullets
- Always end with contact info if relevant`
            },
            ...conversationHistory,
            {
                role: 'user',
                content: userMessage
            }
        ];

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: messages,
            max_tokens: 500,
            temperature: 0.7
        });

        return completion.choices[0].message.content;

    } catch (error) {
        console.error('Groq error:', error.message);
        return null;
    }
}

module.exports = { extractIntentFromQuestion, getGroqResponse };
